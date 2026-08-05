"""edge-tts synthesis optimized for low latency."""

import os
import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

TAMIL_VOICE = os.getenv("TTS_TAMIL_VOICE", "ta-IN-PallaviNeural")
ENGLISH_VOICE = os.getenv("TTS_ENGLISH_VOICE", "en-IN-NeerjaNeural")


def _get_voice(language: str) -> str:
    return TAMIL_VOICE if language == "ta" else ENGLISH_VOICE


async def synthesize_chunk(
    text: str,
    language: str,
) -> Optional[bytes]:
    """Synthesize a single text chunk to MP3 bytes using edge-tts."""
    try:
        import edge_tts

        voice = _get_voice(language)
        communicate = edge_tts.Communicate(text, voice)

        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]

        if audio_data:
            return audio_data
        logger.warning(f"edge-tts returned no audio for: {text[:50]}...")
        return None

    except Exception as e:
        logger.error(f"edge-tts failed: {e}")
        return None
