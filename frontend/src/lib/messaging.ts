import { apiFetch } from "@/lib/api/client";
import type { MessageOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { applyEvent } from "@/lib/realtime/applyEvent";
import { useAuth } from "@/stores/auth";
import { type OutboxDraft, type OutboxEntry, useOutbox } from "@/stores/outbox";
import { useUi } from "@/stores/ui";

/** POSTs one outbox entry; the server is idempotent on client_id, so retries are safe. */
export async function sendOutboxEntry(entry: OutboxEntry): Promise<MessageOut> {
  const message = await apiFetch<MessageOut>(`/api/conversations/${entry.conversation_id}/messages`, {
    method: "POST",
    json: {
      client_id: entry.client_id,
      kind: entry.kind,
      body: entry.body ?? null,
      reply_to_id: entry.reply_to_id ?? null,
      attachment_ids: entry.attachment_ids ?? [],
      ...(entry.poll ? { poll: entry.poll } : {}),
    },
  });
  applyEvent(
    queryClient,
    { type: "message.created", data: message, ts: "" },
    { meId: useAuth.getState().me?.id ?? 0, openConversationId: useUi.getState().selectedId, isVisible: true },
  );
  return message;
}

export function newClientId(): string {
  return crypto.randomUUID();
}

/** Optimistic send: the bubble shows immediately with a clock and resolves to ✓ once the server acks. */
export function sendMessage(draft: Omit<OutboxDraft, "client_id">): string {
  const client_id = newClientId();
  useOutbox.getState().enqueue({ ...draft, client_id });
  void useOutbox.getState().flush(sendOutboxEntry);
  return client_id;
}

export function retryMessage(clientId: string): void {
  void useOutbox.getState().retry(clientId, sendOutboxEntry);
}
