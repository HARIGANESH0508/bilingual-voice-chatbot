"""Groq Whisper STT integration — optimized for low latency."""

import os
import time
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

WHISPER_MODEL = "whisper-large-v3"
STT_TIMEOUT_SECONDS = 15

TAMIL_PROMPT = "Vanakkam. Idhu oru Tamil audio. Tamilil pesugira audio."
ENGLISH_PROMPT = "This is a bilingual conversation in Tamil and English."


def _transcribe_sync(
    audio_bytes: bytes,
    language: Optional[str] = None,
    mime_type: str = "audio/webm",
) -> Optional[str]:
    """Synchronous transcription call to Groq Whisper API."""
    from groq import Groq

    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        logger.error("GROQ_API_KEY not set")
        return None

    client = Groq(api_key=api_key)

    suffix_map = {
        "audio/webm": "webm",
        "audio/wav": "wav",
        "audio/mp3": "mp3",
        "audio/ogg": "ogg",
    }
    file_ext = suffix_map.get(mime_type, "webm")

    t0 = time.time()
    kwargs = {
        "file": ("audio." + file_ext, audio_bytes, mime_type),
        "model": WHISPER_MODEL,
    }
    if language:
        kwargs["language"] = language
        kwargs["prompt"] = TAMIL_PROMPT if language == "ta" else ENGLISH_PROMPT
        kwargs["temperature"] = 0.0

    transcription = client.audio.transcriptions.create(**kwargs)
    elapsed = (time.time() - t0) * 1000

    text = transcription.text.strip() if transcription.text else ""
    if text:
        logger.info(f"[STT] Whisper done in {elapsed:.0f}ms: {text[:80]}...")
        return text
    else:
        logger.warning(f"[STT] Whisper returned empty in {elapsed:.0f}ms")
        return None


async def transcribe_audio(
    audio_bytes: bytes,
    language: Optional[str] = None,
    mime_type: str = "audio/webm",
) -> Optional[str]:
    """Transcribe audio using Groq Whisper API with timeout.

    If language is None, Whisper auto-detects (best for bilingual use).
    """
    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _transcribe_sync, audio_bytes, language, mime_type),
            timeout=STT_TIMEOUT_SECONDS,
        )
        return result
    except asyncio.TimeoutError:
        logger.error(f"[STT] Groq STT timed out after {STT_TIMEOUT_SECONDS}s")
        return None
    except Exception as e:
        logger.error(f"[STT] Whisper failed: {e}")
        return None
