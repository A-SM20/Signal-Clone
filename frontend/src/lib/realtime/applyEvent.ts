import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut, MessageOut, MessagePage } from "@/lib/api/types";
import { sortConversations } from "@/lib/conversations";
import { useAuth } from "@/stores/auth";
import { useTyping } from "@/stores/typing";
import { useUi } from "@/stores/ui";
import type { ServerEvent } from "./events";

export interface EventContext {
  meId: number;
  openConversationId: number | null;
  isVisible: boolean;
}

type Pages = InfiniteData<MessagePage>;

function mapMessages(qc: QueryClient, conversationId: number, fn: (items: MessageOut[], pageIndex: number) => MessageOut[]) {
  qc.setQueryData<Pages>(qk.messages(conversationId), (data) =>
    data ? { ...data, pages: data.pages.map((p, i) => ({ ...p, items: fn(p.items, i) })) } : data,
  );
}

function mapConversations(qc: QueryClient, fn: (list: ConversationOut[]) => ConversationOut[]) {
  qc.setQueryData<ConversationOut[]>(qk.conversations, (list) => (list ? fn(list) : list));
}

function patchConversation(qc: QueryClient, id: number, fn: (c: ConversationOut) => ConversationOut) {
  mapConversations(qc, (list) => list.map((c) => (c.id === id ? fn(c) : c)));
}

/** Inserts a message, replacing any copy with the same id or client_id (optimistic echo, second tab). */
export function upsertMessage(qc: QueryClient, m: MessageOut): void {
  let replaced = false;
  const same = (x: MessageOut) => x.id === m.id || (!!m.client_id && x.client_id === m.client_id);
  mapMessages(qc, m.conversation_id, (items) => {
    if (!items.some(same)) return items;
    replaced = true;
    let kept = false;
    return items.flatMap((x) => {
      if (!same(x)) return [x];
      if (kept) return [];
      kept = true;
      return [m];
    });
  });
  if (!replaced) {
    mapMessages(qc, m.conversation_id, (items, i) => (i === 0 ? [m, ...items] : items));
  }
}

function onMessageCreated(qc: QueryClient, m: MessageOut, ctx: EventContext) {
  upsertMessage(qc, m);
  const list = qc.getQueryData<ConversationOut[]>(qk.conversations);
  if (list && !list.some((c) => c.id === m.conversation_id)) {
    qc.invalidateQueries({ queryKey: qk.conversations });
    return;
  }
  const seen = ctx.openConversationId === m.conversation_id && ctx.isVisible;
  const counts = m.sender_id !== ctx.meId && m.kind !== "system" && !seen;
  mapConversations(qc, (all) =>
    sortConversations(
      all.map((c) =>
        c.id !== m.conversation_id || (c.last_message && c.last_message.id > m.id)
          ? c
          : {
              ...c,
              last_message: m,
              last_activity_at: m.created_at,
              unread_count: c.unread_count + (counts && c.last_message?.id !== m.id ? 1 : 0),
            },
      ),
    ),
  );
}

export function applyEvent(qc: QueryClient, e: ServerEvent, ctx: EventContext): void {
  switch (e.type) {
    case "message.created":
      return onMessageCreated(qc, e.data, ctx);
    case "message.updated":
      upsertMessage(qc, e.data);
      return patchConversation(qc, e.data.conversation_id, (c) =>
        c.last_message?.id === e.data.id ? { ...c, last_message: e.data } : c,
      );
    case "message.removed": {
      const ids = new Set(e.data.message_ids);
      mapMessages(qc, e.data.conversation_id, (items) => items.filter((m) => !ids.has(m.id)));
      const c = qc.getQueryData<ConversationOut[]>(qk.conversations)?.find((x) => x.id === e.data.conversation_id);
      if (c?.last_message && ids.has(c.last_message.id)) qc.invalidateQueries({ queryKey: qk.conversations });
      return;
    }
    case "reaction.updated":
      return mapMessages(qc, e.data.conversation_id, (items) =>
        items.map((m) => (m.id === e.data.message_id ? { ...m, reactions: e.data.reactions } : m)),
      );
    case "poll.updated":
      return mapMessages(qc, e.data.conversation_id, (items) =>
        items.map((m) =>
          m.id === e.data.message_id && m.poll
            ? { ...m, poll: { ...m.poll, options: e.data.options, ended_at: e.data.ended_at } }
            : m,
        ),
      );
    case "pin.updated":
      return patchConversation(qc, e.data.conversation_id, (c) => ({ ...c, pins: e.data.pins }) as ConversationOut);
    case "receipt.updated":
      return patchConversation(qc, e.data.conversation_id, (c) => ({
        ...c,
        members: c.members.map((m) =>
          m.user.id === e.data.user_id
            ? { ...m, last_delivered_message_id: e.data.delivered_up_to, last_read_message_id: e.data.read_up_to }
            : m,
        ),
      }));
    case "typing":
      return useTyping.getState().set(e.data.conversation_id, e.data.user_id, e.data.state);
    case "presence":
      return mapConversations(qc, (list) =>
        list.map((c) => ({
          ...c,
          members: c.members.map((m) =>
            m.user.id === e.data.user_id
              ? { ...m, user: { ...m.user, online: e.data.online, last_seen_at: e.data.last_seen_at } }
              : m,
          ),
        })),
      );
    case "conversation.updated":
      return mapConversations(qc, (list) => sortConversations([e.data, ...list.filter((c) => c.id !== e.data.id)]));
    case "conversation.removed":
      mapConversations(qc, (list) => list.filter((c) => c.id !== e.data.conversation_id));
      if (useUi.getState().selectedId === e.data.conversation_id) useUi.getState().select(null);
      return;
    case "device.revoked":
      return useAuth.getState().signOut();
  }
}
