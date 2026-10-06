"use client";

import { BellOff, Pin } from "lucide-react";
import { memo, type MouseEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { ConversationOut } from "@/lib/api/types";
import { isMuted, otherMember, previewText } from "@/lib/conversations";
import { formatListTime } from "@/lib/time";
import { useTyping } from "@/stores/typing";
import { StatusTicks, deriveStatusSafe } from "../messages/StatusTicks";

export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} aria-label="typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[5px] w-[5px] rounded-full bg-current [animation:typing-dot_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

interface RowProps {
  conversation: ConversationOut;
  meId: number;
  selected: boolean;
  onSelect: (id: number) => void;
  onContextMenu: (e: MouseEvent, c: ConversationOut) => void;
}

export const ConversationRow = memo(function ConversationRow({ conversation: c, meId, selected, onSelect, onContextMenu }: RowProps) {
  const typing = useTyping((s) => Object.keys(s.byConversation[c.id] ?? {}).length > 0);
  const other = otherMember(c, meId);
  const last = c.last_message;
  const mine = last && last.sender_id === meId && last.kind !== "system" && !last.deleted_at;
  const muted = isMuted(c);
  return (
    <li>
      <button
        onClick={() => onSelect(c.id)}
        onContextMenu={(e) => onContextMenu(e, c)}
        aria-current={selected ? "true" : undefined}
        className={`mx-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-xl px-2.5 py-2.5 text-left ${
          selected ? "bg-[var(--selected)]" : "hover:bg-hover"
        }`}
      >
        <Avatar name={c.title} color={c.avatar_color} url={c.avatar_url} size="lg" online={other?.online} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{c.title}</span>
            <span className={`shrink-0 text-[12px] ${c.unread_count ? "font-semibold text-primary" : "text-fg-2"}`}>
              {last ? formatListTime(last.created_at) : ""}
            </span>
          </span>
          <span className="mt-0.5 flex items-start gap-2">
            <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px] text-fg-2">
              {typing ? <TypingDots className="h-[18px] text-fg-2" /> : previewText(c, meId)}
            </span>
            <span className="flex shrink-0 items-center gap-1 pt-0.5 text-fg-3">
              {muted && <BellOff size={14} aria-label="Muted" />}
              {c.me.is_pinned && <Pin size={14} aria-label="Pinned" />}
              {c.unread_count > 0 ? (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">
                  {c.unread_count > 999 ? "999+" : c.unread_count}
                </span>
              ) : (
                mine && <StatusTicks status={deriveStatusSafe(last, c, meId)} />
              )}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
});
