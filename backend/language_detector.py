"""Language detection for Tamil/English with code-switching support."""

import re
from langdetect import detect, DetectorFactory

DetectorFactory.seed = 0

TAMIL_RANGE = re.compile(r"[\u0B80-\u0BFF]")


def detect_language(text: str) -> str:
    """Detect whether text is primarily Tamil or English.

    Hybrid approach:
    1. Count Tamil Unicode chars (U+0B80-U+0BFF)
    2. If >=15% Tamil chars -> classify as Tamil (handles code-switching)
    3. Fall back to langdetect for Latin-script Tamil (Tanglish)
    """
    if not text or not text.strip():
        return "en"

    cleaned = text.strip()
    tamil_chars = len(TAMIL_RANGE.findall(cleaned))
    total_alpha = len(re.findall(r"\w", cleaned))

    if total_alpha == 0:
        return "en"

    tamil_ratio = tamil_chars / total_alpha

    if tamil_ratio >= 0.15:
        return "ta"

    try:
        lang = detect(cleaned)
        if lang == "ta":
            return "ta"
        return "en"
    except Exception:
        return "en"
