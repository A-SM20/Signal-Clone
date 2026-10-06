import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTyping } from "./typing";

describe("useTyping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTyping.setState({ byConversation: {} });
  });
  afterEach(() => vi.useRealTimers());

  it("expires typing after 8s", () => {
    useTyping.getState().set(5, 2, "start");
    expect(useTyping.getState().active(5)).toEqual([2]);
    vi.advanceTimersByTime(8001);
    expect(useTyping.getState().active(5)).toEqual([]);
  });

  it("stop removes the user immediately", () => {
    useTyping.getState().set(5, 2, "start");
    useTyping.getState().set(5, 3, "start");
    useTyping.getState().set(5, 2, "stop");
    expect(useTyping.getState().active(5)).toEqual([3]);
  });

  it("a fresh start extends the expiry", () => {
    useTyping.getState().set(5, 2, "start");
    vi.advanceTimersByTime(6000);
    useTyping.getState().set(5, 2, "start");
    vi.advanceTimersByTime(6000);
    expect(useTyping.getState().active(5)).toEqual([2]);
  });
});
