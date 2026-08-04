import type { RecordingState } from "../types";

interface MicButtonProps {
  recordingState: RecordingState;
  rmsLevel: number;
  onToggle: () => void;
  manualStop: () => void;
}

export function MicButton({ recordingState, rmsLevel, onToggle, manualStop }: MicButtonProps) {
  const isActive = recordingState === "listening";
  const isProcessing = recordingState === "processing";

  const handleClick = () => {
    if (isActive) manualStop();
    else if (!isProcessing) onToggle();
  };

  const barCount = 5;
  const bars = Array.from({ length: barCount }, (_, i) => {
    const threshold = (i + 1) * 0.005;
    const active = rmsLevel > threshold;
    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          width: "3px",
          height: `${10 + i * 4}px`,
          background: active ? "#fff" : "rgba(255,255,255,0.3)",
          borderRadius: "2px",
          margin: "0 1px",
          transition: "background 0.1s",
        }}
      />
    );
  });

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing}
      style={{
        width: "64px",
        height: "64px",
        borderRadius: "50%",
        border: isActive ? "3px solid #dc3545" : "3px solid #007bff",
        background: isActive ? "#dc3545" : isProcessing ? "#ffc107" : "#007bff",
        color: "#fff",
        fontSize: "24px",
        cursor: isProcessing ? "wait" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
        boxShadow: isActive ? "0 0 0 4px rgba(220,53,69,0.3)" : "0 2px 8px rgba(0,123,255,0.3)",
        animation: isActive ? "pulse 1.5s infinite" : "none",
        position: "relative",
      }}
    >
      {isProcessing ? "..." : isActive ? bars : "🎙️"}
    </button>
  );
}
