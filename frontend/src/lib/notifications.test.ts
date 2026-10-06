import { describe, expect, it } from "vitest";
import type { ConversationOut, MessageOut, SettingsOut } from "./api/types";
import { notificationFor, unreadTitle } from "./notifications";

const ME = 1;
const now = new Date("2026-10-06T12:00:00Z").getTime();

const prefs = (p: Partial<SettingsOut> = {}) =>
  ({ notifications_enabled: true, notification_preview: "name_and_message", ...p }) as SettingsOut;

const conv = (p: Partial<ConversationOut> = {}) =>
  ({
    id: 7, kind: "direct", title: "Bob Martinez",
    me: { muted_until: null },
    members: [{ user: { id: 2, display_name: "Bob Martinez" } }],
    ...p,
  }) as unknown as ConversationOut;

const msg = (p: Partial<MessageOut> = {}) =>
  ({ id: 1, conversation_id: 7, sender_id: 2, kind: "text", body: "Hey there", ...p }) as MessageOut;

const hidden = { meId: ME, now, isVisible: false, openConversationId: null };

describe("notificationFor", () => {
  it("shows name and message by default", () => {
    expect(notificationFor(msg(), conv(), prefs(), hidden)).toEqual({ title: "Bob Martinez", body: "Hey there" });
  });
  it("uses group title and sender name in groups", () => {
    expect(notificationFor(msg(), conv({ kind: "group", title: "Hike" }), prefs(), hidden)).toEqual({
      title: "Hike",
      body: "Bob: Hey there",
    });
  });
  it("respects preview settings", () => {
    expect(notificationFor(msg(), conv(), prefs({ notification_preview: "name_only" }), hidden)).toEqual({
      title: "Bob Martinez",
      body: "New message",
    });
    expect(notificationFor(msg(), conv(), prefs({ notification_preview: "none" }), hidden)).toEqual({
      title: "Signal",
      body: "New message",
    });
  });
  it("is silent for own, system, muted, disabled, or visible-and-open conversations", () => {
    expect(notificationFor(msg({ sender_id: ME }), conv(), prefs(), hidden)).toBeNull();
    expect(notificationFor(msg({ kind: "system", sender_id: null }), conv(), prefs(), hidden)).toBeNull();
    expect(
      notificationFor(msg(), conv({ me: { muted_until: "2026-10-07T00:00:00Z" } } as never), prefs(), hidden),
    ).toBeNull();
    expect(notificationFor(msg(), conv(), prefs({ notifications_enabled: false }), hidden)).toBeNull();
    expect(notificationFor(msg(), conv(), prefs(), { ...hidden, isVisible: true, openConversationId: 7 })).toBeNull();
  });
  it("still notifies when visible but a different chat is open", () => {
    expect(notificationFor(msg(), conv(), prefs(), { ...hidden, isVisible: true, openConversationId: 3 })).not.toBeNull();
  });
});

describe("unreadTitle", () => {
  it("prefixes the unread count", () => {
    expect(unreadTitle(0)).toBe("Signal");
    expect(unreadTitle(3)).toBe("(3) Signal");
  });
});
