"use client";

import { Mic, SendHorizontal, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { computeWaveform, formatDuration, MAX_VOICE_MS, pickRecordingMime, sendVoiceNote } from "@/lib/voice";
import { toast } from "@/stores/toast";

interface Session {
  recorder: MediaRecorder;
  stream: MediaStream;
  audio: AudioContext;
  chunks: Blob[];
  levels: number[];
  started: number;
  sampler: ReturnType<typeof setInterval>;
  send: boolean;
}

/**
 * Mic button shown while the composer is empty. Recording covers the composer row with a timer,
 * a cancel button and a send button; recording stops by itself at 5 minutes and sends.
 */
export function VoiceRecorder({
  conversationId,
  replyToId,
  onSent,
}: {
  conversationId: number;
  replyToId?: number | null;
  onSent?: () => void;
}) {
  const session = useRef<Session | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const cleanup = () => {
    const s = session.current;
    if (!s) return;
    clearInterval(s.sampler);
    s.stream.getTracks().forEach((t) => t.stop());
    void s.audio.close().catch(() => {});
    session.current = null;
    setElapsed(null);
  };

  useEffect(() => () => {
    if (session.current) {
      session.current.send = false;
      session.current.recorder.stop();
      cleanup();
    }
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    const mime = typeof MediaRecorder === "undefined" ? null : pickRecordingMime((t) => MediaRecorder.isTypeSupported(t));
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      toast("Voice messages aren't supported in this browser");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Allow microphone access to record voice messages");
      return;
    }
    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    audio.createMediaStreamSource(stream).connect(analyser);
    const frame = new Float32Array(analyser.fftSize);
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const s: Session = {
      recorder,
      stream,
      audio,
      chunks: [],
      levels: [],
      started: Date.now(),
      send: true,
      sampler: setInterval(() => {
        // Sample the loudness every 50 ms; the waveform is built from these levels.
        analyser.getFloatTimeDomainData(frame);
        let sum = 0;
        for (const v of frame) sum += v * v;
        s.levels.push(Math.sqrt(sum / frame.length));
        const ms = Date.now() - s.started;
        setElapsed(ms);
        if (ms >= MAX_VOICE_MS) stop(true);
      }, 50),
    };
    recorder.ondataavailable = (e) => e.data.size && s.chunks.push(e.data);
    recorder.onstop = () => {
      const duration = Math.min(Date.now() - s.started, MAX_VOICE_MS);
      const blob = new Blob(s.chunks, { type: mime.split(";")[0] });
      const waveform = computeWaveform(Float32Array.from(s.levels));
      if (!s.send) return;
      if (duration < 500) {
        toast("Hold on — that recording was too short");
        return;
      }
      sendVoiceNote(conversationId, blob, duration, waveform, replyToId ?? null)
        .then(() => onSent?.())
        .catch((e) => toast(e instanceof ApiError ? e.message : "Couldn't send the voice message"));
    };
    session.current = s;
    setElapsed(0);
    recorder.start(250);
  };

  const stop = (send: boolean) => {
    const s = session.current;
    if (!s) return;
    s.send = send;
    if (s.recorder.state !== "inactive") s.recorder.stop();
    cleanup();
  };

  if (elapsed === null) {
    return (
      <button
        aria-label="Record voice message"
        onClick={() => void start()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-hover hover:text-fg"
      >
        <Mic size={20} />
      </button>
    );
  }

  return (
    <div className="absolute inset-x-3 bottom-[max(8px,env(safe-area-inset-bottom))] z-10 flex h-10 items-center gap-2 rounded-[20px] bg-surface-2 pr-0.5 pl-2">
      <button aria-label="Cancel recording" onClick={() => stop(false)} className="rounded-full p-1.5 text-danger hover:bg-hover">
        <Trash2 size={18} />
      </button>
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
      <span className="flex-1 text-[14px] tabular-nums" role="timer" aria-live="off">
        {formatDuration(elapsed)}
      </span>
      <span className="hidden text-[12px] text-fg-2 sm:inline">Recording…</span>
      <button
        aria-label="Send voice message"
        onClick={() => stop(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white"
      >
        <SendHorizontal size={17} />
      </button>
    </div>
  );
}
