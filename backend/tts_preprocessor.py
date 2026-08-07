"""Tamil TTS text preprocessor — improves pronunciation for edge-tts."""

import re
import logging

logger = logging.getLogger(__name__)

# Tamil abbreviations that need expansion for TTS
ABBREVIATIONS = {
    "வணக்கம்": "வணக்கம்.",
    "நன்றி": "நன்றி.",
    "சரி": "சரி.",
    "ஆம்": "ஆம்.",
    "இல்லை": "இல்லை.",
    "ஹாய்": "ஹாய்.",
    "ஹலோ": "ஹலோ.",
    "ஓகே": "ஓகே.",
    "OK": "ஓகே.",
    "ok": "ஓகே",
}

# Words that need slight pause after them for natural flow
PAUSE_AFTER = {"ஆம்", "இல்லை", "சரி", "நன்றி", "வணக்கம்", "ஓகே", "ஹலோ", "ஹாய்"}


def preprocess_tamil_for_tts(text: str) -> str:
    """Preprocess Tamil text for better TTS pronunciation."""
    if not text:
        return text

    original = text

    # Expand abbreviations
    for abbr, full in ABBREVIATIONS.items():
        text = text.replace(abbr, full)

    # Ensure sentence ends with punctuation
    text = text.strip()
    if text and text[-1] not in ".!?":
        text += "."

    # Add pauses between phrases (comma for short pause)
    text = re.sub(r'(\s)(ஆம்)(\s)', r'\1\2,\3', text)
    text = re.sub(r'(\s)(இல்லை)(\s)', r'\1\2,\3', text)
    text = re.sub(r'(\s)(சரி)(\s)', r'\1\2,\3', text)

    # Remove multiple punctuation
    text = re.sub(r'[.]{2,}', '.', text)
    text = re.sub(r'[,]{2,}', ',', text)
    text = re.sub(r'[.,]{2,}', '.', text)

    # Clean up spaces
    text = re.sub(r'  +', ' ', text)
    text = text.strip()

    if text != original:
        logger.info(f"[TTS Preprocess] '{original[:50]}' → '{text[:50]}'")

    return text


def preprocess_english_for_tts(text: str) -> str:
    """Preprocess English text for better TTS pronunciation."""
    if not text:
        return text

    text = text.strip()

    # Ensure sentence ends with punctuation
    if text and text[-1] not in ".!?":
        text += "."

    # Clean up multiple punctuation
    text = re.sub(r'[.]{2,}', '.', text)

    return text
