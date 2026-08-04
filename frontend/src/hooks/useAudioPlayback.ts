import { useCallback, useRef } from "react";

export function useAudioPlayback() {
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const playChunk = useCallback((b64Data: string, onDone?: () => void) => {
    try {
      const byteString = atob(b64Data);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audioQueueRef.current.push(audio);

      if (!isPlayingRef.current) {
        playNext(onDone);
      }
    } catch (e) {
      console.error("Failed to queue audio chunk:", e);
    }
  }, []);

  const playNext = (onDone?: () => void) => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      onDone?.();
      return;
    }

    isPlayingRef.current = true;
    const audio = audioQueueRef.current.shift()!;
    currentAudioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      playNext(onDone);
    };

    audio.onerror = (e) => {
      console.warn("Audio playback error:", e);
      URL.revokeObjectURL(audio.src);
      playNext(onDone);
    };

    audio.play().catch((e) => {
      console.warn("Audio play() failed:", e);
      URL.revokeObjectURL(audio.src);
      playNext(onDone);
    });
  };

  const stopAll = useCallback(() => {
    audioQueueRef.current.forEach((a) => {
      a.pause();
      URL.revokeObjectURL(a.src);
    });
    audioQueueRef.current = [];
    currentAudioRef.current?.pause();
    isPlayingRef.current = false;
    currentAudioRef.current = null;
  }, []);

  return { playChunk, stopAll };
}
