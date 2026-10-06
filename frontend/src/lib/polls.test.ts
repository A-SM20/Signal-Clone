import { describe, expect, it } from "vitest";
import type { PollOut } from "./api/types";
import { nextSelection, optionShare, pollDraftError, pendingPoll, totalVoters } from "./polls";

const poll: PollOut = {
  question: "Trail?",
  allow_multiple: true,
  ended_at: null,
  options: [
    { id: 1, text: "A", vote_count: 2, voter_ids: [10, 11] },
    { id: 2, text: "B", vote_count: 1, voter_ids: [10] },
    { id: 3, text: "C", vote_count: 0, voter_ids: [] },
  ],
};

describe("polls", () => {
  it("counts each voter once and shares are relative to voters", () => {
    expect(totalVoters(poll)).toBe(2);
    expect(optionShare(poll.options[0], poll)).toBe(100);
    expect(optionShare(poll.options[1], poll)).toBe(50);
    expect(optionShare(poll.options[2], poll)).toBe(0);
    expect(optionShare(poll.options[2], { ...poll, options: [] })).toBe(0);
  });

  it("toggles choices: single choice replaces, multiple adds and removes", () => {
    expect(nextSelection([], 1, false)).toEqual([1]);
    expect(nextSelection([1], 2, false)).toEqual([2]);
    expect(nextSelection([1], 1, false)).toEqual([]);
    expect(nextSelection([1], 2, true)).toEqual([1, 2]);
    expect(nextSelection([1, 2], 1, true)).toEqual([2]);
  });

  it("validates a poll draft like the API does", () => {
    expect(pollDraftError("Where?", ["a", "b"])).toBeNull();
    expect(pollDraftError("  ", ["a", "b"])).toBe("Add a question");
    expect(pollDraftError("Where?", ["a", " "])).toBe("Add at least 2 options");
    expect(pollDraftError("Where?", ["a", "A"])).toBe("Options must be different");
    expect(pollDraftError("Where?", Array.from({ length: 11 }, (_, i) => `o${i}`))).toBe("Up to 10 options");
  });

  it("shows a pending poll with zero votes", () => {
    const p = pendingPoll({ question: "Q", options: ["x", "y"], allow_multiple: false });
    expect(p.options.map((o) => [o.text, o.vote_count])).toEqual([["x", 0], ["y", 0]]);
    expect(p.ended_at).toBeNull();
  });
});
