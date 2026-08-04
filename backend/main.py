"""FastAPI backend for bilingual voice chatbot."""

import os
import json
import time
import base64
import asyncio
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from language_detector import detect_language
from groq_client import generate_response_stream
from groq_whisper_stt import transcribe_audio
from edge_tts_engine import synthesize_stream
from usage_tracker import stats

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://bilingual-voice-chatbot.vercel.app",
    "https://bilingual-voice-chatbot-hariganesh0508.vercel.app",
    os.getenv("FRONTEND_URL", ""),
]

RATE_LIMIT_WINDOW = 10
RATE_LIMIT_MAX = 10


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting bilingual voice chatbot backend")
    yield
    stats.log_summary()
    logger.info("Shutting down")


app = FastAPI(title="Bilingual Voice Chatbot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClientRateLimiter:
    def __init__(self):
        self._requests: dict[str, list[float]] = {}

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        if client_id not in self._requests:
            self._requests[client_id] = []
        self._requests[client_id] = [
            t for t in self._requests[client_id] if now - t < RATE_LIMIT_WINDOW
        ]
        if len(self._requests[client_id]) >= RATE_LIMIT_MAX:
            return False
        self._requests[client_id].append(now)
        return True


rate_limiter = ClientRateLimiter()


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    client_id = f"{websocket.client.host}:{websocket.client.port}"
    history: list[dict] = []
    detected_language = "en"

    await _send(websocket, "session_info", {"client_id": client_id})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, "error", {"message": "Invalid JSON"})
                continue

            event_type = msg.get("type")

            if event_type == "user_text":
                await _handle_text(websocket, msg, client_id, history)

            elif event_type == "user_audio":
                await _handle_audio(websocket, msg, client_id, history)

            elif event_type == "ping":
                await _send(websocket, "pong", {})

    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
        stats.log_summary()
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        stats.log_error(f"WebSocket: {e}")


async def _send(ws: WebSocket, event_type: str, data: dict = None):
    payload = {"type": event_type}
    if data:
        payload.update(data)
    try:
        await ws.send_text(json.dumps(payload))
    except Exception:
        pass


async def _handle_text(ws, msg, client_id, history):
    if not rate_limiter.is_allowed(client_id):
        await _send(ws, "error", {"message": "Rate limit. Please wait."})
        return

    user_text = msg.get("text", "").strip()
    if not user_text:
        return

    lang = detect_language(user_text)
    await _send(ws, "transcript", {"text": user_text, "language": lang})

    history.append({"role": "user", "text": user_text})
    if len(history) > 20:
        history = history[-20:]

    await _process_and_respond(ws, user_text, lang, history)


async def _handle_audio(ws, msg, client_id, history):
    if not rate_limiter.is_allowed(client_id):
        await _send(ws, "error", {"message": "Rate limit. Please wait."})
        return

    audio_b64 = msg.get("data", "")
    mime_type = msg.get("mime_type", "audio/webm")
    language_hint = msg.get("language", "en")

    if not audio_b64:
        await _send(ws, "error", {"message": "No audio data"})
        return

    await _send(ws, "status", {"message": "Transcribing..."})

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        await _send(ws, "error", {"message": "Invalid audio data"})
        return

    whisper_lang = "ta" if language_hint == "ta" else "en"
    transcribed = await asyncio.get_event_loop().run_in_executor(
        None, transcribe_audio, audio_bytes, whisper_lang, mime_type
    )
    stats.groq_stt_requests += 1

    if not transcribed:
        await _send(ws, "error", {"message": "Could not transcribe. Please try again."})
        return

    lang = detect_language(transcribed)
    await _send(ws, "transcript", {"text": transcribed, "language": lang, "source": "whisper"})

    history.append({"role": "user", "text": transcribed})
    if len(history) > 20:
        history = history[-20:]

    await _process_and_respond(ws, transcribed, lang, history)


async def _process_and_respond(ws, user_text, lang, history):
    await _send(ws, "ai_start", {"language": lang})

    full_response = ""
    try:
        async for token in generate_response_stream(user_text, history, lang):
            full_response += token
            await _send(ws, "ai_token", {"token": token})
            stats.groq_llm_requests += 1
    except Exception as e:
        logger.error(f"LLM error: {e}")
        stats.log_error(f"LLM: {e}")
        await _send(ws, "error", {"message": f"AI failed: {str(e)}"})
        return

    await _send(ws, "ai_done", {"text": full_response})
    history.append({"role": "model", "text": full_response})

    await _stream_tts(ws, full_response, lang)


async def _stream_tts(ws, text, lang):
    await _send(ws, "audio_start", {"format": "mp3"})
    char_count = 0

    try:
        async for audio_chunk in synthesize_stream(text, lang):
            b64_chunk = base64.b64encode(audio_chunk).decode("ascii")
            await _send(ws, "audio_chunk", {"data": b64_chunk})
            char_count += len(text)
    except Exception as e:
        logger.error(f"TTS streaming failed: {e}")
        stats.log_error(f"TTS: {e}")
        await _send(ws, "tts_fallback", {"message": "Using device voice"})
        return

    await _send(ws, "audio_end", {})
    stats.tts_chars += char_count
    stats.tts_requests += 1


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
