import { describe, expect, it } from "vitest";
import { computeWaveform, formatDuration, pickRecordingMime } from "./voice";

describe("voice", () => {
  it("prefers webm/opus, falls back to mp4", () => {
    expect(pickRecordingMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecordingMime((t) => t === "audio/ogg;codecs=opus" || t === "audio/mp4")).toBe("audio/ogg;codecs=opus");
    expect(pickRecordingMime((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecordingMime(() => false)).toBeNull();
  });

  it("computeWaveform returns 64 values in 0..255 and peaks at loud regions", () => {
    const samples = new Float32Array(6400);
    for (let i = 0; i < samples.length; i++) samples[i] = (i >= 3200 && i < 3300 ? 0.9 : 0.05) * Math.sin(i);
    const bars = computeWaveform(samples);
    expect(bars).toHaveLength(64);
    expect(bars.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
    expect(bars.indexOf(Math.max(...bars))).toBe(32);
    expect(Math.max(...bars)).toBe(255);
    expect(computeWaveform(new Float32Array(10))).toEqual(Array(64).fill(0));
  });

  it("formats durations", () => {
    expect(formatDuration(7000)).toBe("0:07");
    expect(formatDuration(65000)).toBe("1:05");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(299999)).toBe("4:59");
  });
});
