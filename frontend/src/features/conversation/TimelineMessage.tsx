"use client";

import { memo, type ReactNode } from "react";
import type { ConversationOut, MessageOut, UserOut } from "@/lib/api/types";
import type { Position } from "@/lib/grouping";
import { retryMessage } from "@/lib/messaging";
import { deriveStatus } from "@/lib/status";
import { useTouchGestures } from "@/lib/useTouchGestures";
import { ActionToolbar, type ActionHandlers, useMessageMenu } from "../messages/MessageActions";
import { MessageBody } from "../messages/MessageBody";
import { MessageBubble } from "../messages/MessageBubble";
import { QuotedMessage } from "../messages/QuotedMessage";
import { ReactionChips } from "../messages/reactions";
import { isPending } from "./useMessages";

export interface BubbleExtras {
  footer?: (m: MessageOut) => ReactNode;
  body?: (m: MessageOut) => ReactNode;
}

interface Props {
  message: MessageOut;
  position: Position;
  showAvatar: boolean;
  showName: boolean;
  conversation: ConversationOut;
  sender?: UserOut;
  meId: number;
  handlers: ActionHandlers;
  extras: BubbleExtras;
}

export const TimelineMessage = memo(function TimelineMessage({
  message: m,
  position,
  showAvatar,
  showName,
  conversation,
  sender,
  meId,
  handlers,
  extras,
}: Props) {
  const mine = m.sender_id === meId;
  const pending = isPending(m) ? m.pending : null;
  const interactive = !pending && !m.deleted_at && conversation.me.left_at === null;
  const menu = useMessageMenu(m, mine, handlers);
  const status = pending ? pending.state : mine ? deriveStatus(m, conversation, meId) : undefined;
  const touch = useTouchGestures({
    enabled: interactive,
    onLongPress: (x, y) => menu.open(x, y),
    onSwipeRight: () => handlers.onReply(m),
  });
  return (
    <div {...touch.handlers} style={touch.style}>
      <MessageBubble
        message={m}
        conversation={conversation}
        sender={sender}
        mine={mine}
        position={position}
        showAvatar={showAvatar}
        showName={showName}
        status={status}
        onRetry={pending ? () => retryMessage(pending.client_id) : undefined}
        isGroup={conversation.kind === "group"}
        onContextMenu={interactive ? menu.onContextMenu : undefined}
        toolbar={interactive ? <ActionToolbar message={m} handlers={handlers} onMore={menu.open} /> : undefined}
        above={
          m.reply_to && !m.deleted_at ? (
            <QuotedMessage quote={m.reply_to} conversation={conversation} meId={meId} outgoing={mine} />
          ) : undefined
        }
        footerExtra={extras.footer?.(m)}
        below={<ReactionChips message={m} conversation={conversation} meId={meId} mine={mine} />}
      >
        {extras.body?.(m) ?? <MessageBody message={m} />}
      </MessageBubble>
      {menu.element}
    </div>
  );
});
