import { useCallback, useEffect, useRef, useState } from "react";
import type { WSEvent, ConnectionState } from "../types";
import { WS_URL } from "../utils/constants";

interface UseWebSocketOptions {
  onEvent: (event: WSEvent) => void;
  onAudioChunk?: (chunk: Uint8Array) => void;
}

export function useWebSocket({ onEvent, onAudioChunk }: UseWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const backoffRef = useRef(1000);
  const onEventRef = useRef(onEvent);
  const onAudioChunkRef = useRef(onAudioChunk);
  onEventRef.current = onEvent;
  onAudioChunkRef.current = onAudioChunk;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState("connecting");
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState("connected");
      backoffRef.current = 1000;
      console.log("[WS] Connected");
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onAudioChunkRef.current?.(new Uint8Array(event.data));
        return;
      }
      try {
        const data = JSON.parse(event.data) as WSEvent;
        onEventRef.current(data);
      } catch (e) {
        console.error("[WS] Failed to parse message:", e);
      }
    };

    ws.onclose = () => {
      setConnectionState("disconnected");
      wsRef.current = null;
      const delay = Math.min(backoffRef.current, 10000);
      reconnectTimer.current = setTimeout(connect, delay);
      backoffRef.current *= 1.5;
    };

    ws.onerror = () => {
      setConnectionState("error");
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const setWaking = useCallback(() => {
    setConnectionState("waking_up");
  }, []);

  return { connectionState, sendMessage, sendBinary, setWaking };
}
