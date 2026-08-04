import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, Language, WSEvent, ConnectionState } from "../types";
import { useWebSocket } from "../hooks/useWebSocket";
import { useVoiceActivityDetection } from "../hooks/useVoiceActivityDetection";
import { useAudioPlayback } from "../hooks/useAudioPlayback";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { Transcript } from "./Transcript";
import { MicButton } from "./MicButton";
import { TextInput } from "./TextInput";
import { StatusBar } from "./StatusBar";
import { detectLanguage } from "../utils/languageDetector";
import { API_URL } from "../utils/constants";

let msgId = 0;
const nextId = () => `msg-${Date.now()}-${++msgId}`;

export function VoiceChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [interimText, setInterimText] = useState("");
  const [aiStreamingText, setAiStreamingText] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [statusMsg, setStatusMsg] = useState("");
  const [micError, setMicError] = useState("");
  const [fallbackMode, setFallbackMode] = useState<"whisper" | "browser_stt" | "browser_tts" | null>(null);
  const [backendAwake, setBackendAwake] = useState(false);
  const pendingAudioRef = useRef("");
  const currentSentenceRef = useRef("");

  const { isSpeaking, speak, stop: stopSpeaking } = useSpeechSynthesis({ language });
  const { playChunk, stopAll: stopAudioPlayback } = useAudioPlayback();

  // VAD audio capture -> send to backend Whisper
  const handleVadAudio = useCallback(
    (blob: Blob) => {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(",")[1];
        sendMessage({
          type: "user_audio",
          data: b64,
          mime_type: blob.type || "audio/webm",
          language,
        });
      };
      reader.readAsDataURL(blob);
    },
    [language]
  );

  const { recordingState: vadState, rmsLevel, startCapture, manualStop: vadManualStop } = useVoiceActivityDetection({
    onAudioCaptured: handleVadAudio,
  });

  // Browser STT fallback
  const handleSttResult = useCallback(
    (text: string, isFinal: boolean) => {
      if (isFinal) {
        setInterimText("");
        const detected = detectLanguage(text);
        setLanguage(detected);
        sendMessage({ type: "user_text", text, language: detected });
      } else {
        setInterimText(text);
      }
    },
    []
  );

  const handleSttError = useCallback((error: string) => {
    setMicError(error);
    setTimeout(() => setMicError(""), 5000);
  }, []);

  const {
    isSupported: sttSupported,
    recordingState: sttState,
    startRecording: sttStart,
    stopRecording: sttStop,
  } = useSpeechRecognition({ language, onResult: handleSttResult, onError: handleSttError });

  // Mic toggle: try VAD first, fall back to browser STT
  const handleMicToggle = useCallback(async () => {
    if (isSpeaking) {
      stopSpeaking();
      stopAudioPlayback();
      return;
    }
    if (aiStreamingText) return;
    setMicError("");
    try {
      await startCapture();
    } catch {
      if (sttSupported) {
        setFallbackMode("browser_stt");
        sttStart();
      }
    }
  }, [startCapture, sttSupported, sttStart, isSpeaking, stopSpeaking, stopAudioPlayback, aiStreamingText]);

  const handleMicManualStop = useCallback(() => {
    vadManualStop();
    sttStop();
  }, [vadManualStop, sttStop]);

  const activeRecordingState = vadState === "idle" ? sttState : vadState;

  // WebSocket event handler
  const handleWSEvent = useCallback(
    (event: WSEvent) => {
      switch (event.type) {
        case "session_info":
          break;

        case "status":
          setStatusMsg(event.message as string);
          break;

        case "transcript": {
          const text = event.text as string;
          const lang = event.language as Language;
          setLanguage(lang);
          setInterimText("");
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "user", text, language: lang, timestamp: Date.now(), source: (event.source as "text" | "voice" | "whisper") || "voice" },
          ]);
          break;
        }

        case "ai_start":
          setAiStreamingText("");
          currentSentenceRef.current = "";
          break;

        case "ai_token": {
          const token = event.token as string;
          setAiStreamingText((prev) => prev + token);
          currentSentenceRef.current += token;

          const sentenceEnders = /[.!?\u0964\u0965]/;
          if (sentenceEnders.test(token) && currentSentenceRef.current.trim().length > 5) {
            const sentence = currentSentenceRef.current.trim();
            currentSentenceRef.current = "";
            synthesizeAndPlay(sentence, language);
          }
          break;
        }

        case "ai_done": {
          const fullText = event.text as string;
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "ai", text: fullText, language, timestamp: Date.now() },
          ]);
          setAiStreamingText("");

          if (currentSentenceRef.current.trim().length > 0) {
            synthesizeAndPlay(currentSentenceRef.current.trim(), language);
            currentSentenceRef.current = "";
          }
          break;
        }

        case "audio_start":
          pendingAudioRef.current = "";
          break;

        case "audio_chunk":
          pendingAudioRef.current += event.data as string;
          break;

        case "audio_end": {
          const data = pendingAudioRef.current;
          pendingAudioRef.current = "";
          if (data) playChunk(data);
          break;
        }

        case "tts_fallback":
          setFallbackMode("browser_tts");
          break;

        case "error":
          setStatusMsg(`Error: ${event.message}`);
          break;

        case "pong":
          break;
      }
    },
    [language, playChunk]
  );

  // Sentence-level TTS: send completed sentence to backend for edge-tts
  const synthesizeAndPlay = useCallback(
    (sentence: string, lang: Language) => {
      sendMessage({ type: "user_text", text: sentence, language: lang, tts_only: true });
    },
    []
  );

  // Note: sentence-level TTS is handled by backend ai_done event streaming
  // The above is a placeholder for a dedicated tts endpoint if needed

  const { connectionState, sendMessage, setWaking } = useWebSocket({ onEvent: handleWSEvent });

  // Cold-start detection
  useEffect(() => {
    const checkHealth = async () => {
      setWaking();
      try {
        const start = Date.now();
        const res = await fetch(API_URL + "/api/health", { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error("not ok");
        const elapsed = Date.now() - start;
        setBackendAwake(true);
        if (elapsed > 3000) setStatusMsg("Server is ready!");
      } catch {
        setStatusMsg("Waking up server, this may take up to 30 seconds...");
        const poll = setInterval(async () => {
          try {
            const res = await fetch(API_URL + "/api/health", { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
              clearInterval(poll);
              setBackendAwake(true);
              setStatusMsg("Server is ready!");
            }
          } catch {
            // keep polling
          }
        }, 3000);
      }
    };
    checkHealth();
  }, [setWaking]);

  // Load browser voices
  useEffect(() => {
    window.speechSynthesis?.getVoices();
    const h = () => window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", h);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", h);
  }, []);

  const handleTextSend = useCallback(
    (text: string) => {
      const detected = detectLanguage(text);
      setLanguage(detected);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", text, language: detected, timestamp: Date.now(), source: "text" },
      ]);
      sendMessage({ type: "user_text", text, language: detected });
    },
    [sendMessage]
  );

  const canUseMic = connectionState === "connected" && backendAwake;

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column", background: "#fff" }}>
      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      <header style={{ padding: "16px", borderBottom: "1px solid #e9ecef", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "18px", fontWeight: 700 }}>Voice Chat</h1>
          <div style={{ fontSize: "13px", color: "#6c757d" }}>Tamil + English</div>
        </div>
        <StatusBar connectionState={connectionState} fallbackMode={fallbackMode} />
      </header>

      <Transcript messages={messages} interimText={interimText} aiStreamingText={aiStreamingText} />

      {micError && (
        <div style={{ margin: "0 16px", padding: "10px 16px", borderRadius: "8px", background: "#fff3cd", color: "#856404", fontSize: "13px" }}>
          {micError}
        </div>
      )}

      {statusMsg && !micError && (
        <div style={{ margin: "0 16px", padding: "8px 12px", borderRadius: "8px", background: "#e7f1ff", color: "#004085", fontSize: "13px" }}>
          {statusMsg}
        </div>
      )}

      <footer style={{ padding: "16px", borderTop: "1px solid #e9ecef", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
        <MicButton
          recordingState={activeRecordingState}
          rmsLevel={rmsLevel}
          onToggle={handleMicToggle}
          manualStop={handleMicManualStop}
        />
        <TextInput onSend={handleTextSend} disabled={!canUseMic} />
        <div style={{ fontSize: "11px", color: "#adb5bd", textAlign: "center" }}>
          {language === "ta" ? "Tamilil pesavum ezhuthavum" : "Speak or type in English"}
          {isSpeaking ? " ... AI is speaking" : ""}
        </div>
      </footer>
    </div>
  );
}
