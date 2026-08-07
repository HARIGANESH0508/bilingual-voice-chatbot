"""TTS engine — edge-tts primary with natural Tamil, gTTS fallback."""

import os
import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

# ALL available Tamil voices from Microsoft
TAMIL_VOICES = [
    "ta-IN-PallaviNeural",
    "ta-IN-ValluvarNeural",
    "ta-IN-KavyaNeural",
]
ENGLISH_VOICES = [
    "en-IN-NeerjaNeural",
    "en-IN-PrabhatNeural",
    "en-IN-ShrutiNeural",
    "en-IN-AditiNeural",
]
TTS_TIMEOUT_SECONDS = 20
TTS_RETRIES = 3
TTS_RETRY_DELAY = 0.5


def _get_voices(language: str) -> list[str]:
    if language == "ta":
        return TAMIL_VOICES
    return ENGLISH_VOICES


def _preprocess(text: str, language: str) -> str:
    """Preprocess text for better TTS pronunciation."""
    try:
        if language == "ta":
            from tts_preprocessor import preprocess_tamil_for_tts
            return preprocess_tamil_for_tts(text)
        else:
            from tts_preprocessor import preprocess_english_for_tts
            return preprocess_english_for_tts(text)
    except Exception as e:
        logger.warning(f"[TTS] Preprocessor failed: {e}")
        return text


async def _synthesize_edge(text: str, voice: str, language: str) -> Optional[bytes]:
    """Try edge-tts with natural prosody settings."""
    import edge_tts

    processed = _preprocess(text, language)

    # Natural speech rate and pitch for Tamil
    rate = "-10%" if language == "ta" else "+0%"
    pitch = "+0Hz"

    communicate = edge_tts.Communicate(
        processed,
        voice,
        rate=rate,
        pitch=pitch,
    )
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data if audio_data else None


def _synthesize_gtts_sync(text: str, language: str) -> Optional[bytes]:
    """Synchronous gTTS fallback."""
    try:
        from gtts import gTTS
        import io

        processed = _preprocess(text, language)
        lang_code = "ta" if language == "ta" else "en"

        tts = gTTS(text=processed, lang=lang_code, slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)
        audio_bytes = audio_buffer.read()

        return audio_bytes if audio_bytes else None
    except Exception as e:
        logger.error(f"[TTS] gTTS failed: {type(e).__name__}: {e}")
        return None


async def _synthesize_gtts(text: str, language: str) -> Optional[bytes]:
    """Async wrapper for gTTS fallback."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _synthesize_gtts_sync, text, language)


async def synthesize_chunk(
    text: str,
    language: str,
) -> Optional[bytes]:
    """Synthesize text to MP3 bytes.

    Strategy:
    1. Try edge-tts with natural prosody (3 retries x 3-4 voices = 9-12 attempts)
    2. If all fail, use gTTS as fallback
    """
    voices = _get_voices(language)

    # Step 1: Try edge-tts with natural settings
    for attempt in range(TTS_RETRIES):
        for voice in voices:
            try:
                result = await asyncio.wait_for(
                    _synthesize_edge(text, voice, language),
                    timeout=TTS_TIMEOUT_SECONDS,
                )
                if result:
                    logger.info(f"[TTS] edge-tts OK ({voice}): {len(result)} bytes")
                    return result
                logger.warning(f"[TTS] edge-tts {voice} empty")
            except asyncio.TimeoutError:
                logger.warning(f"[TTS] edge-tts {voice} timeout")
            except Exception as e:
                logger.warning(f"[TTS] edge-tts {voice} error: {type(e).__name__}: {e}")

        if attempt < TTS_RETRIES - 1:
            await asyncio.sleep(TTS_RETRY_DELAY * (attempt + 1))

    # Step 2: Fallback to gTTS
    logger.info(f"[TTS] edge-tts failed, trying gTTS fallback for lang={language}")
    try:
        result = await asyncio.wait_for(
            _synthesize_gtts(text, language),
            timeout=20,
        )
        if result:
            logger.info(f"[TTS] gTTS OK: {len(result)} bytes")
            return result
        logger.warning("[TTS] gTTS returned empty")
    except asyncio.TimeoutError:
        logger.warning("[TTS] gTTS timeout")
    except Exception as e:
        logger.warning(f"[TTS] gTTS error: {type(e).__name__}: {e}")

    logger.error(f"[TTS] ALL ENGINES FAILED for: '{text[:50]}...'")
    return None
