"use client";

import { SendHorizontal } from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { InfiniteData } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut, MessagePage } from "@/lib/api/types";
import { editMessage, lastEditable } from "@/lib/editing";
import { sendMessage } from "@/lib/messaging";
import { queryClient } from "@/lib/queryClient";
import { isEditLastKey } from "@/lib/shortcuts";
import { useAuth } from "@/stores/auth";
import { useEditing } from "@/stores/editing";
import { toast } from "@/stores/toast";
import { socketClient } from "@/lib/realtime/useRealtime";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { AttachButton, AttachmentTray, useAttachmentTray } from "./AttachmentTray";
import { EditingBar } from "./EditingBar";

const TYPING_THROTTLE_MS = 3000;
const TYPING_IDLE_MS = 5000;
const DRAFTS = new Map<number, string>();

export interface ComposerSlots {
  above?: ReactNode;
  left?: ReactNode;
  /** Shown instead of the send button while the box is empty (e.g. the mic). */
  idleAction?: ReactNode;
  replyToId?: number | null;
  onSent?: () => void;
  onKeyDownCapture?: (e: KeyboardEvent<HTMLTextAreaElement>, text: string) => boolean;
}

function useTypingSignal(conversationId: number) {
  const lastStart = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = (state: "start" | "stop") =>
    socketClient.send({ type: "typing", data: { conversation_id: conversationId, state } });
  const stop = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    if (lastStart.current) send("stop");
    lastStart.current = 0;
  };
  const ping = () => {
    const now = Date.now();
    if (now - lastStart.current > TYPING_THROTTLE_MS) {
      send("start");
      lastStart.current = now;
    }
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(stop, TYPING_IDLE_MS);
  };
  useEffect(() => stop, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ping, stop };
}

/** Auto-growing message box: Enter sends, Shift+Enter adds a line (desktop); files via +, paste or drop. */
export function Composer({ conversation, slots = {} }: { conversation: ConversationOut; slots?: ComposerSlots }) {
  const [text, setText] = useState(() => DRAFTS.get(conversation.id) ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  const typing = useTypingSignal(conversation.id);
  const tray = useAttachmentTray();
  const mobile = useBreakpoint() === "mobile";
  const editing = useEditing((s) => s.byConversation[conversation.id] ?? null);
  const setEditing = useEditing((s) => s.set);

  // Entering edit mode loads the message text; leaving it restores the unsent draft.
  useEffect(() => {
    setText(editing ? (editing.body ?? "") : (DRAFTS.get(conversation.id) ?? ""));
    if (editing) box.current?.focus();
  }, [editing, conversation.id]);

  useEffect(() => {
    tray.clear();
    if (!mobile) box.current?.focus();
  }, [conversation.id, mobile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const focus = () => box.current?.focus();
    const drop = (e: Event) => tray.add((e as CustomEvent<File[]>).detail);
    window.addEventListener("signal:focus-composer", focus);
    window.addEventListener("signal:drop-files", drop);
    return () => {
      window.removeEventListener("signal:focus-composer", focus);
      window.removeEventListener("signal:drop-files", drop);
    };
  }, [tray]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const update = (value: string) => {
    setText(value);
    if (editing) return;
    DRAFTS.set(conversation.id, value);
    if (value.trim()) typing.ping();
    else typing.stop();
  };

  const hasText = !!text.trim();
  const hasFiles = tray.items.length > 0;
  const canSend = hasFiles ? tray.ready : hasText;

  const cancelEdit = () => setEditing(conversation.id, null);

  const saveEdit = () => {
    const target = editing!;
    const body = text.trim();
    cancelEdit();
    if (!body || body === target.body) return;
    editMessage(target, body).catch((e) => toast(e instanceof ApiError ? e.message : "Couldn't edit the message"));
  };

  const send = () => {
    if (editing) return saveEdit();
    if (!canSend) return;
    const body = text.trim() || null;
    if (hasFiles) {
      const uploaded = tray.items.flatMap((x) => (x.uploaded ? [x.uploaded] : []));
      sendMessage({
        conversation_id: conversation.id,
        kind: "media",
        body,
        reply_to_id: slots.replyToId ?? null,
        attachment_ids: uploaded.map((a) => a.id),
        attachments: uploaded,
      });
      tray.clear();
    } else {
      sendMessage({ conversation_id: conversation.id, kind: "text", body, reply_to_id: slots.replyToId ?? null });
    }
    update("");
    typing.stop();
    slots.onSent?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (editing && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      return cancelEdit();
    }
    if (!editing && isEditLastKey(e, text) && !hasFiles) {
      const pages = queryClient.getQueryData<InfiniteData<MessagePage>>(qk.messages(conversation.id))?.pages ?? [];
      const oldestFirst = pages.flatMap((p) => p.items).reverse();
      const target = lastEditable(oldestFirst, useAuth.getState().me?.id ?? 0);
      if (target) {
        e.preventDefault();
        return setEditing(conversation.id, target);
      }
    }
    if (slots.onKeyDownCapture?.(e, text)) return;
    if (e.key === "Enter" && !e.shiftKey && !mobile && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      tray.add(files);
    }
  };

  return (
    <div className="shrink-0 border-t border-divider bg-bg px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      {editing ? <EditingBar message={editing} onCancel={cancelEdit} /> : slots.above}
      <AttachmentTray items={tray.items} onRemove={tray.remove} />
      <div className="flex items-end gap-1.5">
        {!editing && <AttachButton onFiles={tray.add} />}
        {slots.left}
        <div className="flex min-h-10 flex-1 items-center rounded-[20px] bg-surface-2 px-4 py-2">
          <textarea
            ref={box}
            rows={1}
            value={text}
            aria-label="Message"
            placeholder={hasFiles ? "Add a message" : "Message"}
            onChange={(e) => update(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={typing.stop}
            className="max-h-40 w-full resize-none bg-transparent text-[14px] leading-5 text-fg outline-none placeholder:text-fg-3"
          />
        </div>
        {!editing && !hasText && !hasFiles && slots.idleAction ? (
          slots.idleAction
        ) : (
          <button
            aria-label={editing ? "Save edit" : "Send"}
            onClick={send}
            disabled={editing ? !hasText : !canSend}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
          >
            <SendHorizontal size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
