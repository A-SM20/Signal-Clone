import { describe, expect, it } from "vitest";
import type { MessageOut } from "./api/types";
import { canDeleteForEveryone, canEdit, lastEditable } from "./editing";

const ME = 1;
const NOW = Date.parse("2026-10-07T10:00:00Z");

function msg(partial: Partial<MessageOut>): MessageOut {
  return {
    id: 1, conversation_id: 1, sender_id: ME, client_id: null, kind: "text", body: "hi",
    created_at: "2026-10-07T09:00:00Z", attachments: [], reactions: [], ...partial,
  } as MessageOut;
}

describe("edit and delete rules", () => {
  it("lets me edit my own text messages for 24 hours", () => {
    expect(canEdit(msg({}), ME, NOW)).toBe(true);
    expect(canEdit(msg({ sender_id: 2 }), ME, NOW)).toBe(false);
    expect(canEdit(msg({ kind: "media" }), ME, NOW)).toBe(false);
    expect(canEdit(msg({ deleted_at: "2026-10-07T09:30:00Z", body: null }), ME, NOW)).toBe(false);
    expect(canEdit(msg({ created_at: "2026-10-06T09:59:59Z" }), ME, NOW)).toBe(false);
  });

  it("lets me delete my own non-system messages for everyone for 24 hours", () => {
    expect(canDeleteForEveryone(msg({ kind: "media", body: null }), ME, NOW)).toBe(true);
    expect(canDeleteForEveryone(msg({ sender_id: 2 }), ME, NOW)).toBe(false);
    expect(canDeleteForEveryone(msg({ kind: "system", sender_id: null }), ME, NOW)).toBe(false);
    expect(canDeleteForEveryone(msg({ created_at: "2026-10-06T09:59:59Z" }), ME, NOW)).toBe(false);
  });

  it("finds my newest editable message", () => {
    const list = [
      msg({ id: 1, body: "old" }),
      msg({ id: 2, sender_id: 2 }),
      msg({ id: 3, body: "newest mine" }),
      msg({ id: 4, sender_id: 2 }),
    ];
    expect(lastEditable(list, ME, NOW)?.id).toBe(3);
    expect(lastEditable([msg({ sender_id: 2 })], ME, NOW)).toBeUndefined();
  });
});
