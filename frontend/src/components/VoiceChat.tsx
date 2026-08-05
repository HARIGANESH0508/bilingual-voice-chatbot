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

const STT_WARNING_MS = 12000;
const STT_TIMEOUT_MS = 25000;

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
  const [sttWarning, setSttWarning] = useState<"slow" | "timeout" | null>(null);
  const audioBufferRef = useRef("");
  const currentSentenceRef = useRef("");
  const sttTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const sttTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const { isSpeaking, speak, stop: stopSpeaking } = useSpeechSynthesis({ language });
  const { playChunk, stopAll: stopAudioPlayback } = useAudioPlayback();

  const handleVadAudio = useCallback(
    (blob: Blob) => {
      const t0 = performance.now();
      console.log(`[Pipeline] Audio captured, sending to backend...`);

      const reader = new FileReader();
      reader.onload = () => {
        const b64 = (reader.result as string).split(",")[1];
        const elapsed = Math.round(performance.now() - t0);
        console.log(`[Pipeline] Audio encoded in ${elapsed}ms, size=${b64.length}`);
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

  const { recordingState: vadState, rmsLevel, startCapture, manualStop: vadManualStop, resetState: vadReset } = useVoiceActivityDetection({
    onAudioCaptured: handleVadAudio,
  });

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
          setSttWarning(null);
          clearTimeout(sttTimerRef.current);
          clearTimeout(sttTimeoutRef.current);
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "user", text, language: lang, timestamp: Date.now(), source: (event.source as "text" | "voice" | "whisper") || "voice" },
          ]);
          break;
        }

        case "ai_start":
          setAiStreamingText("");
          currentSentenceRef.current = "";
          setSttWarning(null);
          clearTimeout(sttTimerRef.current);
          clearTimeout(sttTimeoutRef.current);
          setStatusMsg("");
          break;

        case "ai_token": {
          const token = event.token as string;
          setAiStreamingText((prev) => prev + token);
          currentSentenceRef.current += token;
          break;
        }

        case "ai_done": {
          const fullText = event.text as string;
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "ai", text: fullText, language, timestamp: Date.now() },
          ]);
          setAiStreamingText("");
          currentSentenceRef.current = "";
          setSttWarning(null);
          clearTimeout(sttTimerRef.current);
          clearTimeout(sttTimeoutRef.current);
          break;
        }

        case "audio_start":
          audioBufferRef.current = "";
          break;

        case "audio_chunk":
          audioBufferRef.current += event.data as string;
          break;

        case "audio_end": {
          const data = audioBufferRef.current;
          audioBufferRef.current = "";
          if (data) playChunk(data);
          vadReset();
          setSttWarning(null);
          clearTimeout(sttTimerRef.current);
          clearTimeout(sttTimeoutRef.current);
          break;
        }

        case "tts_fallback":
          setFallbackMode("browser_tts");
          vadReset();
          setSttWarning(null);
          clearTimeout(sttTimerRef.current);
          clearTimeout(sttTimeoutRef.current);
          break;

        case "error":
          setStatusMsg(`Error: ${event.message}`);
          vadReset();
          setSttWarning(null);
          clearTimeout(sttTimerRef.current);
          clearTimeout(sttTimeoutRef.current);
          break;

        case "pong":
          break;
      }
    },
    [language, playChunk, vadReset]
  );

  const handleAudioBinary = useCallback(
    (chunk: Uint8Array) => {
      let binary = "";
      for (let i = 0; i < chunk.length; i++) {
        binary += String.fromCharCode(chunk[i]);
      }
      playChunk(btoa(binary));
    },
    [playChunk]
  );

  const { connectionState, sendMessage, sendBinary, setWaking } = useWebSocket({
    onEvent: handleWSEvent,
    onAudioChunk: handleAudioBinary,
  });

  useEffect(() => {
    const checkHealth = async () => {
      setWaking();
      try {
        const start = Date.now();
        const res = await fetch(API_URL + "/api/health", { signal: AbortSignal.timeout(5000) });
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
              setStatusMsg("");
            }
          } catch {
            // keep polling
          }
        }, 3000);
      }
    };
    checkHealth();
  }, [setWaking]);

  useEffect(() => {
    window.speechSynthesis?.getVoices();
    const h = () => window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", h);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", h);
  }, []);

  useEffect(() => {
    if (statusMsg === "Transcribing...") {
      setSttWarning(null);
      sttTimerRef.current = setTimeout(() => setSttWarning("slow"), STT_WARNING_MS);
      sttTimeoutRef.current = setTimeout(() => setSttWarning("timeout"), STT_TIMEOUT_MS);
    } else {
      clearTimeout(sttTimerRef.current);
      clearTimeout(sttTimeoutRef.current);
      setSttWarning(null);
    }
    return () => {
      clearTimeout(sttTimerRef.current);
      clearTimeout(sttTimeoutRef.current);
    };
  }, [statusMsg]);

  const handleTextSend = useCallback(
    (text: string) => {
      setStatusMsg("");
      setSttWarning(null);
      clearTimeout(sttTimerRef.current);
      clearTimeout(sttTimeoutRef.current);
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

      {statusMsg && !micError && !sttWarning && (
        <div style={{ margin: "0 16px", padding: "8px 12px", borderRadius: "8px", background: "#e7f1ff", color: "#004085", fontSize: "13px" }}>
          {statusMsg}
        </div>
      )}

      {sttWarning === "slow" && (
        <div style={{ margin: "0 16px", padding: "8px 12px", borderRadius: "8px", background: "#fff3cd", color: "#856404", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>STT is taking longer than usual...</span>
          <button
            onClick={() => { setSttWarning(null); setStatusMsg(""); }}
            style={{ background: "none", border: "1px solid #856404", borderRadius: "4px", padding: "2px 8px", cursor: "pointer", color: "#856404", fontSize: "12px" }}
          >
            Cancel
          </button>
        </div>
      )}

      {sttWarning === "timeout" && (
        <div style={{ margin: "0 16px", padding: "10px 16px", borderRadius: "8px", background: "#f8d7da", color: "#721c24", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>STT timed out. Please try again.</span>
          <button
            onClick={() => { setSttWarning(null); setStatusMsg(""); }}
            style={{ background: "none", border: "1px solid #721c24", borderRadius: "4px", padding: "2px 8px", cursor: "pointer", color: "#721c24", fontSize: "12px" }}
          >
            Dismiss
          </button>
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
