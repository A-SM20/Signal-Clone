import { describe, expect, it } from "vitest";
import { parseSelection, selectionSearch } from "./selection";

describe("selection <-> ?c= query", () => {
  it("parses a numeric conversation id", () => {
    expect(parseSelection("?c=12")).toBe(12);
    expect(parseSelection("?x=1&c=7")).toBe(7);
  });
  it("rejects missing or malformed ids", () => {
    expect(parseSelection("")).toBeNull();
    expect(parseSelection("?c=abc")).toBeNull();
    expect(parseSelection("?c=-3")).toBeNull();
  });
  it("round-trips", () => {
    expect(parseSelection(selectionSearch(42))).toBe(42);
    expect(selectionSearch(null)).toBe("");
  });
});
