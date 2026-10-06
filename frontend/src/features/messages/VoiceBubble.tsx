"use client";

import { Pause, Play } from "lucide-react";
import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import type { AttachmentOut } from "@/lib/api/types";
import { useSignedMedia } from "@/lib/useSignedMedia";
import { formatDuration } from "@/lib/voice";

const SPEEDS = [1, 1.5, 2];

/** Signal-style voice note: play/pause, waveform scrubber, elapsed/total time and a 1× → 1.5× → 2× toggle. */
export function VoiceBubble({ attachment: a, outgoing }: { attachment: AttachmentOut; outgoing: boolean }) {
  const { src, onError } = useSignedMedia(a.url);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const duration = a.duration_ms ?? 0;
  const bars = a.waveform?.length ? a.waveform : Array(64).fill(40);
  const progress = duration ? Math.min(1, position / duration) : 0;

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  // Only one voice note plays at a time, as in Signal.
  useEffect(() => {
    const stop = (e: Event) => {
      if (e.target !== audio.current) audio.current?.pause();
    };
    document.addEventListener("play", stop, true);
    return () => document.removeEventListener("play", stop, true);
  }, []);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(onError);
    else el.pause();
  };

  const seekTo = (fraction: number) => {
    const el = audio.current;
    if (!el || !duration) return;
    el.currentTime = (fraction * duration) / 1000;
    setPosition(fraction * duration);
  };

  const onScrub = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seekTo(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") seekTo(Math.min(1, progress + 0.05));
    if (e.key === "ArrowLeft") seekTo(Math.max(0, progress - 0.05));
  };

  const played = outgoing ? "bg-white" : "bg-fg";
  const unplayed = outgoing ? "bg-white/45" : "bg-fg-3";

  return (
    <div className="flex w-[250px] max-w-full items-center gap-2.5 py-0.5">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onError={onError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime * 1000)}
      />
      <button
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          outgoing ? "bg-white text-primary" : "bg-fg text-bg"
        }`}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Voice message position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration / 1000)}
          aria-valuenow={Math.round(position / 1000)}
          onClick={onScrub}
          onKeyDown={onKey}
          className="flex h-7 cursor-pointer items-center gap-px"
        >
          {bars.map((v, i) => (
            <span
              key={i}
              className={`w-[2px] shrink-0 rounded-full ${i / bars.length < progress ? played : unplayed}`}
              style={{ height: `${Math.max(3, (v / 255) * 26)}px` }}
            />
          ))}
        </div>
        <div className={`flex items-center justify-between text-[11px] ${outgoing ? "text-white/80" : "text-fg-2"}`}>
          <span>{formatDuration(playing || position ? position : duration)}</span>
          <button
            onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
            className={`rounded-full px-1.5 font-semibold ${outgoing ? "bg-white/20" : "bg-surface-2"}`}
            aria-label={`Playback speed ${speed}×`}
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  );
}
