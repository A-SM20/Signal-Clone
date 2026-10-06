import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { ConversationOut, MessageOut } from "@/lib/api/types";

export type PinOut = components["schemas"]["PinOut"];
export type PinDuration = "24h" | "7d" | "30d" | "forever";

export const PIN_DURATIONS: { value: PinDuration; label: string }[] = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "forever", label: "Forever" },
];

/** UI gating only — the API answers 403 not_admin for the same rule. */
export function canPin(c: Pick<ConversationOut, "kind" | "pin_permission" | "me">): boolean {
  if (c.me.left_at !== null) return false;
  return !(c.kind === "group" && c.pin_permission === "admins" && c.me.role !== "admin");
}

/** The pinned bar advances on each click and wraps; a shrinking list never leaves it out of range. */
export function nextPinIndex(current: number, count: number): number {
  return count === 0 ? 0 : (current + 1) % count;
}

export function pinMessage(m: MessageOut, duration: PinDuration): Promise<unknown> {
  return apiFetch(`/api/messages/${m.id}/pin`, { method: "POST", json: { duration } });
}

export function unpinMessage(messageId: number): Promise<unknown> {
  return apiFetch(`/api/messages/${messageId}/pin`, { method: "DELETE" });
}
