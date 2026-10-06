"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { ConversationOut, MessageOut } from "@/lib/api/types";
import { otherMember } from "@/lib/conversations";
import { groupTimeline } from "@/lib/grouping";
import { formatPhone } from "@/features/onboarding/DemoAccounts";
import { useReadReceipts } from "@/lib/useReadReceipts";
import { useTyping } from "@/stores/typing";
import type { ActionHandlers } from "../messages/MessageActions";
import { DeleteMessageModal } from "../messages/DeleteMessageModal";
import { EditHistoryModal } from "../messages/EditHistoryModal";
import { MessageDetailsModal } from "../messages/MessageDetailsModal";
import { ReactionPicker } from "../messages/reactions";
import { SystemMessage } from "../messages/SystemMessage";
import { TypingDots } from "../chat-list/ConversationRow";
import { type BubbleExtras, TimelineMessage } from "./TimelineMessage";
import { useTimelineMessages } from "./useMessages";
import { useEditing } from "@/stores/editing";
import { useReply } from "@/stores/reply";

export type { BubbleExtras };

function ConversationHero({ conversation, meId }: { conversation: ConversationOut; meId: number }) {
  const other = otherMember(conversation, meId);
  const active = conversation.members.filter((m) => m.left_at === null).length;
  return (
    <div className="flex flex-col items-center gap-2 px-6 pt-10 pb-6 text-center">
      <Avatar name={conversation.title} color={conversation.avatar_color} url={conversation.avatar_url} size="xl" />
      <h2 className="mt-1 text-[20px] font-semibold">{conversation.title}</h2>
      <p className="text-[13px] text-fg-2">
        {conversation.kind === "group"
          ? `${active} member${active === 1 ? "" : "s"}`
          : conversation.is_note_to_self
            ? "Notes you send here are only visible to you"
            : [other?.about, other && formatPhone(other.phone)].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-2 flex max-w-sm items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-[12px] text-fg-2">
        <Lock size={13} className="shrink-0" />
        Messages are end-to-end encrypted. (Encryption is simulated in this demo.)
      </p>
    </div>
  );
}

function TypingBubble({ conversation, meId }: { conversation: ConversationOut; meId: number }) {
  const typingMap = useTyping((s) => s.byConversation[conversation.id]);
  const typers = Object.keys(typingMap ?? {})
    .map(Number)
    .filter((id) => id !== meId);
  if (!typers.length) return null;
  const user = conversation.members.find((m) => m.user.id === typers[0])?.user;
  return (
    <div className="mt-2 flex items-end gap-2 px-4">
      {conversation.kind === "group" && user && (
        <Avatar name={user.display_name} color={user.avatar_color} url={user.avatar_url} size="sm" />
      )}
      <div className="rounded-[18px] bg-bubble-in px-4 py-3 text-fg-2">
        <TypingDots />
      </div>
    </div>
  );
}

/**
 * Newest-at-bottom message list. Uses `flex-col-reverse` so the browser keeps the view
 * anchored to the bottom and preserves position when older pages load above.
 */
export function Timeline({
  conversation,
  meId,
  extras = {},
  extraMenuItems,
}: {
  conversation: ConversationOut;
  meId: number;
  extras?: BubbleExtras;
  extraMenuItems?: ActionHandlers["extraItems"];
}) {
  const { messages, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useTimelineMessages(conversation.id, meId);
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const isGroup = conversation.kind === "group";
  const usersById = useMemo(() => new Map(conversation.members.map((m) => [m.user.id, m.user])), [conversation.members]);
  const items = useMemo(() => groupTimeline(messages, meId, new Date(), isGroup), [messages, meId, isGroup]);
  const [picker, setPicker] = useState<{ message: MessageOut; anchor: { x: number; y: number } } | null>(null);
  const [details, setDetails] = useState<MessageOut | null>(null);
  const [deleting, setDeleting] = useState<MessageOut | null>(null);
  const [history, setHistory] = useState<MessageOut | null>(null);
  const handlers = useMemo<ActionHandlers>(
    () => ({
      onReply: (m) => {
        useReply.getState().set(conversation.id, m);
        window.dispatchEvent(new Event("signal:focus-composer"));
      },
      onReact: (m, anchor) => setPicker({ message: m, anchor }),
      onInfo: (m) => setDetails(m),
      onEdit: (m) => {
        useEditing.getState().set(conversation.id, m);
        window.dispatchEvent(new Event("signal:focus-composer"));
      },
      onDelete: (m) => setDeleting(m),
      onHistory: (m) => setHistory(m),
      extraItems: extraMenuItems,
    }),
    [conversation.id, extraMenuItems],
  );

  useReadReceipts(conversation, messages, atBottom, meId);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const fromBottom = Math.abs(el.scrollTop);
    setAtBottom(fromBottom < 48);
    if (hasNextPage && !isFetchingNextPage && el.scrollHeight - el.clientHeight - fromBottom < 300) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Jump to the bottom when switching chats or when I send a message.
  const lastMine = [...messages].reverse().find((m) => m.sender_id === meId)?.client_id;
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [conversation.id, lastMine]);

  useEffect(() => {
    const onJump = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      const el = scroller.current?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.style.animation = "flash-highlight 1.6s ease-out";
        setTimeout(() => (el.style.animation = ""), 1700);
      } else if (hasNextPage) {
        void fetchNextPage().then(() => window.dispatchEvent(new CustomEvent("signal:jump", { detail: id })));
      }
    };
    window.addEventListener("signal:jump", onJump);
    return () => window.removeEventListener("signal:jump", onJump);
  }, [hasNextPage, fetchNextPage]);

  const rendered = items.map((item) => {
    if (item.type === "date") {
      return (
        <div key={item.key} className="sticky top-2 z-[1] flex justify-center py-3">
          <span className="rounded-full bg-[var(--surface)]/90 px-3 py-1 text-[12px] font-medium text-fg-2 shadow-sm backdrop-blur">
            {item.label}
          </span>
        </div>
      );
    }
    const m = item.message;
    if (m.kind === "system") {
      return <SystemMessage key={item.key} message={m} conversation={conversation} meId={meId} />;
    }
    return (
      <div key={item.key} data-message-id={m.id}>
        <TimelineMessage
          message={m}
          position={item.position}
          showAvatar={item.showAvatar}
          showName={item.showName}
          conversation={conversation}
          sender={m.sender_id ? usersById.get(m.sender_id) : undefined}
          meId={meId}
          handlers={handlers}
          extras={extras}
        />
      </div>
    );
  });

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="flex h-full flex-col-reverse overflow-y-auto pb-3" role="log" aria-live="polite">
        <div>
          {!hasNextPage && !isLoading && <ConversationHero conversation={conversation} meId={meId} />}
          {isFetchingNextPage && <p className="py-3 text-center text-[12px] text-fg-3">Loading earlier messages…</p>}
          {rendered}
          <TypingBubble conversation={conversation} meId={meId} />
        </div>
      </div>
      {picker && (
        <ReactionPicker
          anchor={picker.anchor}
          message={messages.find((x) => x.id === picker.message.id) ?? picker.message}
          meId={meId}
          onClose={() => setPicker(null)}
        />
      )}
      {details && <MessageDetailsModal message={details} onClose={() => setDetails(null)} />}
      {deleting && <DeleteMessageModal message={deleting} meId={meId} onClose={() => setDeleting(null)} />}
      {history && <EditHistoryModal message={history} onClose={() => setHistory(null)} />}
      {!atBottom && (
        <button
          aria-label="Scroll to bottom"
          onClick={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })}
          className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-fg-2 shadow-[var(--shadow)]"
        >
          <ChevronDown size={20} />
          {conversation.unread_count > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
              {conversation.unread_count}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
