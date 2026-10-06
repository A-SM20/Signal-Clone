"use client";

import { useConversation, useMeId } from "@/lib/api/hooks";
import { useReply } from "@/stores/reply";
import { useUi } from "@/stores/ui";
import { ReplyPreview } from "../messages/QuotedMessage";
import { ConversationSettingsPanel } from "../groups/ConversationSettingsPanel";
import { Composer } from "./Composer";
import { canSetTimer, TimerBadge, timerMenuItems } from "./DisappearingMenu";
import { ConversationHeader } from "./ConversationHeader";
import { Timeline } from "./Timeline";

export function ConversationView() {
  const selectedId = useUi((s) => s.selectedId);
  const panel = useUi((s) => s.panel);
  const conversation = useConversation(selectedId);
  const meId = useMeId();
  const replyTo = useReply((s) => (selectedId === null ? null : (s.byConversation[selectedId] ?? null)));
  const setReply = useReply((s) => s.set);

  if (!conversation) {
    return <div className="flex h-full items-center justify-center text-[13px] text-fg-2">Loading chat…</div>;
  }
  const left = conversation.me.left_at !== null;
  return (
    <div
      className="relative flex h-full flex-col bg-bg"
      onDragOver={(e) => {
        if (!left && e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (left || !e.dataTransfer.files.length) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("signal:drop-files", { detail: Array.from(e.dataTransfer.files) }));
      }}
    >
      <ConversationHeader
        conversation={conversation}
        meId={meId}
        badges={<TimerBadge seconds={conversation.disappearing_seconds} />}
        menuItems={canSetTimer(conversation) ? timerMenuItems(conversation).map((i) => ({ ...i, label: `Timer: ${i.label}` })) : []}
      />
      <Timeline conversation={conversation} meId={meId} />
      {left ? (
        <p className="shrink-0 border-t border-divider px-6 py-4 text-center text-[13px] text-fg-2">
          You are no longer a member of this group.
        </p>
      ) : (
        <Composer
          conversation={conversation}
          slots={{
            above: replyTo && (
              <ReplyPreview message={replyTo} conversation={conversation} meId={meId} onCancel={() => setReply(conversation.id, null)} />
            ),
            replyToId: replyTo?.id ?? null,
            onSent: () => setReply(conversation.id, null),
            onKeyDownCapture: (e) => {
              if (e.key === "Escape" && replyTo) {
                setReply(conversation.id, null);
                return true;
              }
              return false;
            },
          }}
        />
      )}
      {panel === "conversation-settings" && <ConversationSettingsPanel conversation={conversation} meId={meId} />}
    </div>
  );
}
