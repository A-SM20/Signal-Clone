"use client";

import { useState } from "react";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { ApiError, apiFetch } from "@/lib/api/client";
import { upsertConversation } from "@/lib/api/hooks";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";

type Action = "accept" | "block" | "delete";

/** Replaces the composer for an unaccepted chat from someone who isn't in your contacts. */
export function RequestBanner({ conversation: c }: { conversation: ConversationOut }) {
  const [confirm, setConfirm] = useState<Action | null>(null);
  const select = useUi((s) => s.select);
  const who = c.kind === "group" ? "this group" : c.title;

  const act = async (action: Action) => {
    try {
      const res = await apiFetch<ConversationOut | undefined>(`/api/conversations/${c.id}/request`, {
        method: "POST",
        json: { action },
      });
      if (res) upsertConversation(res);
      else {
        queryClient.setQueryData<ConversationOut[]>(qk.conversations, (list) => list?.filter((x) => x.id !== c.id));
        select(null);
        if (action === "block") queryClient.invalidateQueries({ queryKey: qk.blocks });
        toast(action === "block" ? `${c.title} blocked` : "Request deleted");
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong");
    }
  };

  return (
    <div className="shrink-0 border-t border-divider bg-bg px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] text-center">
      <p className="mx-auto mb-3 max-w-md text-[13px] text-fg-2">
        Let <b className="text-fg">{who}</b> message you and share your name and photo with{" "}
        {c.kind === "group" ? "its members" : "them"}? They won&apos;t know you&apos;ve seen their messages until you accept.
      </p>
      <div className="flex justify-center gap-2">
        <button onClick={() => setConfirm("delete")} className="rounded-full bg-surface-2 px-5 py-2 text-[14px] font-semibold text-danger hover:bg-[var(--selected)]">
          Delete
        </button>
        <button onClick={() => setConfirm("block")} className="rounded-full bg-surface-2 px-5 py-2 text-[14px] font-semibold text-danger hover:bg-[var(--selected)]">
          Block
        </button>
        <button onClick={() => act("accept")} className="rounded-full bg-primary px-5 py-2 text-[14px] font-semibold text-white hover:bg-primary-hover">
          Accept
        </button>
      </div>
      {confirm && (
        <Modal
          title={confirm === "block" ? `Block ${c.title}?` : "Delete this request?"}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <ModalButton onClick={() => setConfirm(null)}>Cancel</ModalButton>
              <ModalButton
                variant="danger"
                onClick={() => {
                  const action = confirm;
                  setConfirm(null);
                  void act(action);
                }}
              >
                {confirm === "block" ? "Block" : "Delete"}
              </ModalButton>
            </>
          }
        >
          <p className="text-[14px] text-fg-2">
            {confirm === "block"
              ? "Blocked people can't message you. They won't be told."
              : "The chat will be removed from your list. If they message again, it'll come back as a request."}
          </p>
        </Modal>
      )}
    </div>
  );
}
