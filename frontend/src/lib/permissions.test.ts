import { describe, expect, it } from "vitest";
import type { ConversationOut } from "./api/types";
import { canEditGroupInfo, canManageMembers, canRemove, isActive } from "./permissions";

const ME = 1;
const base = (role: "admin" | "member", left_at: string | null = null, kind: "group" | "direct" = "group") =>
  ({ kind, me: { role, left_at } }) as unknown as ConversationOut;

describe("permissions", () => {
  it("admins of groups they are still in can manage members and edit info", () => {
    expect(canManageMembers(base("admin"))).toBe(true);
    expect(canEditGroupInfo(base("admin"))).toBe(true);
  });
  it("members cannot", () => {
    expect(canManageMembers(base("member"))).toBe(false);
    expect(canEditGroupInfo(base("member"))).toBe(false);
  });
  it("nobody manages direct chats or groups they left", () => {
    expect(canManageMembers(base("admin", null, "direct"))).toBe(false);
    expect(canManageMembers(base("admin", "2026-01-01T00:00:00Z"))).toBe(false);
    expect(isActive(base("member", "2026-01-01T00:00:00Z"))).toBe(false);
    expect(isActive(base("member"))).toBe(true);
  });
  it("admins can remove others but not themselves (that's leaving)", () => {
    expect(canRemove(base("admin"), 2, ME)).toBe(true);
    expect(canRemove(base("admin"), ME, ME)).toBe(false);
    expect(canRemove(base("member"), 2, ME)).toBe(false);
  });
});
