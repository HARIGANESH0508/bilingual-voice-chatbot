"""FastAPI backend for bilingual voice chatbot — optimized for low latency."""

import os
import json
import time
import base64
import asyncio
import logging
import re
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from language_detector import detect_language
from groq_client import generate_response_stream
from groq_whisper_stt import transcribe_audio
from edge_tts_engine import synthesize_chunk
from usage_tracker import stats

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
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
RATE_LIMIT_MAX = 15

SENTENCE_SPLITTER = re.compile(r"(?<=[.!?\u0964\u0965])\s+")


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
    session_lang: dict = {"lang": "en"}

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
                await _handle_text(websocket, msg, client_id, history, session_lang)
            elif event_type == "user_audio":
                await _handle_audio(websocket, msg, client_id, history, session_lang)
            elif event_type == "tts_only":
                text = msg.get("text", "").strip()
                lang = msg.get("language", "en")
                if text:
                    await _send(websocket, "audio_start", {"format": "mp3"})
                    await _synthesize_and_send(websocket, text, lang)
                    await _send(websocket, "audio_end", {})
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


async def _handle_text(ws, msg, client_id, history, session_lang):
    if not rate_limiter.is_allowed(client_id):
        await _send(ws, "error", {"message": "Rate limit. Please wait."})
        return

    user_text = msg.get("text", "").strip()
    if not user_text:
        return

    t0 = time.time()
    lang = detect_language(user_text)
    session_lang["lang"] = lang
    await _send(ws, "transcript", {"text": user_text, "language": lang})
    logger.info(f"[Pipeline] Text received in {(time.time()-t0)*1000:.0f}ms: {user_text[:50]}")

    history.append({"role": "user", "text": user_text})
    if len(history) > 20:
        history = history[-20:]

    await _process_and_respond(ws, user_text, lang, history)


async def _handle_audio(ws, msg, client_id, history, session_lang):
    if not rate_limiter.is_allowed(client_id):
        await _send(ws, "error", {"message": "Rate limit. Please wait."})
        return

    audio_b64 = msg.get("data", "")
    mime_type = msg.get("mime_type", "audio/webm")
    language_hint = msg.get("language", None)

    if not audio_b64:
        await _send(ws, "error", {"message": "No audio data"})
        return

    t_start = time.time()
    await _send(ws, "status", {"message": "Transcribing..."})
    t0 = time.time()

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        await _send(ws, "error", {"message": "Invalid audio data"})
        return

    logger.info(f"[Pipeline] Audio decode: {len(audio_bytes)} bytes in {(time.time()-t0)*1000:.0f}ms, hint={language_hint}")

    stt_lang = language_hint if language_hint in ("ta", "en") else session_lang["lang"]
    t_stt = time.time()
    transcribed = await transcribe_audio(audio_bytes, stt_lang, mime_type)
    stt_ms = (time.time() - t_stt) * 1000
    stats.groq_stt_requests += 1

    if not transcribed:
        total_ms = (time.time() - t_start) * 1000
        logger.warning(f"[Pipeline] STT failed after {total_ms:.0f}ms")
        await _send(ws, "error", {"message": "Could not transcribe. Please try again."})
        return

    logger.info(f"[Pipeline] STT done in {stt_ms:.0f}ms: {transcribed[:50]}")

    lang = detect_language(transcribed)
    session_lang["lang"] = lang
    await _send(ws, "transcript", {"text": transcribed, "language": lang, "source": "whisper"})

    history.append({"role": "user", "text": transcribed})
    if len(history) > 20:
        history = history[-20:]

    await _process_and_respond(ws, transcribed, lang, history)


async def _process_and_respond(ws, user_text, lang, history):
    await _send(ws, "ai_start", {"language": lang})
    t_llm = time.time()
    first_token_time = None

    full_response = ""
    sentence_buffer = ""
    sentence_count = 0
    audio_started = False

    try:
        async for token in generate_response_stream(user_text, history, lang):
            if first_token_time is None:
                first_token_time = (time.time() - t_llm) * 1000
                logger.info(f"[Pipeline] First LLM token in {first_token_time:.0f}ms")
            full_response += token
            sentence_buffer += token
            await _send(ws, "ai_token", {"token": token})

            sentences = SENTENCE_SPLITTER.split(sentence_buffer)
            if len(sentences) > 1:
                for s in sentences[:-1]:
                    s = s.strip()
                    if s and len(s) > 3:
                        sentence_count += 1
                        if not audio_started:
                            await _send(ws, "audio_start", {"format": "mp3"})
                            audio_started = True
                        logger.info(f"[Pipeline] Sentence {sentence_count} ready, sending to TTS: {s[:40]}...")
                        await _synthesize_and_send(ws, s, lang)
                sentence_buffer = sentences[-1]

            stats.groq_llm_requests += 1
    except Exception as e:
        logger.error(f"LLM error: {e}")
        stats.log_error(f"LLM: {e}")
        await _send(ws, "error", {"message": f"AI failed: {str(e)}"})
        return

    llm_ms = (time.time() - t_llm) * 1000
    logger.info(f"[Pipeline] LLM done in {llm_ms:.0f}ms ({first_token_time:.0f}ms to first token), {len(full_response)} chars")

    await _send(ws, "ai_done", {"text": full_response})
    history.append({"role": "model", "text": full_response})

    if sentence_buffer.strip() and len(sentence_buffer.strip()) > 3:
        if not audio_started:
            await _send(ws, "audio_start", {"format": "mp3"})
            audio_started = True
        await _synthesize_and_send(ws, sentence_buffer.strip(), lang)

    if audio_started:
        await _send(ws, "audio_end", {})


async def _synthesize_and_send(ws, text, lang):
    t_tts = time.time()
    try:
        audio_data = await synthesize_chunk(text, lang)
        if audio_data:
            b64 = base64.b64encode(audio_data).decode("ascii")
            await _send(ws, "audio_chunk", {"data": b64})
            tts_ms = (time.time() - t_tts) * 1000
            logger.info(f"[Pipeline] TTS done in {tts_ms:.0f}ms, {len(audio_data)} bytes")
            stats.tts_chars += len(text)
            stats.tts_requests += 1
        else:
            logger.warning(f"TTS returned no audio for: {text[:50]}")
    except Exception as e:
        logger.error(f"TTS failed: {e}")
        stats.log_error(f"TTS: {e}")
        await _send(ws, "tts_fallback", {"message": "Using device voice"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
