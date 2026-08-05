"""Tamil text normalizer — fixes Whisper misrecognitions + Tanglish support."""

import re
import logging

logger = logging.getLogger(__name__)

# Tanglish (English-script Tamil) → Tamil script
# Common words users speak in Tanglish that Whisper may output in English
TANGISH_TO_TAMIL = {
    "tamil": "தமிழ்",
    "tamizh": "தமிழ்",
    "tamiizh": "தமிழ்",
    "pesunga": "பேசுங்க",
    "pesu": "பேசு",
    "pesaren": "பேசுறேன்",
    "pesuvom": "பேசுவோம்",
    "pesuran": "பேசுறான்",
    "pesura": "பேசுறா",
    "pesarangal": "பேசுறாங்க",
    "sollunga": "சொல்லுங்க",
    "sollu": "சொல்லு",
    "sollren": "சொல்றேன்",
    "solluvom": "சொல்வோம்",
    "panunga": "பண்ணுங்க",
    "panu": "பண்ணு",
    "panren": "பண்றேன்",
    "panuvom": "பண்வோம்",
    "panuran": "பண்றான்",
    "panura": "பண்றா",
    "panuranga": "பண்றாங்க",
    "vanakkam": "வணக்கம்",
    "naan": "நான்",
    "nee": "நீ",
    "neenga": "நீங்க",
    "avaru": "அவர்",
    "aval": "அவள்",
    "avan": "அவன்",
    "idhu": "இது",
    "adhu": "அது",
    "inga": "இங்கே",
    "anga": "அங்கே",
    "epdi": "எப்படி",
    "eppadi": "எப்படி",
    "enna": "என்ன",
    "yen": "ஏன்",
    "ye": "ஏன்",
    "eppo": "எப்போது",
    "ippo": "இப்போது",
    "apo": "அப்போது",
    "irukku": "இருக்கு",
    "irukkanga": "இருக்காங்க",
    "iruken": "இருக்கேன்",
    "irukom": "இருக்கோம்",
    "seri": "சரி",
    "sari": "சரி",
    "aama": "ஆம்",
    "ama": "ஆம்",
    "illa": "இல்லை",
    "illai": "இல்லை",
    "illa": "இல்லை",
    "nandri": "நன்றி",
    "nanni": "நன்றி",
    "thanks": "நன்றி",
    "thank you": "நன்றி",
    "hello": "ஹலோ",
    "hi": "ஹாய்",
    "bye": "பை",
    "good morning": "காலை வணக்கம்",
    "good night": "இரவு வணக்கம்",
    "good afternoon": "மதிய வணக்கம்",
    "good evening": "மாலை வணக்கம்",
    "romba": "ரொம்ப",
    "umba": "உங்க",
    "unga": "உங்க",
    "enaku": "எனக்கு",
    "unaku": "உனக்கு",
    "ungalku": "உங்களுக்கு",
    "edhuku": "எதற்கு",
    "adhuku": "அதற்கு",
    "epavo": "ஏதோ",
    "apdi": "அப்படி",
    "ipdi": "இப்படி",
    "madri": "மாதிரி",
    "maari": "மாறி",
    "la": "ல",
    "le": "ல",
    "lae": "ல",
    "oda": "உடன்",
    "oda": "ஓட",
    "laam": "லாம்",
    "um": "உம்",
    "aanal": "ஆனால்",
    "aana": "ஆனா",
    "endra": "என்ற",
    "nu": "ன்று",
    "unu": "உன்",
    "en": "என்",
    "thaan": "தான்",
    "dhaan": "தான்",
    "illati": "இல்லாட்டி",
    "illatna": "இல்லாட்டினா",
    "adhavadhu": "அதாவது",
    "maadhiri": "மாதிரி",
    "solra": "சொல்ற",
    "sollitu": "சொல்லிட்டு",
    "panitu": "பண்ணிட்டு",
    "vandhu": "வந்து",
    "poidu": "போயிடு",
    "vaanga": "வாங்க",
    "poguinga": "போங்க",
    "pogalam": "போகலாம்",
    "vagala": "வேணாம்",
    "venam": "வேணாம்",
    "venam": "வேண்டாம்",
    "venum": "வேணும்",
    "vendam": "வேண்டாம்",
    "pattuma": "படுமா",
    "kudukka": "கொடுக்க",
    "kuduka": "கொடுக்க",
    "edukka": "எடுக்க",
    "eduka": "எடுக்க",
    "vitru": "விடு",
    "vitu": "விட்டு",
    "saptiya": "சாப்டியா",
    "sapta": "சாப்ட",
    "tinnu": "தின்னு",
    "kudichi": "குடிச்ச",
    "thooku": "தூக்கு",
    "vizhundha": "விழுந்த",
    "erangha": "இறங்கு",
    "kelunga": "கேளுங்க",
    "kelu": "கேளு",
    "kettengala": "கேட்டீங்களா",
    "puriyudha": "புரியுதா",
    "purila": "புரியல",
    "theriyudha": "தெரியுதா",
    "therila": "தெரியல",
    "theriyum": "தெரியும்",
    "theriyadhu": "தெரியாது",
    "romba": "ரொம்ப",
    "konjam": "கொஞ்சம்",
    "kooda": "கூட",
    "koodadhu": "கூடாது",
    "agasam": "அகசம்",
    "mukkiyam": "முக்கியம்",
    "thevai": "தேவை",
    "illai": "இல்லை",
    "irukku": "இருக்கு",
    "ilai": "இல்லை",
    "sariya": "சரியா",
    "correct": "சரி",
    "okay": "சரி",
    "ok": "சரி",
}

# Tamil script normalizations
TAMIL_SCRIPT_FIXES = {
    "வணக்கம்": "வணக்கம்",
    "நன்றி": "நன்றி",
    "சரி": "சரி",
    "ஆம்": "ஆம்",
    "இல்லை": "இல்லை",
    "பேசுங்கள்": "பேசுங்க",
    "சொல்லுங்கள்": "சொல்லுங்க",
    "பண்ணுங்கள்": "பண்ணுங்க",
    "கேளுங்கள்": "கேளுங்க",
    "தாருங்கள்": "தாருங்க",
    "போங்கள்": "போங்க",
    "வாங்கள்": "வாங்க",
}


def _convert_tanglish(text: str) -> str:
    """Convert Tanglish (English-script Tamil) to Tamil script."""
    words = text.split()
    converted = []
    changed = False

    for word in words:
        lower = word.lower().strip(".,!?;:")
        if lower in TANGISH_TO_TAMIL:
            converted.append(TANGISH_TO_TAMIL[lower])
            changed = True
        else:
            converted.append(word)

    if changed:
        logger.info(f"[TamilNormalizer] Tanglish: '{text[:50]}' → '{' '.join(converted)[:50]}'")

    return " ".join(converted)


def normalize_tamil(text: str) -> str:
    """Normalize Tamil text — fix Whisper misrecognitions + Tanglish."""
    if not text:
        return text

    original = text

    has_tamil_script = bool(re.search(r'[\u0B80-\u0BFF]', text))
    has_latin = bool(re.search(r'[a-zA-Z]', text))

    if has_latin and not has_tamil_script:
        text = _convert_tanglish(text)

    if has_tamil_script:
        words = text.split()
        fixed_words = []
        for word in words:
            clean = word.strip(".,!?;:")
            if clean in TAMIL_SCRIPT_FIXES:
                prefix = word[: len(word) - len(word.lstrip(".,!?;:"))]
                suffix = word[len(word.rstrip(".,!?;:")):]
                fixed_words.append(prefix + TAMIL_SCRIPT_FIXES[clean] + suffix)
            else:
                fixed_words.append(word)
        text = " ".join(fixed_words)

    text = re.sub(r'  +', ' ', text)
    text = text.strip()

    if text != original:
        logger.info(f"[TamilNormalizer] Fixed: '{original[:50]}' → '{text[:50]}'")

    return text
