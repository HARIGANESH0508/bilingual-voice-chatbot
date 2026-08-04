import { useCallback, useRef, useState } from "react";
import type { Language } from "../types";
import { getBestTTSVoice } from "../utils/languageDetector";

interface UseSpeechSynthesisOptions {
  language: Language;
}

export function useSpeechSynthesis({ language }: UseSpeechSynthesisOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(
    (text: string) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === "ta" ? "ta-IN" : "en-IN";
      utterance.rate = 1.0;

      const voice = getBestTTSVoice(language);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); utteranceRef.current = null; };
      utterance.onerror = () => { setIsSpeaking(false); utteranceRef.current = null; };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [language]
  );

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, []);

  return { isSpeaking, speak, stop };
}
