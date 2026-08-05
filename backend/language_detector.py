"""Language detection for Tamil/English with code-switching + Tanglish support."""

import re
from langdetect import detect, DetectorFactory

DetectorFactory.seed = 0

TAMIL_RANGE = re.compile(r"[\u0B80-\u0BFF]")

# Common Tanglish words that indicate Tamil
TANGISH_INDICATORS = {
    "naan", "nee", "neenga", "avaru", "aval", "avan",
    "idhu", "adhu", "inga", "anga", "enna", "yen", "ye",
    "eppo", "ippo", "apo", "epdi", "eppadi",
    "irukku", "irukkanga", "iruken", "irukom",
    "sari", "seri", "aama", "ama", "illa", "illai",
    "vanakkam", "nandri", "nanni",
    "romba", "konjam", "umba", "unga",
    "enaku", "unaku", "ungalku",
    "edhuku", "adhuku", "epavo",
    "apdi", "ipdi", "madri", "maari",
    "la", "le", "lae", "laam", "um",
    "thaan", "dhaan", "nu", "unu", "en",
    "illati", "illatna", "adhavadhu",
    "solra", "sollitu", "panitu", "vandhu", "poidu",
    "vaanga", "poguinga", "pogalam",
    "vagala", "venam", "venum", "vendam",
    "kudukka", "edukka", "vitru", "vitu",
    "saptiya", "sapta", "tinnu", "kudichi",
    "kelunga", "kelu", "kettengala",
    "puriyudha", "purila", "theriyudha", "therila", "theriyum", "theriyadhu",
    "pesunga", "pesu", "sollunga", "sollu", "panunga", "panu",
    "correct", "okay", "ok", "hello", "hi", "bye",
    "thanks", "thank",
}


def detect_language(text: str) -> str:
    """Detect whether text is primarily Tamil or English.

    Hybrid approach:
    1. Count Tamil Unicode chars (U+0B80-U+0BFF)
    2. If >=15% Tamil chars -> classify as Tamil
    3. Check for Tanglish (common Tamil words in English script)
    4. Fall back to langdetect
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

    # Check for Tanglish — Tamil words written in English
    words_lower = set(re.findall(r'[a-zA-Z]+', cleaned.lower()))
    tanglish_hits = len(words_lower & TANGISH_INDICATORS)
    if tanglish_hits >= 2:
        return "ta"

    try:
        lang = detect(cleaned)
        if lang == "ta":
            return "ta"
        return "en"
    except Exception:
        return "en"
