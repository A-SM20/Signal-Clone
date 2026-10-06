import type { ConversationOut, MessageOut, UserOut } from "./api/types";

export type SystemEvent = { type: string; [key: string]: unknown };
type NameOf = (userId: number) => string;

const TIMER_LABELS: Record<number, string> = {
  30: "30 seconds",
  300: "5 minutes",
  3600: "1 hour",
  28800: "8 hours",
  86400: "1 day",
  604800: "1 week",
  2419200: "4 weeks",
};

export function timerLabel(seconds: number): string {
  return seconds === 0 ? "Off" : (TIMER_LABELS[seconds] ?? `${seconds} seconds`);
}

export function sortConversations(list: ConversationOut[]): ConversationOut[] {
  return [...list].sort((a, b) => {
    if (a.me.is_pinned !== b.me.is_pinned) return a.me.is_pinned ? -1 : 1;
    return Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at);
  });
}

export function memberName(c: ConversationOut, userId: number): string {
  return c.members.find((m) => m.user.id === userId)?.user.display_name ?? "Someone";
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Human text for group notices, from the viewer's point of view ("You added Bob"). */
export function systemText(event: SystemEvent, nameOf: NameOf, meId: number): string {
  const who = (id: unknown, subject = true) =>
    id === meId ? (subject ? "You" : "you") : nameOf(Number(id));
  const ids = (event.user_ids as number[] | undefined) ?? [];
  switch (event.type) {
    case "group_created":
      return `${who(event.actor_id)} created the group`;
    case "member_added":
      return `${who(event.actor_id)} added ${list(ids.map((id) => who(id, false)))}`;
    case "member_removed":
      return `${who(event.actor_id)} removed ${list(ids.map((id) => who(id, false)))}`;
    case "member_left":
      return `${who(event.user_id)} left the group`;
    case "title_changed":
      return `${who(event.actor_id)} changed the group name to "${event.title}"`;
    case "role_changed":
      return event.role === "admin"
        ? `${who(event.actor_id)} made ${who(event.user_id, false)} an admin`
        : `${who(event.actor_id)} removed ${who(event.user_id, false)} as an admin`;
    case "timer_changed":
      return Number(event.seconds) === 0
        ? `${who(event.actor_id)} disabled disappearing messages`
        : `${who(event.actor_id)} set the disappearing message timer to ${timerLabel(Number(event.seconds))}`;
    case "safety_number_changed":
      return `Your safety number with ${nameOf(Number(event.user_id))} has changed`;
    default:
      return "Group updated";
  }
}

/** One-line body summary (no sender prefix). */
export function messageSummary(m: MessageOut, nameOf: NameOf, meId: number): string {
  if (m.deleted_at) return "This message was deleted";
  if (m.kind === "system" && m.system_event) return systemText(m.system_event as SystemEvent, nameOf, meId);
  if (m.kind === "poll") return `📊 Poll: ${m.poll?.question ?? ""}`;
  if (m.kind === "voice") return "🎤 Voice message";
  if (m.kind === "media") {
    if (m.body) return m.body;
    const isImage = m.attachments?.[0]?.kind === "image" || !m.attachments?.length;
    return isImage ? "📷 Photo" : `📎 ${m.attachments[0].original_name}`;
  }
  return m.body ?? "";
}

export function previewText(c: ConversationOut, meId: number): string {
  const m = c.last_message;
  if (!m) return "";
  const nameOf = (id: number) => firstName(memberName(c, id));
  const text = messageSummary(m, nameOf, meId);
  if (m.kind === "system" || m.deleted_at) return text;
  if (m.sender_id === meId) return `You: ${text}`;
  return c.kind === "group" && m.sender_id ? `${nameOf(m.sender_id)}: ${text}` : text;
}

export function otherMember(c: ConversationOut, meId: number): UserOut | null {
  if (c.kind !== "direct" || c.is_note_to_self) return null;
  return c.members.find((m) => m.user.id !== meId)?.user ?? null;
}

export function isMuted(c: ConversationOut, now = Date.now()): boolean {
  return !!c.me.muted_until && Date.parse(c.me.muted_until) > now;
}
