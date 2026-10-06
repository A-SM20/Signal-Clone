"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { MessageOut, MessagePage } from "@/lib/api/types";
import { type OutboxEntry, useOutbox } from "@/stores/outbox";

const PAGE = 50;

export function useMessagePages(conversationId: number) {
  return useInfiniteQuery({
    queryKey: qk.messages(conversationId),
    queryFn: ({ pageParam }) =>
      apiFetch<MessagePage>(
        `/api/conversations/${conversationId}/messages?limit=${PAGE}${pageParam ? `&before=${pageParam}` : ""}`,
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.has_more ? last.items[last.items.length - 1].id : undefined),
  });
}

export type PendingMessage = MessageOut & { pending: OutboxEntry };

function asMessage(e: OutboxEntry, meId: number, index: number): PendingMessage {
  return {
    id: Number.MAX_SAFE_INTEGER - 1000 + index,
    conversation_id: e.conversation_id,
    sender_id: meId,
    client_id: e.client_id,
    kind: e.kind,
    body: e.body ?? null,
    reply_to: null,
    system_event: null,
    created_at: e.created_at,
    attachments: [],
    reactions: [],
    poll: null,
    pending: e,
  } as PendingMessage;
}

/** Server history (oldest first) followed by not-yet-acknowledged outbox messages. */
export function useTimelineMessages(conversationId: number, meId: number) {
  const query = useMessagePages(conversationId);
  const entries = useOutbox((s) => s.entries);
  const messages = useMemo(() => {
    const server = (query.data?.pages ?? []).flatMap((p) => p.items).reverse();
    const known = new Set(server.map((m) => m.client_id).filter(Boolean));
    const pending = Object.values(entries)
      .filter((e) => e.conversation_id === conversationId && !known.has(e.client_id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e, i) => asMessage(e, meId, i));
    return [...server, ...pending] as (MessageOut | PendingMessage)[];
  }, [query.data, entries, conversationId, meId]);
  return { ...query, messages };
}

export function isPending(m: MessageOut): m is PendingMessage {
  return "pending" in m;
}
