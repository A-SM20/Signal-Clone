import { describe, expect, it } from "vitest";
import type { MessageOut } from "./api/types";
import { groupTimeline } from "./grouping";

const ME = 1;
const now = new Date(2026, 9, 6, 15, 0);
let nextId = 1;

function m(sender: number | null, at: Date, kind = "text"): MessageOut {
  return {
    id: nextId++, conversation_id: 1, sender_id: sender, client_id: null, kind, body: "x",
    created_at: at.toISOString(), attachments: [], reactions: [],
  } as MessageOut;
}

const at = (h: number, min: number, day = 6) => new Date(2026, 9, day, h, min);

describe("groupTimeline", () => {
  it("clusters same sender within 3 minutes", () => {
    const items = groupTimeline([m(2, at(10, 0)), m(2, at(10, 1)), m(2, at(10, 2))], ME, now, true);
    const msgs = items.filter((i) => i.type === "message");
    expect(msgs.map((i) => i.type === "message" && i.position)).toEqual(["first", "middle", "last"]);
    expect(msgs.map((i) => i.type === "message" && i.showName)).toEqual([true, false, false]);
    expect(msgs.map((i) => i.type === "message" && i.showAvatar)).toEqual([false, false, true]);
  });

  it("breaks clusters on gap > 3 min, sender change, and day change", () => {
    const items = groupTimeline(
      [m(2, at(10, 0)), m(2, at(10, 4)), m(ME, at(10, 5)), m(ME, at(23, 59, 5)), m(ME, at(0, 1))],
      ME,
      now,
      true,
    );
    const positions = items.flatMap((i) => (i.type === "message" ? [i.position] : []));
    expect(positions).toEqual(["single", "single", "single", "single", "single"]);
  });

  it("never shows avatars or names for my own messages or in direct chats", () => {
    const own = groupTimeline([m(ME, at(10, 0))], ME, now, true)[1];
    const direct = groupTimeline([m(2, at(10, 0))], ME, now, false)[1];
    expect(own).toMatchObject({ showAvatar: false, showName: false });
    expect(direct).toMatchObject({ showAvatar: false, showName: false });
  });

  it("system messages stand alone", () => {
    const items = groupTimeline([m(2, at(10, 0)), m(null, at(10, 0), "system"), m(2, at(10, 1))], ME, now, true);
    const positions = items.flatMap((i) => (i.type === "message" ? [i.position] : []));
    expect(positions).toEqual(["single", "single", "single"]);
  });

  it("labels date separators Today/Yesterday/weekday/date", () => {
    const items = groupTimeline(
      [m(2, new Date(2026, 8, 12, 9, 0)), m(2, at(9, 0, 2)), m(2, at(9, 0, 5)), m(2, at(9, 0))],
      ME,
      now,
      true,
    );
    expect(items.filter((i) => i.type === "date").map((i) => i.type === "date" && i.label)).toEqual([
      "Sat, Sep 12",
      "Friday",
      "Yesterday",
      "Today",
    ]);
  });
});
