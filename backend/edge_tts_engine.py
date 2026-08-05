"""edge-tts synthesis — robust with retry and fallback."""

import os
import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

TAMIL_VOICES = ["ta-IN-PallaviNeural", "ta-IN-ValluvarNeural"]
ENGLISH_VOICES = ["en-IN-NeerjaNeural", "en-IN-PrabhatNeural"]
TTS_TIMEOUT_SECONDS = 12
TTS_RETRIES = 3
TTS_RETRY_DELAY = 0.5


def _get_voices(language: str) -> list[str]:
    if language == "ta":
        return TAMIL_VOICES
    return ENGLISH_VOICES


async def _synthesize_once(text: str, voice: str) -> Optional[bytes]:
    """Try to synthesize with a single voice."""
    import edge_tts

    communicate = edge_tts.Communicate(text, voice)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data if audio_data else None


async def synthesize_chunk(
    text: str,
    language: str,
) -> Optional[bytes]:
    """Synthesize text to MP3 bytes with retry across multiple voices."""
    voices = _get_voices(language)

    for attempt in range(TTS_RETRIES):
        for voice in voices:
            try:
                result = await asyncio.wait_for(
                    _synthesize_once(text, voice),
                    timeout=TTS_TIMEOUT_SECONDS,
                )
                if result:
                    logger.info(f"[TTS] OK ({voice}, attempt {attempt+1}): {len(result)} bytes")
                    return result
                logger.warning(f"[TTS] {voice} empty (attempt {attempt+1})")
            except asyncio.TimeoutError:
                logger.warning(f"[TTS] {voice} timeout (attempt {attempt+1})")
            except Exception as e:
                logger.warning(f"[TTS] {voice} error: {e} (attempt {attempt+1})")

        if attempt < TTS_RETRIES - 1:
            await asyncio.sleep(TTS_RETRY_DELAY * (attempt + 1))

    logger.error(f"[TTS] ALL FAILED for: {text[:50]}...")
    return None
