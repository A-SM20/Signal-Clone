"use client";

import { useConversation, useMeId } from "@/lib/api/hooks";
import { useUi } from "@/stores/ui";
import { Composer } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { Timeline } from "./Timeline";

export function ConversationView() {
  const selectedId = useUi((s) => s.selectedId);
  const conversation = useConversation(selectedId);
  const meId = useMeId();

  if (!conversation) {
    return <div className="flex h-full items-center justify-center text-[13px] text-fg-2">Loading chat…</div>;
  }
  const left = conversation.me.left_at !== null;
  return (
    <div className="flex h-full flex-col bg-bg">
      <ConversationHeader conversation={conversation} meId={meId} />
      <Timeline conversation={conversation} meId={meId} />
      {left ? (
        <p className="shrink-0 border-t border-divider px-6 py-4 text-center text-[13px] text-fg-2">
          You are no longer a member of this group.
        </p>
      ) : (
        <Composer conversation={conversation} />
      )}
    </div>
  );
}
