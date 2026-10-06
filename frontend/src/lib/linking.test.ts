import { describe, expect, it } from "vitest";
import { formatCode, normalizeCode } from "./linking";

describe("link codes", () => {
  it("shows codes in two groups of four", () => {
    expect(formatCode("ABCD2345")).toBe("ABCD-2345");
  });

  it("accepts typed or scanned codes in any case, with spaces or dashes", () => {
    expect(normalizeCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeCode("abcd 2345")).toBe("ABCD2345");
  });

  it("rejects codes with the wrong length or ambiguous characters", () => {
    expect(normalizeCode("ABCD234")).toBeNull();
    expect(normalizeCode("ABCD2340")).toBeNull(); // 0 is never used
    expect(normalizeCode("ABCDI345")).toBeNull(); // nor I
  });
});
