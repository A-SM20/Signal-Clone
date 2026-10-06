import { apiFetch } from "@/lib/api/client";
import type { MessageOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { applyEvent } from "@/lib/realtime/applyEvent";
import type { ServerEvent } from "@/lib/realtime/events";

/** Mirrors backend EDIT_WINDOW / DELETE_FOR_EVERYONE_WINDOW. */
export const EDIT_WINDOW_MS = 24 * 3600_000;

const withinWindow = (m: MessageOut, now: number) => now - Date.parse(m.created_at) <= EDIT_WINDOW_MS;
const isSent = (m: MessageOut) => m.id > 0 && !("pending" in m);

export function canEdit(m: MessageOut, meId: number, now = Date.now()): boolean {
  return m.sender_id === meId && m.kind === "text" && !m.deleted_at && isSent(m) && withinWindow(m, now);
}

export function canDeleteForEveryone(m: MessageOut, meId: number, now = Date.now()): boolean {
  return m.sender_id === meId && m.kind !== "system" && !m.deleted_at && isSent(m) && withinWindow(m, now);
}

/** Newest message the ↑ shortcut should open for editing. `messages` is oldest-first. */
export function lastEditable(messages: MessageOut[], meId: number, now = Date.now()): MessageOut | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender_id === meId) return canEdit(messages[i], meId, now) ? messages[i] : undefined;
  }
  return undefined;
}

const local = (e: Omit<ServerEvent, "ts">) =>
  applyEvent(queryClient, { ...e, ts: new Date().toISOString() } as ServerEvent, {
    meId: 0,
    openConversationId: null,
    isVisible: false,
  });

export async function editMessage(m: MessageOut, body: string): Promise<void> {
  const res = await apiFetch<MessageOut>(`/api/messages/${m.id}`, { method: "PATCH", json: { body } });
  local({ type: "message.updated", data: res } as Omit<ServerEvent, "ts">);
}

export async function deleteMessage(m: MessageOut, scope: "me" | "everyone"): Promise<void> {
  await apiFetch(`/api/messages/${m.id}?scope=${scope}`, { method: "DELETE" });
  if (scope === "me") {
    local({ type: "message.removed", data: { conversation_id: m.conversation_id, message_ids: [m.id] } } as Omit<ServerEvent, "ts">);
  } else {
    local({
      type: "message.updated",
      data: { ...m, body: null, deleted_at: new Date().toISOString(), attachments: [], reactions: [], reply_to: null },
    } as Omit<ServerEvent, "ts">);
  }
}
