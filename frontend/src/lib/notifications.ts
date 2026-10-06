import type { ConversationOut, MessageOut, SettingsOut } from "./api/types";
import { memberName, messageSummary } from "./conversations";

interface NotifyContext {
  meId: number;
  now: number;
  isVisible: boolean;
  openConversationId: number | null;
}

/** What (if anything) to show as an OS notification for an incoming message. */
export function notificationFor(
  m: MessageOut,
  c: ConversationOut,
  prefs: Pick<SettingsOut, "notifications_enabled" | "notification_preview">,
  ctx: NotifyContext,
): { title: string; body: string } | null {
  if (!prefs.notifications_enabled || m.sender_id === ctx.meId || m.kind === "system") return null;
  if (c.me.muted_until && Date.parse(c.me.muted_until) > ctx.now) return null;
  if (ctx.isVisible && ctx.openConversationId === c.id) return null;
  if (prefs.notification_preview === "none") return { title: "Signal", body: "New message" };
  if (prefs.notification_preview === "name_only") return { title: c.title, body: "New message" };
  const nameOf = (id: number) => memberName(c, id).split(" ")[0];
  const text = messageSummary(m, nameOf, ctx.meId);
  const body = c.kind === "group" && m.sender_id ? `${nameOf(m.sender_id)}: ${text}` : text;
  return { title: c.title, body };
}

export function unreadTitle(total: number): string {
  return total > 0 ? `(${total}) Signal` : "Signal";
}
