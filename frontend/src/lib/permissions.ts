import type { ConversationOut } from "./api/types";

/** UI gating only — the API enforces the same rules (403 not_admin / not_active_member). */
export function isActive(c: Pick<ConversationOut, "me">): boolean {
  return c.me.left_at === null;
}

export function canManageMembers(c: Pick<ConversationOut, "me" | "kind">): boolean {
  return c.kind === "group" && isActive(c) && c.me.role === "admin";
}

export const canEditGroupInfo = canManageMembers;

export function canRemove(c: Pick<ConversationOut, "me" | "kind">, targetUserId: number, meId: number): boolean {
  return canManageMembers(c) && targetUserId !== meId;
}
