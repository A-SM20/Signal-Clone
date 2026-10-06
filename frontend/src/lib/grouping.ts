import type { MessageOut } from "./api/types";
import { dayDiff, formatDate, sameDay } from "./time";

const CLUSTER_MS = 3 * 60_000;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type Position = "single" | "first" | "middle" | "last";
export type TimelineItem =
  | { type: "date"; key: string; label: string }
  | { type: "message"; key: string; message: MessageOut; position: Position; showAvatar: boolean; showName: boolean };

export function dateLabel(d: Date, now: Date): string {
  const days = dayDiff(d, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAY_NAMES[d.getDay()];
  return `${SHORT_WEEKDAYS[d.getDay()]}, ${formatDate(d, now)}`;
}

function clusters(a: MessageOut, b: MessageOut): boolean {
  if (a.kind === "system" || b.kind === "system" || a.sender_id !== b.sender_id) return false;
  const ta = new Date(a.created_at);
  const tb = new Date(b.created_at);
  return sameDay(ta, tb) && Math.abs(tb.getTime() - ta.getTime()) <= CLUSTER_MS;
}

/**
 * Signal's timeline grouping: date separators between days, and consecutive messages
 * from one sender within 3 minutes share a cluster (tight inner corners, one avatar/name).
 * `messages` must be oldest first.
 */
export function groupTimeline(messages: MessageOut[], meId: number, now: Date, isGroup: boolean): TimelineItem[] {
  const items: TimelineItem[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const day = new Date(m.created_at);
    if (!prev || !sameDay(new Date(prev.created_at), day)) {
      items.push({ type: "date", key: `d-${m.id}`, label: dateLabel(day, now) });
    }
    const joinsPrev = !!prev && clusters(prev, m);
    const joinsNext = !!next && clusters(m, next);
    const position: Position = joinsPrev ? (joinsNext ? "middle" : "last") : joinsNext ? "first" : "single";
    const incomingInGroup = isGroup && m.kind !== "system" && m.sender_id !== meId;
    items.push({
      type: "message",
      key: m.client_id ?? `m-${m.id}`,
      message: m,
      position,
      showAvatar: incomingInGroup && (position === "last" || position === "single"),
      showName: incomingInGroup && (position === "first" || position === "single"),
    });
  });
  return items;
}
