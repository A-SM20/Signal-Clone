"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api/client";
import type { ConversationOut, MessageOut, PollOut } from "@/lib/api/types";
import { memberName } from "@/lib/conversations";
import { endPoll, nextSelection, optionShare, totalVoters, vote } from "@/lib/polls";
import { toast } from "@/stores/toast";

const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong");

export function PollBubble({
  message: m,
  poll,
  conversation,
  meId,
  outgoing,
}: {
  message: MessageOut;
  poll: PollOut;
  conversation?: ConversationOut;
  meId: number;
  outgoing: boolean;
}) {
  const [showVotes, setShowVotes] = useState(false);
  const pending = m.id < 0 || poll.options.some((o) => o.id < 0);
  const ended = poll.ended_at !== null;
  const mine = poll.options.filter((o) => o.voter_ids.includes(meId)).map((o) => o.id);
  const voters = totalVoters(poll);
  const canVote = !pending && !ended && !!conversation && conversation.me.left_at === null;
  const muted = outgoing ? "text-white/75" : "text-fg-2";
  const track = outgoing ? "bg-white/25" : "bg-[var(--divider)]";
  const fill = outgoing ? "bg-white" : "bg-primary";

  return (
    <div className="min-w-[240px] max-w-[320px]">
      <p className="text-[15px] font-semibold leading-5">{poll.question}</p>
      <p className={`mt-0.5 text-[12px] ${muted}`}>
        {ended ? "Poll ended" : poll.allow_multiple ? "Poll · Select one or more" : "Poll · Select one"}
      </p>
      <ul className="mt-2 flex flex-col gap-2.5">
        {poll.options.map((o) => {
          const chosen = mine.includes(o.id);
          return (
            <li key={o.id}>
              <button
                disabled={!canVote}
                onClick={() => void vote(m, nextSelection(mine, o.id, poll.allow_multiple)).catch(fail)}
                className="flex w-full items-center gap-2.5 text-left disabled:cursor-default"
                aria-pressed={chosen}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                    chosen ? (outgoing ? "border-white bg-white text-primary" : "border-primary bg-primary text-white") : outgoing ? "border-white/70" : "border-fg-3"
                  }`}
                >
                  {chosen && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 text-[14px]">
                    <span className="break-words">{o.text}</span>
                    <span className={`shrink-0 text-[12px] ${muted}`}>{o.vote_count}</span>
                  </span>
                  <span className={`mt-1 block h-1 overflow-hidden rounded-full ${track}`}>
                    <span className={`block h-full rounded-full transition-[width] ${fill}`} style={{ width: `${optionShare(o, poll)}%` }} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={`mt-2.5 flex items-center gap-3 text-[13px] font-semibold ${outgoing ? "text-white" : "text-primary"}`}>
        <button onClick={() => setShowVotes(true)} disabled={pending} className="hover:underline disabled:opacity-50">
          {voters === 0 ? "No votes" : `View votes (${voters})`}
        </button>
        {m.sender_id === meId && !ended && !pending && (
          <button onClick={() => void endPoll(m).then(() => toast("Poll ended")).catch(fail)} className="hover:underline">
            End poll
          </button>
        )}
      </div>
      {showVotes && conversation && (
        <Modal title="Poll votes" onClose={() => setShowVotes(false)} width={400}>
          <p className="mb-3 text-[14px] font-semibold">{poll.question}</p>
          <div className="flex flex-col gap-4">
            {poll.options.map((o) => (
              <section key={o.id}>
                <h3 className="mb-1 flex justify-between text-[13px] text-fg-2">
                  <span>{o.text}</span>
                  <span>
                    {o.vote_count} vote{o.vote_count === 1 ? "" : "s"}
                  </span>
                </h3>
                {o.voter_ids.length === 0 ? (
                  <p className="text-[13px] text-fg-3">No votes</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {o.voter_ids.map((id) => {
                      const user = conversation.members.find((x) => x.user.id === id)?.user;
                      return (
                        <li key={id} className="flex items-center gap-2 text-[14px]">
                          <Avatar name={user?.display_name ?? "?"} color={user?.avatar_color ?? "#888"} url={user?.avatar_url} size="sm" />
                          {id === meId ? "You" : memberName(conversation, id)}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
