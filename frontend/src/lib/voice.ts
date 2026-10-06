import type { AttachmentOut } from "@/lib/api/types";
import { sendMessage } from "@/lib/messaging";
import { uploadAttachment } from "@/lib/upload";

export const WAVEFORM_BARS = 64;
export const MAX_VOICE_MS = 5 * 60 * 1000;

const CANDIDATES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

/** First container the browser can record (Chrome/Firefox: webm/opus, Safari: mp4). */
export function pickRecordingMime(isTypeSupported: (type: string) => boolean): string | null {
  return CANDIDATES.find((t) => isTypeSupported(t)) ?? null;
}

/** RMS per bucket, scaled so the loudest bar is 255 (all zeros for silence or too few samples). */
export function computeWaveform(samples: Float32Array, bars = WAVEFORM_BARS): number[] {
  const size = Math.floor(samples.length / bars);
  if (size === 0) return Array(bars).fill(0);
  const rms = Array.from({ length: bars }, (_, b) => {
    let sum = 0;
    for (let i = b * size; i < (b + 1) * size; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / size);
  });
  const peak = Math.max(...rms);
  return peak === 0 ? Array(bars).fill(0) : rms.map((v) => Math.round((v / peak) * 255));
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Upload the recording with its metadata, then send it through the outbox like any other message. */
export async function sendVoiceNote(
  conversationId: number,
  blob: Blob,
  durationMs: number,
  waveform: number[],
  replyToId: number | null = null,
): Promise<void> {
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const attachment: AttachmentOut = await uploadAttachment(blob, {
    filename: `Voice message.${ext}`,
    fields: { kind: "voice", duration_ms: String(Math.round(durationMs)), waveform: JSON.stringify(waveform) },
  });
  sendMessage({
    conversation_id: conversationId,
    kind: "voice",
    reply_to_id: replyToId,
    attachment_ids: [attachment.id],
    attachments: [attachment],
  });
}
