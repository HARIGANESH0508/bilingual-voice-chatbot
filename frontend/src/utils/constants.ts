const WS_BASE = import.meta.env.VITE_BACKEND_WS_URL || "wss://bilingual-voice-chatbot.onrender.com";
export const WS_URL = WS_BASE + "/ws/chat";
export const API_URL = WS_BASE.replace("ws://", "http://").replace("wss://", "https://");

export const RATE_LIMIT_DEBOUNCE_MS = 1000;
export const MAX_TEXT_LENGTH = 500;

export const VAD_THRESHOLD = 0.008;
export const VAD_SILENCE_MS = 1800;
