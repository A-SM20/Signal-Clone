"use client";

import { Timer } from "lucide-react";
import type { MenuItem } from "@/components/ui/ContextMenu";
import { ApiError, apiFetch } from "@/lib/api/client";
import { upsertConversation } from "@/lib/api/hooks";
import type { ConversationOut } from "@/lib/api/types";
import { timerLabel } from "@/lib/conversations";
import { isActive } from "@/lib/permissions";
import { toast } from "@/stores/toast";

export const TIMER_OPTIONS = [0, 30, 300, 3600, 28800, 86400, 604800, 2419200];

/** Direct chats: any member. Groups: admins only (the API enforces the same). */
export function canSetTimer(c: ConversationOut): boolean {
  return isActive(c) && (c.kind === "direct" || c.me.role === "admin");
}

export async function setTimer(c: ConversationOut, seconds: number): Promise<void> {
  try {
    upsertConversation(
      await apiFetch<ConversationOut>(`/api/conversations/${c.id}`, { method: "PATCH", json: { disappearing_seconds: seconds } }),
    );
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Couldn't change the timer");
  }
}

export function timerMenuItems(c: ConversationOut): MenuItem[] {
  return TIMER_OPTIONS.map((s) => ({
    label: `${s === c.disappearing_seconds ? "✓ " : ""}${timerLabel(s)}`,
    onSelect: () => setTimer(c, s),
  }));
}

/** Small timer badge shown next to the chat name when disappearing messages are on. */
export function TimerBadge({ seconds }: { seconds: number }) {
  if (!seconds) return null;
  const short = timerLabel(seconds).replace(/ seconds?/, "s").replace(/ minutes?/, "m").replace(/ hours?/, "h").replace(/ days?/, "d").replace(/ weeks?/, "w");
  return (
    <span className="inline-flex items-center gap-0.5 text-[12px] font-normal text-fg-2" title={`Disappearing messages: ${timerLabel(seconds)}`}>
      <Timer size={13} />
      {short}
    </span>
  );
}
