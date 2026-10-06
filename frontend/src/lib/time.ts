const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MINUTE = 60_000;

export function toDate(value: string | Date): Date {
  return typeof value === "string" ? new Date(value) : value;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Calendar days between the dates (local time), ignoring the clock. */
export function dayDiff(a: Date, now: Date): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(now) - start(a)) / 86_400_000);
}

export function formatClock(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

export function formatDate(d: Date, now: Date): string {
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** Signal-style relative time for list rows and bubble footers. */
export function formatListTime(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  const diff = now.getTime() - d.getTime();
  if (diff < MINUTE) return "Now";
  if (diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)}m`;
  if (sameDay(d, now)) return formatClock(d);
  const days = dayDiff(d, now);
  if (days < 7) return WEEKDAYS[d.getDay()];
  return formatDate(d, now);
}

export function formatLastSeen(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  const diff = now.getTime() - d.getTime();
  if (diff < MINUTE) return "Last seen just now";
  if (diff < 60 * MINUTE) return `Last seen ${Math.floor(diff / MINUTE)}m ago`;
  const days = dayDiff(d, now);
  if (days === 0) return `Last seen today at ${formatClock(d)}`;
  if (days === 1) return `Last seen yesterday at ${formatClock(d)}`;
  return `Last seen ${formatDate(d, now)}`;
}
