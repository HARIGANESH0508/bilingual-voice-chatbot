"""Groq Whisper STT integration — optimized for Tamil accuracy."""

import os
import time
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-large-v3")
STT_TIMEOUT_SECONDS = 30

# Short, focused Tamil prompt — long prompts DEGRADE accuracy
# These are common Tamil words Whisper should recognize
TAMIL_PROMPT = (
    "வணக்கம் நன்றி சரி ஆம் இல்லை என்ன ஏன் எப்படி எங்கே யார் "
    "இது அது பேசு சொல்லு வாங்க போங்க பண்ணுங்க இருக்கு "
    "தமிழ் ஆங்கிலம் கலந்து பேசுகிறோம்"
)
ENGLISH_PROMPT = (
    "This is a bilingual Tamil and English conversation. "
    "Speak naturally mixing Tamil and English words."
)


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

    # Always set language + prompt for best accuracy
    prompt = TAMIL_PROMPT if language == "ta" else ENGLISH_PROMPT

    kwargs = {
        "file": ("audio." + file_ext, audio_bytes, mime_type),
        "model": WHISPER_MODEL,
        "language": language or "en",
        "prompt": prompt,
        "temperature": 0.0,
        "response_format": "verbose_json",
    }

    transcription = client.audio.transcriptions.create(**kwargs)
    elapsed = (time.time() - t0) * 1000

    text = transcription.text.strip() if transcription.text else ""

    # Log confidence and detected language from verbose response
    detected_lang = getattr(transcription, "language", language)
    avg_logprob = getattr(transcription, "avg_logprob", None)
    no_speech_prob = getattr(transcription, "no_speech_prob", None)
    log_msg = f"[STT] {WHISPER_MODEL} done in {elapsed:.0f}ms, lang={detected_lang}"
    if avg_logprob is not None:
        log_msg += f", avg_logprob={avg_logprob:.3f}"
    if no_speech_prob is not None:
        log_msg += f", no_speech={no_speech_prob:.3f}"
    log_msg += f": {text[:80]}"

    if text:
        logger.info(log_msg)
        return text
    else:
        logger.warning(f"{log_msg} (empty)")
        return None


async def transcribe_audio(
    audio_bytes: bytes,
    language: Optional[str] = None,
    mime_type: str = "audio/webm",
) -> Optional[str]:
    """Transcribe audio using Groq Whisper API with timeout.

    language: 'ta' for Tamil, 'en' for English. Always set for best accuracy.
    """
    try:
        loop = asyncio.get_running_loop()
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
