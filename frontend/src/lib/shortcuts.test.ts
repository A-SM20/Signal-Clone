import { describe, expect, it } from "vitest";
import { isEditLastKey, matchShortcut } from "./shortcuts";

const key = (k: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

describe("matchShortcut", () => {
  it("uses Ctrl on Windows/Linux and Cmd on mac", () => {
    expect(matchShortcut(key("n", { ctrlKey: true }), "other")).toBe("newChat");
    expect(matchShortcut(key("n", { metaKey: true }), "mac")).toBe("newChat");
    expect(matchShortcut(key("n", { ctrlKey: true }), "mac")).toBeNull();
    expect(matchShortcut(key("f", { ctrlKey: true }), "other")).toBe("search");
    expect(matchShortcut(key("/", { metaKey: true }), "mac")).toBe("showShortcuts");
  });
  it("navigates chats with Alt+arrows", () => {
    expect(matchShortcut(key("ArrowUp", { altKey: true }), "other")).toBe("prevChat");
    expect(matchShortcut(key("ArrowDown", { altKey: true }), "mac")).toBe("nextChat");
  });
  it("maps Escape", () => {
    expect(matchShortcut(key("Escape"), "other")).toBe("closeOrCancel");
  });
  it("ignores plain keys and extra modifiers", () => {
    expect(matchShortcut(key("n"), "other")).toBeNull();
    expect(matchShortcut(key("n", { ctrlKey: true, shiftKey: true }), "other")).toBeNull();
    expect(matchShortcut(key("ArrowUp"), "other")).toBeNull();
  });
});

describe("isEditLastKey", () => {
  it("is a bare ArrowUp in an empty composer", () => {
    expect(isEditLastKey(key("ArrowUp"), "")).toBe(true);
    expect(isEditLastKey(key("ArrowUp"), "  ")).toBe(true);
    expect(isEditLastKey(key("ArrowUp"), "draft")).toBe(false);
    expect(isEditLastKey(key("ArrowUp", { altKey: true }), "")).toBe(false);
    expect(isEditLastKey(key("ArrowDown"), "")).toBe(false);
  });
});
