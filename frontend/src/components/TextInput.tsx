import { useState, useCallback } from "react";
import type { Language } from "../types";
import { detectLanguage } from "../utils/languageDetector";
import { MAX_TEXT_LENGTH, RATE_LIMIT_DEBOUNCE_MS } from "../utils/constants";

interface TextInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function TextInput({ onSend, disabled }: TextInputProps) {
  const [text, setText] = useState("");
  const [lastSendTime, setLastSendTime] = useState(0);
  const detectedLang = detectLanguage(text);

  const handleSubmit = useCallback(() => {
    if (Date.now() - lastSendTime < RATE_LIMIT_DEBOUNCE_MS) return;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return;
    onSend(trimmed);
    setText("");
    setLastSendTime(Date.now());
  }, [text, lastSendTime, onSend]);

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder={detectedLang === "ta" ? "Tamilil ezhuthunga..." : "Type in English..."}
          disabled={disabled}
          rows={1}
          maxLength={MAX_TEXT_LENGTH}
          style={{
            width: "100%", padding: "12px 16px", borderRadius: "24px",
            border: "1px solid #dee2e6", fontSize: "15px", resize: "none",
            outline: "none", fontFamily: "inherit", lineHeight: "1.4",
            background: disabled ? "#f8f9fa" : "#fff",
          }}
        />
        {text.length > 0 && (
          <div style={{
            position: "absolute", right: "12px", bottom: "8px", fontSize: "11px",
            color: text.length > MAX_TEXT_LENGTH * 0.9 ? "#dc3545" : "#adb5bd",
          }}>
            {text.length}/{MAX_TEXT_LENGTH}
          </div>
        )}
      </div>
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        style={{
          padding: "12px 20px", borderRadius: "24px", border: "none",
          background: text.trim() ? "#007bff" : "#dee2e6",
          color: text.trim() ? "#fff" : "#adb5bd",
          fontSize: "15px", fontWeight: 600,
          cursor: text.trim() ? "pointer" : "not-allowed",
        }}
      >
        Send
      </button>
    </div>
  );
}
