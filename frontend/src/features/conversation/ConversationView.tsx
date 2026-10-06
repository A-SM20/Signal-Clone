"use client";

import { BadgeCheck } from "lucide-react";
import { useState } from "react";
import { useConversation, useMeId } from "@/lib/api/hooks";
import { otherMember } from "@/lib/conversations";
import { useSafetyNumber } from "@/lib/safetyNumber";
import { useReply } from "@/stores/reply";
import { useUi } from "@/stores/ui";
import { ReplyPreview } from "../messages/QuotedMessage";
import { SafetyNumberModal } from "../contacts/SafetyNumberModal";
import { ConversationSettingsPanel } from "../groups/ConversationSettingsPanel";
import { Composer } from "./Composer";
import { RequestBanner } from "./RequestBanner";
import { SafetyNumberChangedNotice } from "./SafetyNumberChangedNotice";
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
  const other = conversation ? otherMember(conversation, meId) : null;
  const { data: safety } = useSafetyNumber(other?.id);
  const [safetyOpen, setSafetyOpen] = useState(false);

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
        badges={
          <>
            {safety?.verified && (
              <span title="Verified" aria-label="Verified" className="text-fg-2">
                <BadgeCheck size={15} />
              </span>
            )}
            <TimerBadge seconds={conversation.disappearing_seconds} />
          </>
        }
        menuItems={canSetTimer(conversation) ? timerMenuItems(conversation).map((i) => ({ ...i, label: `Timer: ${i.label}` })) : []}
      />
      <Timeline conversation={conversation} meId={meId} />
      {other && conversation.safety_number_changed && (
        <SafetyNumberChangedNotice name={other.display_name} onView={() => setSafetyOpen(true)} />
      )}
      {conversation.me.request_state === "pending" ? (
        <RequestBanner conversation={conversation} />
      ) : left ? (
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
      {safetyOpen && other && (
        <SafetyNumberModal userId={other.id} name={other.display_name} onClose={() => setSafetyOpen(false)} />
      )}
    </div>
  );
}
