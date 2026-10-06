import { apiFetch } from "@/lib/api/client";
import type { MessageOut, PollOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { applyEvent } from "@/lib/realtime/applyEvent";

type PollOption = PollOut["options"][number];
export type PollDraft = { question: string; options: string[]; allow_multiple: boolean };

export const MAX_POLL_OPTIONS = 10;

/** People who voted at all; bars are each option's share of them (as Signal shows). */
export function totalVoters(poll: PollOut): number {
  return new Set(poll.options.flatMap((o) => o.voter_ids)).size;
}

export function optionShare(option: PollOption, poll: PollOut): number {
  const total = totalVoters(poll);
  return total === 0 ? 0 : Math.round((option.vote_count / total) * 100);
}

export function nextSelection(current: number[], optionId: number, allowMultiple: boolean): number[] {
  if (current.includes(optionId)) return current.filter((id) => id !== optionId);
  return allowMultiple ? [...current, optionId] : [optionId];
}

/** Mirrors the API's PollIn validation so the dialog can explain what's wrong before sending. */
export function pollDraftError(question: string, options: string[]): string | null {
  if (!question.trim()) return "Add a question";
  const filled = options.map((o) => o.trim()).filter(Boolean);
  if (filled.length < 2) return "Add at least 2 options";
  if (filled.length > MAX_POLL_OPTIONS) return `Up to ${MAX_POLL_OPTIONS} options`;
  if (new Set(filled.map((o) => o.toLocaleLowerCase())).size !== filled.length) return "Options must be different";
  return null;
}

/** The optimistic bubble's poll before the server has assigned option ids. */
export function pendingPoll(draft: PollDraft): PollOut {
  return {
    question: draft.question,
    allow_multiple: draft.allow_multiple,
    ended_at: null,
    options: draft.options.map((text, i) => ({ id: -(i + 1), text, vote_count: 0, voter_ids: [] })),
  };
}

function applyPoll(m: MessageOut, poll: PollOut) {
  applyEvent(
    queryClient,
    {
      type: "poll.updated",
      data: { conversation_id: m.conversation_id, message_id: m.id, options: poll.options, ended_at: poll.ended_at },
      ts: new Date().toISOString(),
    },
    { meId: 0, openConversationId: null, isVisible: false },
  );
}

export async function vote(m: MessageOut, optionIds: number[]): Promise<void> {
  applyPoll(m, await apiFetch<PollOut>(`/api/polls/${m.id}/votes`, { method: "PUT", json: { option_ids: optionIds } }));
}

export async function endPoll(m: MessageOut): Promise<void> {
  applyPoll(m, await apiFetch<PollOut>(`/api/polls/${m.id}/end`, { method: "POST" }));
}
