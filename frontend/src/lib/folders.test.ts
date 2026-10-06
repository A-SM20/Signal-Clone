import { describe, expect, it } from "vitest";
import type { ConversationOut } from "./api/types";
import { type FolderOut, inFolder, PRESETS } from "./folders";

const conv = (id: number, kind: "direct" | "group", unread = 0) => ({ id, kind, unread_count: unread }) as ConversationOut;
const folder = (f: Partial<FolderOut>): FolderOut => ({
  id: 1, name: "F", position: 0, include_direct: false, include_groups: false, unread_only: false, conversation_ids: [], ...f,
});

describe("inFolder", () => {
  it("matches explicit, type-based and unread-only folders", () => {
    expect(inFolder(conv(1, "direct"), "all")).toBe(true);
    expect(inFolder(conv(5, "group"), folder({ conversation_ids: [5] }))).toBe(true);
    expect(inFolder(conv(6, "group"), folder({ conversation_ids: [5] }))).toBe(false);
    expect(inFolder(conv(7, "direct"), folder({ include_direct: true }))).toBe(true);
    expect(inFolder(conv(7, "group"), folder({ include_direct: true }))).toBe(false);
    expect(inFolder(conv(8, "group"), folder({ include_groups: true }))).toBe(true);
    const unread = folder({ include_direct: true, include_groups: true, unread_only: true });
    expect(inFolder(conv(9, "group", 0), unread)).toBe(false);
    expect(inFolder(conv(9, "group", 2), unread)).toBe(true);
    expect(inFolder(conv(5, "group", 0), folder({ conversation_ids: [5], unread_only: true }))).toBe(false);
  });

  it("offers Signal's three suggested folders", () => {
    expect(PRESETS.map((p) => p.name)).toEqual(["Unread", "1:1 chats", "Groups"]);
  });
});
