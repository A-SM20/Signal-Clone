"use client";

import { useEffect } from "react";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut } from "@/lib/api/types";
import { notificationFor, unreadTitle } from "@/lib/notifications";
import { queryClient } from "@/lib/queryClient";
import { onServerEvent } from "@/lib/realtime/useRealtime";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

/** OS notifications for incoming messages + "(3) Signal" tab title. */
export function useNotifications(unreadTotal: number): void {
  useEffect(() => {
    document.title = unreadTitle(unreadTotal);
  }, [unreadTotal]);

  useEffect(
    () =>
      onServerEvent((e) => {
        if (e.type !== "message.created" || typeof Notification === "undefined" || Notification.permission !== "granted") return;
        const me = useAuth.getState().me;
        const c = queryClient.getQueryData<ConversationOut[]>(qk.conversations)?.find((x) => x.id === e.data.conversation_id);
        if (!me || !c) return;
        const note = notificationFor(e.data, c, me.settings, {
          meId: me.id,
          now: Date.now(),
          isVisible: document.visibilityState === "visible",
          openConversationId: useUi.getState().selectedId,
        });
        if (!note) return;
        const n = new Notification(note.title, { body: note.body, tag: `conversation-${c.id}` });
        n.onclick = () => {
          window.focus();
          useUi.getState().select(c.id);
          n.close();
        };
      }),
    [],
  );
}
