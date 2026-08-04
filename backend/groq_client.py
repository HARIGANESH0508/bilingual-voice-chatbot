"""Groq LLM streaming integration with fallback model."""

import os
import logging
from typing import AsyncGenerator
from groq import Groq

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a bilingual voice assistant fluent in Tamil and English. 
Always reply in the same language the user used. If the user writes in Tamil, reply in Tamil. 
If the user writes in English, reply in English. If the user mixes Tamil and English 
(code-switching), reply in the same mixed style naturally.

Keep responses short, natural, and conversational — this will be spoken aloud, so 
avoid long paragraphs, avoid markdown, avoid bullet points, avoid any text formatting. 
Keep to 1-3 sentences unless asked for more detail."""

MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
MAX_RETRIES = 3


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

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in history:
        role = "assistant" if msg["role"] == "model" else msg["role"]
        messages.append({"role": role, "content": msg["text"]})
    messages.append({"role": "user", "content": user_text})

    last_error = None
    for model in MODELS:
        try:
            logger.info(f"Trying model: {model}")
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=200,
                stream=True,
            )
            for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
            return
        except Exception as e:
            last_error = e
            logger.warning(f"Model {model} failed: {e}")
            continue

    raise last_error
