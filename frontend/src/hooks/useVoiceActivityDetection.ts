import { useCallback, useRef, useState } from "react";
import type { RecordingState } from "../types";
import { VAD_THRESHOLD, VAD_SILENCE_MS } from "../utils/constants";

interface UseVADOptions {
  onAudioCaptured: (blob: Blob) => void;
}

export function useVoiceActivityDetection({ onAudioCaptured }: UseVADOptions) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [rmsLevel, setRmsLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const hasSpeechRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const onAudioRef = useRef(onAudioCaptured);
  const startTimeRef = useRef(0);
  onAudioRef.current = onAudioCaptured;

  const stopCapture = useCallback(() => {
    clearTimeout(silenceTimerRef.current);
    cancelAnimationFrame(animFrameRef.current);
    hasSpeechRef.current = false;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecordingState("processing");
  }, []);

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      let audioCtx = audioCtxRef.current;
      if (!audioCtx || audioCtx.state === "closed") {
        audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
      }
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const elapsed = Date.now() - startTimeRef.current;
        console.log(`[VAD] Recording captured: ${blob.size} bytes in ${elapsed}ms`);
        if (blob.size > 100) {
          onAudioRef.current(blob);
        } else {
          setRecordingState("idle");
        }
      };

      startTimeRef.current = Date.now();
      recorder.start(100);
      setRecordingState("listening");
      hasSpeechRef.current = false;

      const dataArray = new Float32Array(analyser.frequencyBinCount);
      const monitor = () => {
        analyser.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / dataArray.length);
        setRmsLevel(rms);

        if (rms > VAD_THRESHOLD) {
          if (!hasSpeechRef.current) {
            console.log(`[VAD] Speech detected at RMS=${rms.toFixed(4)}`);
          }
          hasSpeechRef.current = true;
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (hasSpeechRef.current) {
              console.log(`[VAD] Silence detected, stopping recording`);
              stopCapture();
            }
          }, VAD_SILENCE_MS);
        }

        if (recorder.state === "recording") {
          animFrameRef.current = requestAnimationFrame(monitor);
        }
      };
      monitor();
    } catch (err) {
      console.error("Mic access denied:", err);
      setRecordingState("idle");
      throw new Error("Microphone access denied. Please allow microphone permissions.");
    }
  }, [stopCapture]);

  const manualStop = useCallback(() => {
    stopCapture();
  }, [stopCapture]);

  const resetState = useCallback(() => {
    setRecordingState("idle");
  }, []);

  return { recordingState, rmsLevel, startCapture, manualStop, resetState };
}
