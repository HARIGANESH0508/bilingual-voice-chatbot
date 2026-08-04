import { useRef, useEffect } from "react";
import type { ChatMessage } from "../types";

interface TranscriptProps {
  messages: ChatMessage[];
  interimText: string;
  aiStreamingText: string;
}

export function Transcript({ messages, interimText, aiStreamingText }: TranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, interimText, aiStreamingText]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        background: "#f8f9fa",
        borderRadius: "12px",
        minHeight: 0,
      }}
    >
      {messages.length === 0 && !interimText && !aiStreamingText && (
        <div style={{ textAlign: "center", color: "#6c757d", padding: "40px 20px", fontSize: "15px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎙️</div>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Start a conversation</div>
          <div>Talk in Tamil or English — I respond in the same language.</div>
          <div style={{ marginTop: "8px", fontSize: "13px", color: "#adb5bd" }}>
            Tap the mic or type below
          </div>
        </div>
      )}

      {messages.map((msg) => (
        <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
          <div
            style={{
              maxWidth: "80%",
              padding: "10px 16px",
              borderRadius: "16px",
              background: msg.role === "user" ? "#007bff" : "#fff",
              color: msg.role === "user" ? "#fff" : "#212529",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              fontSize: "15px",
              lineHeight: "1.5",
              wordBreak: "break-word",
            }}
          >
            {msg.text}
          </div>
          <div style={{ fontSize: "11px", color: "#adb5bd", marginTop: "4px", padding: "0 8px" }}>
            {msg.language === "ta" ? "Tamil" : "English"}
            {msg.source ? ` (${msg.source})` : ""}
          </div>
        </div>
      ))}

      {interimText && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div
            style={{
              maxWidth: "80%",
              padding: "10px 16px",
              borderRadius: "16px",
              background: "#007bff",
              color: "#fff",
              opacity: 0.7,
              fontSize: "15px",
              fontStyle: "italic",
            }}
          >
            {interimText}
          </div>
        </div>
      )}

      {aiStreamingText && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div
            style={{
              maxWidth: "80%",
              padding: "10px 16px",
              borderRadius: "16px",
              background: "#fff",
              color: "#212529",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              fontSize: "15px",
              lineHeight: "1.5",
              wordBreak: "break-word",
            }}
          >
            {aiStreamingText}
            <span style={{ display: "inline-block", width: "2px", height: "16px", background: "#007bff", marginLeft: "2px", animation: "blink 1s infinite", verticalAlign: "text-bottom" }} />
          </div>
        </div>
      )}
    </div>
  );
}
