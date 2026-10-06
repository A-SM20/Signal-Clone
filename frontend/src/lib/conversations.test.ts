import { describe, expect, it } from "vitest";
import type { ConversationOut, MessageOut } from "./api/types";
import { previewText, sortConversations, systemText } from "./conversations";

const ME = 1;

function user(id: number, name: string) {
  return {
    id, phone: `+1555010000${id}`, username: null, display_name: name, about: null,
    avatar_url: null, avatar_color: "#000", online: false, last_seen_at: null,
  };
}

function msg(partial: Partial<MessageOut>): MessageOut {
  return {
    id: 1, conversation_id: 1, sender_id: 2, client_id: null, kind: "text", body: "hi",
    created_at: "2026-10-06T10:00:00Z", attachments: [], reactions: [], ...partial,
  } as MessageOut;
}

function conv(partial: Partial<ConversationOut>): ConversationOut {
  return {
    id: 1, kind: "direct", title: "Bob", description: null, avatar_url: null, avatar_color: "#000",
    is_note_to_self: false, disappearing_seconds: 0, pin_permission: "all",
    members: [
      { user: user(1, "Alice Chen"), role: "member", request_state: "accepted", joined_at: "", left_at: null, last_delivered_message_id: 0, last_read_message_id: 0 },
      { user: user(2, "Bob Martinez"), role: "member", request_state: "accepted", joined_at: "", left_at: null, last_delivered_message_id: 0, last_read_message_id: 0 },
    ],
    me: { role: "member", request_state: "accepted", muted_until: null, is_archived: false, is_pinned: false, last_read_message_id: 0, left_at: null },
    unread_count: 0, last_message: null, last_activity_at: "2026-10-06T10:00:00Z", ...partial,
  } as ConversationOut;
}

describe("sortConversations", () => {
  it("puts pinned chats first, then most recent", () => {
    const a = conv({ id: 1, last_activity_at: "2026-10-06T10:00:00Z" });
    const b = conv({ id: 2, last_activity_at: "2026-10-06T12:00:00Z" });
    const c = conv({ id: 3, last_activity_at: "2026-10-01T12:00:00Z", me: { ...a.me, is_pinned: true } });
    expect(sortConversations([a, b, c]).map((x) => x.id)).toEqual([3, 2, 1]);
  });
});

describe("previewText", () => {
  it("prefixes the sender in groups and 'You' for own messages", () => {
    const g = conv({ kind: "group", title: "Hike" });
    expect(previewText({ ...g, last_message: msg({ sender_id: 2, body: "hey" }) }, ME)).toBe("Bob: hey");
    expect(previewText({ ...g, last_message: msg({ sender_id: ME, body: "yo" }) }, ME)).toBe("You: yo");
  });
  it("does not prefix in direct chats except own", () => {
    expect(previewText(conv({ last_message: msg({ body: "hey" }) }), ME)).toBe("hey");
    expect(previewText(conv({ last_message: msg({ sender_id: ME, body: "yo" }) }), ME)).toBe("You: yo");
  });
  it("describes deleted, media, voice, poll and system messages", () => {
    expect(previewText(conv({ last_message: msg({ deleted_at: "x", body: null }) }), ME)).toBe("This message was deleted");
    expect(previewText(conv({ last_message: msg({ kind: "media", body: null }) }), ME)).toBe("📷 Photo");
    expect(previewText(conv({ last_message: msg({ kind: "voice", body: null }) }), ME)).toBe("🎤 Voice message");
    expect(
      previewText(conv({ last_message: msg({ kind: "poll", body: null, poll: { question: "Trail?", allow_multiple: false, ended_at: null, options: [] } }) }), ME),
    ).toBe("📊 Poll: Trail?");
    const sys = msg({ kind: "system", sender_id: null, body: null, system_event: { type: "member_added", actor_id: 2, user_ids: [1] } });
    expect(previewText(conv({ kind: "group", last_message: sys }), ME)).toBe("Bob added you");
  });
  it("is empty when there is no message", () => {
    expect(previewText(conv({}), ME)).toBe("");
  });
});

describe("systemText", () => {
  const names = (id: number) => ({ 1: "Alice", 2: "Bob", 3: "Carol" })[id] ?? "Someone";
  it("renders member events from my point of view", () => {
    expect(systemText({ type: "member_added", actor_id: 1, user_ids: [2, 3] }, names, ME)).toBe("You added Bob and Carol");
    expect(systemText({ type: "member_added", actor_id: 2, user_ids: [3] }, names, ME)).toBe("Bob added Carol");
    expect(systemText({ type: "member_removed", actor_id: 2, user_ids: [1] }, names, ME)).toBe("Bob removed you");
    expect(systemText({ type: "member_left", user_id: 3 }, names, ME)).toBe("Carol left the group");
    expect(systemText({ type: "group_created", actor_id: 1 }, names, ME)).toBe("You created the group");
    expect(systemText({ type: "title_changed", actor_id: 2, title: "Trail" }, names, ME)).toBe('Bob changed the group name to "Trail"');
    expect(systemText({ type: "role_changed", actor_id: 2, user_id: 1, role: "admin" }, names, ME)).toBe("Bob made you an admin");
    expect(systemText({ type: "timer_changed", actor_id: 2, seconds: 86400 }, names, ME)).toBe(
      "Bob set the disappearing message timer to 1 day",
    );
    expect(systemText({ type: "timer_changed", actor_id: 1, seconds: 0 }, names, ME)).toBe("You disabled disappearing messages");
  });
});
