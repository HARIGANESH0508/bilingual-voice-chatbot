"""edge-tts synthesis with sentence-level streaming."""

import os
import re
import logging
import asyncio
from typing import AsyncGenerator, Optional

logger = logging.getLogger(__name__)

TAMIL_VOICE = os.getenv("TTS_TAMIL_VOICE", "ta-IN-PallaviNeural")
ENGLISH_VOICE = os.getenv("TTS_ENGLISH_VOICE", "en-IN-NeerjaNeural")

SENTENCE_SPLITTER = re.compile(r"(?<=[.!?\u0964\u0965])\s+|(?:\n\s*\n)")


def _get_voice(language: str) -> str:
    return TAMIL_VOICE if language == "ta" else ENGLISH_VOICE


def split_sentences(text: str) -> list[str]:
    """Split text into sentences for chunked TTS."""
    sentences = SENTENCE_SPLITTER.split(text)
    return [s.strip() for s in sentences if s.strip()]


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


async def synthesize_stream(
    text: str,
    language: str,
) -> AsyncGenerator[bytes, None]:
    """Split text into sentences and yield MP3 audio chunks per sentence."""
    sentences = split_sentences(text)
    if not sentences:
        sentences = [text]

    for sentence in sentences:
        audio = await synthesize_chunk(sentence, language)
        if audio:
            yield audio
        else:
            logger.warning(f"Skipping silent sentence: {sentence[:50]}...")
