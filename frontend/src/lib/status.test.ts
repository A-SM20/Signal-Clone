import { describe, expect, it } from "vitest";
import type { ConversationOut, MemberOut, MessageOut } from "./api/types";
import { deriveStatus } from "./status";

const ME = 1;

function member(id: number, delivered: number | null, read: number | null, left = false): MemberOut {
  return {
    user: { id, phone: "", username: null, display_name: `U${id}`, about: null, avatar_url: null, avatar_color: "", online: false, last_seen_at: null },
    role: "member", request_state: "accepted", joined_at: "", left_at: left ? "2026-01-01T00:00:00Z" : null,
    last_delivered_message_id: delivered, last_read_message_id: read,
  };
}

const conv = (members: MemberOut[]) => ({ members }) as ConversationOut;
const msg = { id: 10, sender_id: ME } as MessageOut;

describe("deriveStatus", () => {
  it("derives sent/delivered/read in a direct chat", () => {
    expect(deriveStatus(msg, conv([member(ME, 10, 10), member(2, 9, 0)]), ME)).toBe("sent");
    expect(deriveStatus(msg, conv([member(ME, 10, 10), member(2, 10, 0)]), ME)).toBe("delivered");
    expect(deriveStatus(msg, conv([member(ME, 10, 10), member(2, 11, 11)]), ME)).toBe("read");
  });
  it("treats hidden (null) cursors as 0", () => {
    expect(deriveStatus(msg, conv([member(ME, 10, 10), member(2, 10, null)]), ME)).toBe("delivered");
  });
  it("needs every active member in a group and ignores members who left", () => {
    const members = [member(ME, 10, 10), member(2, 10, 10), member(3, 10, 4)];
    expect(deriveStatus(msg, conv(members), ME)).toBe("delivered");
    expect(deriveStatus(msg, conv([...members.slice(0, 2), member(3, 0, 0, true)]), ME)).toBe("read");
  });
  it("note to self is read", () => {
    expect(deriveStatus(msg, conv([member(ME, 0, 0)]), ME)).toBe("read");
  });
});
