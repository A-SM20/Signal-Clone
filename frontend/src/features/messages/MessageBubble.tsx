"use client";

import { memo, type MouseEvent, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { ConversationOut, MessageOut, UserOut } from "@/lib/api/types";
import type { Position } from "@/lib/grouping";
import type { DeliveryStatus } from "@/lib/status";
import { formatClock, formatListTime } from "@/lib/time";
import { StatusTicks } from "./StatusTicks";

const R = "var(--radius-bubble)";
const T = "var(--radius-bubble-tight)";

/** Corner radii: the sender-side corners tighten where a bubble joins its cluster neighbours. */
function radius(position: Position, mine: boolean): string {
  const top = position === "middle" || position === "last" ? T : R;
  const bottom = position === "middle" || position === "first" ? T : R;
  // order: top-left top-right bottom-right bottom-left
  return mine ? `${R} ${top} ${bottom} ${R}` : `${top} ${R} ${R} ${bottom}`;
}

export function footerTime(createdAt: string): string {
  const label = formatListTime(createdAt);
  return /^(Now|\d+m)$/.test(label) ? label : formatClock(new Date(createdAt));
}

interface BubbleProps {
  message: MessageOut;
  conversation: ConversationOut;
  sender?: UserOut;
  mine: boolean;
  position: Position;
  showAvatar: boolean;
  showName: boolean;
  status?: DeliveryStatus;
  onRetry?: () => void;
  children?: ReactNode;
  footerExtra?: ReactNode;
  below?: ReactNode;
  above?: ReactNode;
  toolbar?: ReactNode;
  onContextMenu?: (e: MouseEvent) => void;
  isGroup: boolean;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  sender,
  mine,
  position,
  showAvatar,
  showName,
  status,
  onRetry,
  children,
  footerExtra,
  below,
  above,
  toolbar,
  onContextMenu,
  isGroup,
}: BubbleProps) {
  const deleted = !!message.deleted_at;
  const outgoing = mine && !deleted;
  const spacing = position === "single" || position === "first" ? "mt-2" : "mt-0.5";
  return (
    <div
      className={`group/msg flex items-end gap-2 px-4 ${spacing} ${mine ? "justify-end" : "justify-start"}`}
      onContextMenu={onContextMenu}
    >
      {mine && toolbar}
      {isGroup && !mine && (
        <span className="w-7 shrink-0">
          {showAvatar && sender && <Avatar name={sender.display_name} color={sender.avatar_color} url={sender.avatar_url} size="sm" />}
        </span>
      )}
      <div className={`flex max-w-[min(75%,560px)] flex-col ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`relative px-3 pt-[7px] pb-[6px] text-[14px] leading-[20px] ${
            deleted
              ? "border border-divider bg-transparent text-fg-2 italic"
              : outgoing
                ? "bg-bubble-out text-bubble-out-fg"
                : "bg-bubble-in text-bubble-in-fg"
          }`}
          style={{ borderRadius: radius(position, mine) }}
        >
          {showName && sender && !deleted && (
            <div className="mb-0.5 text-[13px] font-semibold" style={{ color: sender.avatar_color }}>
              {sender.display_name}
            </div>
          )}
          {above}
          {children}
          <span
            className={`float-right mt-1.5 ml-3 inline-flex translate-y-[3px] items-center gap-1 text-[11px] leading-none ${
              outgoing ? "text-white/80" : "text-fg-2"
            }`}
          >
            {footerExtra}
            <time dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>
              {footerTime(message.created_at)}
            </time>
            {mine && status && !deleted && (
              <StatusTicks status={status} className={status === "failed" ? "" : outgoing ? "[--tick-check:var(--primary)]" : ""} />
            )}
          </span>
        </div>
        {below}
        {status === "failed" && (
          <button onClick={onRetry} className="mt-1 text-[12px] text-danger hover:underline">
            Not sent. Click to retry.
          </button>
        )}
      </div>
      {!mine && toolbar}
    </div>
  );
});
