import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { MessageOut } from "@/lib/api/types";
import { useOutbox } from "./outbox";

const entry = { client_id: "c1", conversation_id: 7, kind: "text" as const, body: "hi" };

describe("outbox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useOutbox.setState({ entries: {} });
  });
  afterEach(() => vi.useRealTimers());

  it("removes the entry once sent", async () => {
    const send = vi.fn().mockResolvedValue({ id: 1 } as MessageOut);
    useOutbox.getState().enqueue(entry);
    await useOutbox.getState().flush(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().entries).toEqual({});
  });

  it("retries at 2s, 4s, 8s then marks failed", async () => {
    const send = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    useOutbox.getState().enqueue(entry);
    await useOutbox.getState().flush(send);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(send).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8000);
    expect(send).toHaveBeenCalledTimes(4);
    expect(useOutbox.getState().entries.c1.state).toBe("failed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("client errors fail immediately", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(422, "validation_error", "bad"));
    useOutbox.getState().enqueue(entry);
    await useOutbox.getState().flush(send);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(useOutbox.getState().entries.c1.state).toBe("failed");
  });

  it("retry() resends with the same client_id", async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError(500, "x", "x")).mockRejectedValue(new ApiError(422, "x", "x"));
    useOutbox.getState().enqueue(entry);
    await useOutbox.getState().flush(send);
    await vi.advanceTimersByTimeAsync(2000);
    expect(useOutbox.getState().entries.c1.state).toBe("failed");
    send.mockResolvedValue({ id: 9 } as MessageOut);
    await useOutbox.getState().retry("c1", send);
    expect(send.mock.calls.every(([e]) => e.client_id === "c1")).toBe(true);
    expect(useOutbox.getState().entries).toEqual({});
  });
});
