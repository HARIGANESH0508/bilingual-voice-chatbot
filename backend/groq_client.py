"""Groq LLM streaming integration — optimized for low latency."""

import os
import time
import logging
from typing import AsyncGenerator
from groq import Groq

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TA = """நீங்கள் ஒரு தமிழ் குரல் உதவியாளர். தமிழில் பேசுங்கள்.

விதிகள்:
- எப்போதும் தமிழில் பதிலளியுங்கள்
- குறுகிய, இயல்பான பதில்கள் கொடுங்கள் (1-3 வாக்கியங்கள்)
- எழுத்து வடிவம் போல பேசுங்கள், முறையான எழுத்து போல அல்ல
- தமிழ் மொழி கலந்து பேசலாம் (Tanglish போல)
- சிறிய பதில்கள் கொடுங்கள், நீண்ட பதில்கள் வேண்டாம்

உதாரணம்:
பயனர்: வணக்கம்
உதவியாளர்: வணக்கம்! எப்படி இருக்கீங்க?

பயனர்: உங்க பெயர் என்ன?
உதவியாளர்: என் பெயர் தமிழ் உதவியாளர். உங்களுக்கு எப்படி உதவ முடியும்?

பயனர்: இன்னைக்கு வானிலை எப்படி இருக்கு?
உதவியாளர்: மன்னிக்கவும், எனக்கு வானிலை தகவல் தெரியாது. வேறு ஏதாவது கேட்க விரும்புகிறீர்களா?"""

SYSTEM_PROMPT_EN = """You are a bilingual voice assistant fluent in Tamil and English.
Always reply in the same language the user used. If the user writes in Tamil, reply in Tamil.
If the user writes in English, reply in English. If the user mixes Tamil and English
(code-switching), reply in the same mixed style naturally.

Keep responses short, natural, and conversational — this will be spoken aloud, so
avoid long paragraphs, avoid markdown, avoid bullet points, avoid any text formatting.
Keep to 1-3 sentences unless asked for more detail."""

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]


def _get_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set")
    return Groq(api_key=api_key)


async def generate_response_stream(
    user_text: str,
    history: list[dict],
    language: str,
) -> AsyncGenerator[str, None]:
    """Stream response tokens from Groq LLM with model fallback."""
    client = _get_client()

    system_prompt = SYSTEM_PROMPT_TA if language == "ta" else SYSTEM_PROMPT_EN

    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        role = "assistant" if msg["role"] == "model" else msg["role"]
        messages.append({"role": role, "content": msg["text"]})
    messages.append({"role": "user", "content": user_text})

    last_error = None
    for model in MODELS:
        try:
            t0 = time.time()
            logger.info(f"[LLM] Requesting {model} (lang={language})...")
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=200,
                stream=True,
            )
            first_token = True
            for chunk in response:
                if chunk.choices[0].delta.content:
                    if first_token:
                        ttft = (time.time() - t0) * 1000
                        logger.info(f"[LLM] First token in {ttft:.0f}ms")
                        first_token = False
                    yield chunk.choices[0].delta.content
            return
        except Exception as e:
            last_error = e
            logger.warning(f"Model {model} failed: {e}")
            continue

    raise last_error
