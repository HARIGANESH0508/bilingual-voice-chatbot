"""Groq Whisper STT integration."""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

WHISPER_MODEL = "whisper-large-v3-turbo"


def transcribe_audio(
    audio_bytes: bytes,
    language: str = "ta",
    mime_type: str = "audio/webm",
) -> Optional[str]:
    """Transcribe audio using Groq Whisper API.

    Accepts webm/opus natively — no format conversion needed.
    Returns transcribed text or None on failure.
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

        transcription = client.audio.transcriptions.create(
            file=("audio." + file_ext, audio_bytes, mime_type),
            model=WHISPER_MODEL,
            language=language,
        )

        text = transcription.text.strip() if transcription.text else ""
        if text:
            logger.info(f"Whisper transcription ({language}): {text[:100]}...")
            return text
        else:
            logger.warning("Whisper returned empty transcription")
            return None

    except Exception as e:
        logger.error(f"Whisper transcription failed: {e}")
        return None
