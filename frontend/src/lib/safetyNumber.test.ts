import { describe, expect, it } from "vitest";
import { groupSafetyNumber } from "./safetyNumber";

describe("groupSafetyNumber", () => {
  it("splits 60 digits into 12 groups of 5", () => {
    const digits = "749091284385070456433574050315500210663287021562611322209120";
    const groups = groupSafetyNumber(digits);
    expect(groups).toHaveLength(12);
    expect(groups[0]).toBe("74909");
    expect(groups[11]).toBe("09120");
    expect(groups.join("")).toBe(digits);
  });

  it("returns no groups for an empty string", () => {
    expect(groupSafetyNumber("")).toEqual([]);
  });
});
