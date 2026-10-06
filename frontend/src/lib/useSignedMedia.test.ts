import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useUi } from "@/stores/ui";
import { reportBrokenMedia } from "./useSignedMedia";

describe("reportBrokenMedia", () => {
  it("refreshes queries once when a signed media URL fails", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    useUi.setState({ selectedId: 7 });
    reportBrokenMedia("/api/files/a.jpg?exp=1&sig=x", qc);
    reportBrokenMedia("/api/files/a.jpg?exp=1&sig=x", qc);
    const keys = spy.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(['["conversations"]', '["messages",7]', '["me"]']);
  });

  it("handles a different URL separately", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    reportBrokenMedia("/api/files/b.jpg?exp=2&sig=y", qc);
    expect(spy).toHaveBeenCalled();
  });
});
