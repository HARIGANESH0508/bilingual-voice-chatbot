import { useCallback, useRef } from "react";

export function useAudioPlayback() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playQueueRef = useRef<Array<{ data: string; resolve: () => void }>>([]);
  const isPlayingRef = useRef(false);

  const getCtx = useCallback(async () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playNext = useCallback(async () => {
    if (playQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const item = playQueueRef.current.shift()!;

    try {
      const ctx = await getCtx();
      const byteString = atob(item.data);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(ab);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        item.resolve();
        playNext();
      };
      source.start(0);
    } catch (e) {
      console.warn("[Audio] Playback error, skipping chunk:", e);
      item.resolve();
      playNext();
    }
  }, [getCtx]);

  const playChunk = useCallback((b64Data: string) => {
    return new Promise<void>((resolve) => {
      playQueueRef.current.push({ data: b64Data, resolve });
      if (!isPlayingRef.current) {
        playNext();
      }
    });
  }, [playNext]);

  const stopAll = useCallback(() => {
    playQueueRef.current.forEach((item) => item.resolve());
    playQueueRef.current = [];
    isPlayingRef.current = false;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  return { playChunk, stopAll };
}
