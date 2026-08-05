"""edge-tts synthesis optimized for low latency."""

import os
import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

TAMIL_VOICES = ["ta-IN-PallaviNeural", "ta-IN-ValluvarNeural"]
ENGLISH_VOICE = os.getenv("TTS_ENGLISH_VOICE", "en-IN-NeerjaNeural")
TTS_TIMEOUT_SECONDS = 10
TTS_RETRIES = 2


def _get_voices(language: str) -> list[str]:
    if language == "ta":
        return TAMIL_VOICES
    return [ENGLISH_VOICE]


async def synthesize_chunk(
    text: str,
    language: str,
) -> Optional[bytes]:
    """Synthesize a single text chunk to MP3 bytes using edge-tts with retry."""
    import edge_tts

    voices = _get_voices(language)

    for attempt in range(TTS_RETRIES):
        for voice in voices:
            try:
                communicate = edge_tts.Communicate(text, voice)
                audio_data = b""

                async def _stream():
                    nonlocal audio_data
                    async for chunk in communicate.stream():
                        if chunk["type"] == "audio":
                            audio_data += chunk["data"]

                await asyncio.wait_for(_stream(), timeout=TTS_TIMEOUT_SECONDS)

                if audio_data:
                    logger.info(f"[TTS] {voice} OK: {len(audio_data)} bytes for '{text[:30]}...'")
                    return audio_data
                else:
                    logger.warning(f"[TTS] {voice} returned empty, trying next voice")
            except asyncio.TimeoutError:
                logger.warning(f"[TTS] {voice} timed out (attempt {attempt+1})")
            except Exception as e:
                logger.warning(f"[TTS] {voice} failed: {e} (attempt {attempt+1})")

    logger.error(f"[TTS] All voices failed for: {text[:50]}...")
    return None
