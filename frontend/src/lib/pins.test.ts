import { describe, expect, it } from "vitest";
import type { ConversationOut } from "./api/types";
import { canPin, nextPinIndex } from "./pins";

const conv = (kind: "direct" | "group", role: "admin" | "member", perm: "all" | "admins", left: string | null = null) =>
  ({ kind, pin_permission: perm, me: { role, left_at: left, request_state: "accepted" } }) as unknown as ConversationOut;

describe("pins", () => {
  it("respects the group's pin permission", () => {
    expect(canPin(conv("direct", "member", "all"))).toBe(true);
    expect(canPin(conv("group", "member", "all"))).toBe(true);
    expect(canPin(conv("group", "member", "admins"))).toBe(false);
    expect(canPin(conv("group", "admin", "admins"))).toBe(true);
    expect(canPin(conv("group", "admin", "all", "2026-10-07T00:00:00Z"))).toBe(false);
  });

  it("cycles through pins and stays in range when pins disappear", () => {
    expect(nextPinIndex(0, 3)).toBe(1);
    expect(nextPinIndex(2, 3)).toBe(0);
    expect(nextPinIndex(2, 1)).toBe(0);
    expect(nextPinIndex(0, 0)).toBe(0);
  });
});
