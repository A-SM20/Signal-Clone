"use client";

import { useEffect, useRef } from "react";
import { useConversations } from "@/lib/api/hooks";
import { qk } from "@/lib/api/queryKeys";
import { sendOutboxEntry } from "@/lib/messaging";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/stores/auth";
import { useOutbox } from "@/stores/outbox";
import { useUi } from "@/stores/ui";
import { applyEvent } from "./applyEvent";
import type { ServerEvent } from "./events";
import { SocketClient } from "./socket";

export const socketClient = new SocketClient();

type Listener = (e: ServerEvent) => void;
const extraListeners = new Set<Listener>();

/** Lets features (e.g. notifications) observe server events without owning the socket. */
export function onServerEvent(listener: Listener): () => void {
  extraListeners.add(listener);
  return () => extraListeners.delete(listener);
}

export function sendReceipt(conversationId: number, kind: "delivered" | "read", upTo: number): void {
  socketClient.send({ type: "receipt", data: { conversation_id: conversationId, kind, up_to_message_id: upTo } });
}

/** Owns the app's single WebSocket: routes events into the query cache and sends delivery receipts. */
export function useRealtime(): void {
  const token = useAuth((s) => s.token);
  const meId = useAuth((s) => s.me?.id ?? 0);
  const { data: conversations } = useConversations();
  const delivered = useRef(new Map<number, number>());

  useEffect(() => {
    if (!token || !meId) return;
    socketClient.connect(token);
    const off = socketClient.onEvent((e) => {
      if (e.type === "ready") {
        // (Re)connected: anything could have happened while we were away.
        queryClient.invalidateQueries({ queryKey: qk.conversations });
        const open = useUi.getState().selectedId;
        if (open !== null) queryClient.invalidateQueries({ queryKey: qk.messages(open) });
        void useOutbox.getState().flush(sendOutboxEntry);
        return;
      }
      applyEvent(queryClient, e, {
        meId,
        openConversationId: useUi.getState().selectedId,
        isVisible: document.visibilityState === "visible",
      });
      if (e.type === "message.created" && e.data.sender_id !== meId && e.data.kind !== "system") {
        sendReceipt(e.data.conversation_id, "delivered", e.data.id);
        delivered.current.set(e.data.conversation_id, e.data.id);
      }
      extraListeners.forEach((l) => l(e));
    });
    return () => {
      off();
      socketClient.close();
    };
  }, [token, meId]);

  // Messages that arrived while we were offline: acknowledge delivery once the list loads.
  useEffect(() => {
    for (const c of conversations ?? []) {
      const last = c.last_message;
      if (!last || last.sender_id === meId || last.kind === "system") continue;
      const mine = c.members.find((m) => m.user.id === meId);
      const already = Math.max(mine?.last_delivered_message_id ?? 0, delivered.current.get(c.id) ?? 0);
      if (last.id > already) {
        sendReceipt(c.id, "delivered", last.id);
        delivered.current.set(c.id, last.id);
      }
    }
  }, [conversations, meId]);
}
