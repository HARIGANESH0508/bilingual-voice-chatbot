"""Groq Whisper STT integration — optimized for low latency."""

import os
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

WHISPER_MODEL = "whisper-large-v3"


def transcribe_audio(
    audio_bytes: bytes,
    language: Optional[str] = None,
    mime_type: str = "audio/webm",
) -> Optional[str]:
    """Transcribe audio using Groq Whisper API.

    If language is None, Whisper auto-detects (best for bilingual use).
    """
    try:
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

        transcription = client.audio.transcriptions.create(**kwargs)
        elapsed = (time.time() - t0) * 1000

        text = transcription.text.strip() if transcription.text else ""
        if text:
            logger.info(f"[STT] Whisper done in {elapsed:.0f}ms: {text[:80]}...")
            return text
        else:
            logger.warning(f"[STT] Whisper returned empty in {elapsed:.0f}ms")
            return None

    except Exception as e:
        logger.error(f"[STT] Whisper failed: {e}")
        return None
