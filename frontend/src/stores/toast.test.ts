import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast, useToasts } from "./toast";

describe("toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToasts.setState({ toasts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it("adds a toast and auto-dismisses after 4 seconds", () => {
    toast("Calls are coming soon");
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(["Calls are coming soon"]);
    vi.advanceTimersByTime(3999);
    expect(useToasts.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("can be dismissed early", () => {
    const id = toast("Copied");
    useToasts.getState().dismiss(id);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});
