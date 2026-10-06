import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForApi } from "./health";

const res = (status: number) => new Response(null, { status });

describe("waitForApi", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves after transient 502s", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(res(502))
      .mockResolvedValueOnce(res(502))
      .mockResolvedValueOnce(res(200));
    const onAttempt = vi.fn();
    const done = waitForApi({ fetchFn, onAttempt, intervalMs: 2000 });
    await vi.advanceTimersByTimeAsync(4000);
    await expect(done).resolves.toBeUndefined();
    expect(onAttempt).toHaveBeenCalledTimes(3);
  });

  it("keeps retrying on network errors", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(res(200));
    const done = waitForApi({ fetchFn, intervalMs: 2000 });
    await vi.advanceTimersByTimeAsync(4000);
    await expect(done).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("rejects with AbortError when aborted", async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(502));
    const controller = new AbortController();
    const done = waitForApi({ fetchFn, intervalMs: 2000, signal: controller.signal });
    const assertion = expect(done).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
  });
});
