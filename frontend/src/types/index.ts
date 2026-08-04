export type Language = "ta" | "en";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  language: Language;
  timestamp: number;
  source?: "text" | "voice" | "whisper";
}

export type WSEventType =
  | "session_info"
  | "status"
  | "transcript"
  | "ai_start"
  | "ai_token"
  | "ai_done"
  | "audio_start"
  | "audio_chunk"
  | "audio_end"
  | "tts_fallback"
  | "error"
  | "pong";

export interface WSEvent {
  type: WSEventType;
  [key: string]: unknown;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "waking_up" | "error";
export type RecordingState = "idle" | "listening" | "processing";
