"use client";

import { ChevronDown, Lock } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { ConversationOut, MessageOut } from "@/lib/api/types";
import { otherMember } from "@/lib/conversations";
import { groupTimeline } from "@/lib/grouping";
import { retryMessage } from "@/lib/messaging";
import { deriveStatus } from "@/lib/status";
import { formatPhone } from "@/features/onboarding/DemoAccounts";
import { useReadReceipts } from "@/lib/useReadReceipts";
import { useTyping } from "@/stores/typing";
import { MessageBubble } from "../messages/MessageBubble";
import { SystemMessage } from "../messages/SystemMessage";
import { TextBody } from "../messages/TextBody";
import { TypingDots } from "../chat-list/ConversationRow";
import { isPending, useTimelineMessages } from "./useMessages";

export interface BubbleExtras {
  body?: (m: MessageOut) => ReactNode;
  below?: (m: MessageOut) => ReactNode;
  footer?: (m: MessageOut) => ReactNode;
  wrap?: (m: MessageOut, bubble: ReactNode) => ReactNode;
}

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
export function Timeline({ conversation, meId, extras = {} }: { conversation: ConversationOut; meId: number; extras?: BubbleExtras }) {
  const { messages, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useTimelineMessages(conversation.id, meId);
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const isGroup = conversation.kind === "group";
  const usersById = useMemo(() => new Map(conversation.members.map((m) => [m.user.id, m.user])), [conversation.members]);
  const items = useMemo(() => groupTimeline(messages, meId, new Date(), isGroup), [messages, meId, isGroup]);

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
    const mine = m.sender_id === meId;
    const pending = isPending(m) ? m.pending : null;
    const status = pending ? pending.state : mine ? deriveStatus(m, conversation, meId) : undefined;
    const bubble = (
      <MessageBubble
        message={m}
        conversation={conversation}
        sender={m.sender_id ? usersById.get(m.sender_id) : undefined}
        mine={mine}
        position={item.position}
        showAvatar={item.showAvatar}
        showName={item.showName}
        status={status}
        onRetry={pending ? () => retryMessage(pending.client_id) : undefined}
        isGroup={isGroup}
        footerExtra={extras.footer?.(m)}
        below={extras.below?.(m)}
      >
        {extras.body?.(m) ?? <TextBody text={m.body} deleted={!!m.deleted_at} />}
      </MessageBubble>
    );
    return (
      <div key={item.key} data-message-id={m.id}>
        {extras.wrap ? extras.wrap(m, bubble) : bubble}
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
