import type { Language } from "../types";

const TAMIL_RANGE = /[\u0B80-\u0BFF]/;

export function detectLanguage(text: string): Language {
  if (!text || !text.trim()) return "en";
  const tamilChars = (text.match(TAMIL_RANGE) || []).length;
  const totalAlpha = (text.match(/\w/g) || []).length;
  if (totalAlpha === 0) return "en";
  return tamilChars / totalAlpha >= 0.15 ? "ta" : "en";
}

export function getSpeechRecognitionLang(lang: Language): string {
  return lang === "ta" ? "ta-IN" : "en-IN";
}

export function getBestTTSVoice(lang: Language): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const prefix = lang === "ta" ? "ta" : "en";
  const exact = voices.find(
    (v) => v.lang === (lang === "ta" ? "ta-IN" : "en-IN") && !v.localService
  );
  if (exact) return exact;
  return voices.find((v) => v.lang.startsWith(prefix)) || null;
}
