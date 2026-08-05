import { useCallback, useRef, useState } from "react";
import type { RecordingState } from "../types";
import { VAD_THRESHOLD, VAD_SILENCE_MS } from "../utils/constants";

interface UseVADOptions {
  onAudioCaptured: (blob: Blob) => void;
}

const PRE_SPEECH_MS = 300;
const MIN_RECORDING_MS = 400;

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
  const preSpeechChunksRef = useRef<Blob[]>([]);
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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
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
      preSpeechChunksRef.current = [];

      let preSpeechTimer: ReturnType<typeof setTimeout> | null = null;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          if (!hasSpeechRef.current) {
            preSpeechChunksRef.current.push(e.data);
            if (preSpeechChunksRef.current.length > 15) {
              preSpeechChunksRef.current = preSpeechChunksRef.current.slice(-10);
            }
          } else {
            chunksRef.current.push(e.data);
          }
        }
      };

      recorder.onstop = () => {
        const preBlob = new Blob(preSpeechChunksRef.current, { type: mimeType });
        const mainBlob = new Blob(chunksRef.current, { type: mimeType });
        const blob = new Blob([preBlob, mainBlob], { type: mimeType });
        const elapsed = Date.now() - startTimeRef.current;
        console.log(`[VAD] Recording captured: ${blob.size} bytes in ${elapsed}ms (pre-speech: ${preSpeechChunksRef.current.length} chunks)`);
        if (blob.size > 200 && elapsed > MIN_RECORDING_MS) {
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
        let maxAbs = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = Math.abs(dataArray[i]);
          if (v > maxAbs) maxAbs = v;
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setRmsLevel(rms);

        if (rms > VAD_THRESHOLD) {
          if (!hasSpeechRef.current) {
            console.log(`[VAD] Speech detected at RMS=${rms.toFixed(4)}, peak=${maxAbs.toFixed(4)}`);
          }
          hasSpeechRef.current = true;
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (hasSpeechRef.current) {
              console.log(`[VAD] Silence detected after ${VAD_SILENCE_MS}ms, stopping recording`);
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
