import { useCallback, useEffect, useRef, useState } from "react";
import type { WSEvent, ConnectionState } from "../types";
import { WS_URL } from "../utils/constants";

interface UseWebSocketOptions {
  onEvent: (event: WSEvent) => void;
}

export function useWebSocket({ onEvent }: UseWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const backoffRef = useRef(1000);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState("connected");
      backoffRef.current = 1000;
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        onEventRef.current(data);
      } catch (e) {
        console.error("Failed to parse WS message:", e);
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

  const setWaking = useCallback(() => {
    setConnectionState("waking_up");
  }, []);

  return { connectionState, sendMessage, setWaking };
}
