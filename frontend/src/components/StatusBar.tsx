import type { ConnectionState } from "../types";

interface StatusBarProps {
  connectionState: ConnectionState;
  fallbackMode?: "whisper" | "browser_stt" | "browser_tts" | null;
}

const stateMap: Record<ConnectionState, { label: string; color: string }> = {
  connected: { label: "Connected", color: "#28a745" },
  connecting: { label: "Connecting...", color: "#ffc107" },
  waking_up: { label: "Waking up server...", color: "#ffc107" },
  disconnected: { label: "Disconnected", color: "#dc3545" },
  error: { label: "Connection error", color: "#dc3545" },
};

export function StatusBar({ connectionState, fallbackMode }: StatusBarProps) {
  const { label, color } = stateMap[connectionState];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderRadius: "12px", background: "rgba(0,0,0,0.05)", fontSize: "12px", color: "#495057" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span>{label}</span>
      {fallbackMode && (
        <span style={{ fontSize: "11px", color: "#6c757d" }}>
          ({fallbackMode === "browser_stt" ? "device voice input" : fallbackMode === "browser_tts" ? "device voice output" : fallbackMode})
        </span>
      )}
    </div>
  );
}
