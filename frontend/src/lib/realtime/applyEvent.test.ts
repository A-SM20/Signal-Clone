import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut, MessageOut, MessagePage } from "@/lib/api/types";
import { useUi } from "@/stores/ui";
import { applyEvent } from "./applyEvent";

const ME = 1;

function msg(id: number, partial: Partial<MessageOut> = {}): MessageOut {
  return {
    id, conversation_id: 7, sender_id: 2, client_id: `c-${id}`, kind: "text", body: `m${id}`,
    created_at: new Date(2026, 9, 6, 10, id).toISOString(), attachments: [], reactions: [], ...partial,
  } as MessageOut;
}

function conv(id: number, partial: Partial<ConversationOut> = {}): ConversationOut {
  return {
    id, kind: "direct", title: `C${id}`, members: [], unread_count: 0, last_message: null,
    last_activity_at: new Date(2026, 9, 6, 9, 0).toISOString(),
    me: { role: "member", request_state: "accepted", muted_until: null, is_archived: false, is_pinned: false, last_read_message_id: 0, left_at: null },
    ...partial,
  } as ConversationOut;
}

const created = (m: MessageOut) => ({ type: "message.created" as const, data: m, ts: "" });
const ctx = (open: number | null = null, visible = true) => ({ meId: ME, openConversationId: open, isVisible: visible });

function pages(qc: QueryClient): MessageOut[] {
  return qc.getQueryData<InfiniteData<MessagePage>>(qk.messages(7))!.pages.flatMap((p) => p.items);
}

describe("applyEvent", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(qk.conversations, [conv(7), conv(8, { last_activity_at: new Date(2026, 9, 6, 9, 30).toISOString() })]);
    qc.setQueryData<InfiniteData<MessagePage>>(qk.messages(7), {
      pages: [{ items: [msg(2), msg(1)], has_more: false }],
      pageParams: [null],
    });
    useUi.setState({ selectedId: 7 });
  });

  it("dedupes echo by client_id and id", () => {
    const optimistic = msg(-1, { client_id: "abc", sender_id: ME });
    qc.setQueryData<InfiniteData<MessagePage>>(qk.messages(7), (d) => ({
      ...d!,
      pages: [{ ...d!.pages[0], items: [optimistic, ...d!.pages[0].items] }],
    }));
    const server = msg(3, { client_id: "abc", sender_id: ME });
    applyEvent(qc, created(server), ctx(7));
    applyEvent(qc, created(server), ctx(7)); // same event twice (two tabs)
    expect(pages(qc).map((m) => m.id)).toEqual([3, 2, 1]);
  });

  it("increments unread only for others' messages in non-visible conversations", () => {
    applyEvent(qc, created(msg(3)), ctx(7, true));
    expect(qc.getQueryData<ConversationOut[]>(qk.conversations)!.find((c) => c.id === 7)!.unread_count).toBe(0);
    applyEvent(qc, created(msg(4)), ctx(7, false));
    applyEvent(qc, created(msg(5, { sender_id: ME })), ctx(null));
    expect(qc.getQueryData<ConversationOut[]>(qk.conversations)!.find((c) => c.id === 7)!.unread_count).toBe(1);
  });

  it("re-sorts the conversation list on new message", () => {
    applyEvent(qc, created(msg(3)), ctx(null));
    const list = qc.getQueryData<ConversationOut[]>(qk.conversations)!;
    expect(list[0].id).toBe(7);
    expect(list[0].last_message?.id).toBe(3);
  });

  it("replaces updated messages and drops removed ones", () => {
    applyEvent(qc, { type: "message.updated", data: msg(2, { body: "edited" }), ts: "" }, ctx(7));
    applyEvent(qc, { type: "message.removed", data: { conversation_id: 7, message_ids: [1] }, ts: "" }, ctx(7));
    expect(pages(qc).map((m) => m.body)).toEqual(["edited"]);
  });

  it("updates member cursors on receipt.updated", () => {
    qc.setQueryData(qk.conversations, [
      conv(7, {
        members: [
          { user: { id: 2 } as never, role: "member", request_state: "accepted", joined_at: "", left_at: null, last_delivered_message_id: 0, last_read_message_id: 0 },
        ],
      }),
    ]);
    applyEvent(qc, { type: "receipt.updated", data: { conversation_id: 7, user_id: 2, delivered_up_to: 5, read_up_to: 4 }, ts: "" }, ctx(7));
    const member = qc.getQueryData<ConversationOut[]>(qk.conversations)![0].members[0];
    expect([member.last_delivered_message_id, member.last_read_message_id]).toEqual([5, 4]);
  });

  it("removes conversation and clears selection on conversation.removed", () => {
    applyEvent(qc, { type: "conversation.removed", data: { conversation_id: 7 }, ts: "" }, ctx(7));
    expect(qc.getQueryData<ConversationOut[]>(qk.conversations)!.map((c) => c.id)).toEqual([8]);
    expect(useUi.getState().selectedId).toBeNull();
  });
});
