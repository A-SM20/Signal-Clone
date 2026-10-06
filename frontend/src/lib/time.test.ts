import { describe, expect, it } from "vitest";
import { formatClock, formatLastSeen, formatListTime } from "./time";

const now = new Date(2026, 9, 6, 15, 30); // Tue Oct 6 2026, 3:30 PM local

describe("formatListTime", () => {
  it("shows Now under a minute", () => {
    expect(formatListTime(new Date(2026, 9, 6, 15, 29, 30), now)).toBe("Now");
  });
  it("shows minutes under an hour", () => {
    expect(formatListTime(new Date(2026, 9, 6, 15, 5), now)).toBe("25m");
  });
  it("shows clock time earlier today", () => {
    expect(formatListTime(new Date(2026, 9, 6, 9, 7), now)).toBe("9:07 AM");
  });
  it("shows weekday within the last 6 days", () => {
    expect(formatListTime(new Date(2026, 9, 2, 12, 0), now)).toBe("Fri");
  });
  it("shows month and day for older dates in the same year", () => {
    expect(formatListTime(new Date(2026, 8, 12, 12, 0), now)).toBe("Sep 12");
  });
  it("adds the year for other years", () => {
    expect(formatListTime(new Date(2025, 11, 31, 12, 0), now)).toBe("Dec 31, 2025");
  });
});

describe("formatClock / formatLastSeen", () => {
  it("formats 12-hour clock times", () => {
    expect(formatClock(new Date(2026, 9, 6, 0, 5))).toBe("12:05 AM");
    expect(formatClock(new Date(2026, 9, 6, 13, 45))).toBe("1:45 PM");
  });
  it("describes last seen", () => {
    expect(formatLastSeen(new Date(2026, 9, 6, 15, 29, 50), now)).toBe("Last seen just now");
    expect(formatLastSeen(new Date(2026, 9, 6, 15, 10), now)).toBe("Last seen 20m ago");
    expect(formatLastSeen(new Date(2026, 9, 6, 9, 7), now)).toBe("Last seen today at 9:07 AM");
    expect(formatLastSeen(new Date(2026, 9, 5, 21, 0), now)).toBe("Last seen yesterday at 9:00 PM");
    expect(formatLastSeen(new Date(2026, 8, 12, 12, 0), now)).toBe("Last seen Sep 12");
  });
});
