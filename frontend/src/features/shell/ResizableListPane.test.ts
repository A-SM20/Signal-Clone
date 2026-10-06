import { describe, expect, it } from "vitest";
import { clampListWidth } from "./ResizableListPane";

describe("clampListWidth", () => {
  it("keeps the chat list between 300 and 440 px", () => {
    expect(clampListWidth(200)).toBe(300);
    expect(clampListWidth(999)).toBe(440);
    expect(clampListWidth(360)).toBe(360);
  });
});
