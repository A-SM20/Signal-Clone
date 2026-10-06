"use client";

import { useEffect } from "react";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut, MessageOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { sendReceipt } from "@/lib/realtime/useRealtime";

/**
 * Sends a read receipt for the newest message once the chat is actually seen:
 * tab visible, this conversation open, timeline scrolled to the bottom.
 */
export function useReadReceipts(conversation: ConversationOut, messages: MessageOut[], atBottom: boolean, meId: number) {
  const newestIncoming = [...messages].reverse().find((m) => m.sender_id !== meId && m.id < Number.MAX_SAFE_INTEGER - 2000);
  const newestId = newestIncoming?.id ?? 0;
  const lastRead = conversation.me.last_read_message_id;

  useEffect(() => {
    const mark = () => {
      if (document.visibilityState !== "visible" || !atBottom || newestId <= lastRead) return;
      sendReceipt(conversation.id, "read", newestId);
      queryClient.setQueryData<ConversationOut[]>(qk.conversations, (list) =>
        list?.map((c) =>
          c.id === conversation.id
            ? {
                ...c,
                unread_count: 0,
                me: { ...c.me, last_read_message_id: newestId },
                members: c.members.map((m) =>
                  m.user.id === meId ? { ...m, last_read_message_id: newestId, last_delivered_message_id: Math.max(m.last_delivered_message_id ?? 0, newestId) } : m,
                ),
              }
            : c,
        ),
      );
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    window.addEventListener("focus", mark);
    return () => {
      document.removeEventListener("visibilitychange", mark);
      window.removeEventListener("focus", mark);
    };
  }, [conversation.id, newestId, lastRead, atBottom, meId]);
}
