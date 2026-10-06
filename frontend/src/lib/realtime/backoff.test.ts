import { describe, expect, it } from "vitest";
import { backoffDelay } from "./backoff";

describe("backoffDelay", () => {
  it("grows exponentially and caps at 30s", () => {
    const delays = Array.from({ length: 11 }, (_, n) => backoffDelay(n, () => 1));
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000]);
  });

  it("applies jitter between 50% and 100%", () => {
    expect(backoffDelay(2, () => 0)).toBe(2000);
    expect(backoffDelay(2, () => 0.5)).toBe(3000);
  });
});
