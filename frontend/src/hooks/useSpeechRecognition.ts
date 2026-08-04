import { useCallback, useRef, useState } from "react";
import type { Language, RecordingState } from "../types";
import { getSpeechRecognitionLang } from "../utils/languageDetector";

interface UseSpeechRecognitionOptions {
  language: Language;
  onResult: (text: string, isFinal: boolean) => void;
  onError: (error: string) => void;
}

export function useSpeechRecognition({
  language,
  onResult,
  onError,
}: UseSpeechRecognitionOptions) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startRecording = useCallback(() => {
    if (!isSupported) {
      onErrorRef.current("Speech recognition not supported in this browser.");
      return;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.lang = getSpeechRecognitionLang(language);
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setRecordingState("listening");

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) {
        onResultRef.current(final, true);
        setRecordingState("processing");
      } else if (interim) {
        onResultRef.current(interim, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed")
        onErrorRef.current("Microphone access denied.");
      else if (event.error === "no-speech")
        onErrorRef.current("No speech detected.");
      else onErrorRef.current(`Speech error: ${event.error}`);
      setRecordingState("idle");
    };

    recognition.onend = () => {
      setRecordingState((prev) => (prev === "listening" ? "idle" : prev));
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [language, isSupported]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  return { isSupported, recordingState, startRecording, stopRecording };
}
