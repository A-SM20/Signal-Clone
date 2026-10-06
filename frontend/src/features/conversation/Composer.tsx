"use client";

import { SendHorizontal } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ConversationOut } from "@/lib/api/types";
import { sendMessage } from "@/lib/messaging";
import { socketClient } from "@/lib/realtime/useRealtime";
import { useBreakpoint } from "@/lib/useBreakpoint";

const TYPING_THROTTLE_MS = 3000;
const TYPING_IDLE_MS = 5000;
const DRAFTS = new Map<number, string>();

export interface ComposerSlots {
  above?: ReactNode;
  left?: ReactNode;
  right?: (hasText: boolean) => ReactNode;
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

/** Auto-growing message box: Enter sends, Shift+Enter adds a line (on desktop). */
export function Composer({ conversation, slots = {} }: { conversation: ConversationOut; slots?: ComposerSlots }) {
  const [text, setText] = useState(() => DRAFTS.get(conversation.id) ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  const typing = useTypingSignal(conversation.id);
  const mobile = useBreakpoint() === "mobile";

  useEffect(() => {
    setText(DRAFTS.get(conversation.id) ?? "");
    if (!mobile) box.current?.focus();
  }, [conversation.id, mobile]);

  useEffect(() => {
    const focus = () => box.current?.focus();
    window.addEventListener("signal:focus-composer", focus);
    return () => window.removeEventListener("signal:focus-composer", focus);
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const update = (value: string) => {
    setText(value);
    DRAFTS.set(conversation.id, value);
    if (value.trim()) typing.ping();
    else typing.stop();
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    sendMessage({ conversation_id: conversation.id, kind: "text", body, reply_to_id: slots.replyToId ?? null });
    update("");
    typing.stop();
    slots.onSent?.();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slots.onKeyDownCapture?.(e, text)) return;
    if (e.key === "Enter" && !e.shiftKey && !mobile && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const hasText = !!text.trim();
  return (
    <div className="shrink-0 border-t border-divider bg-bg px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      {slots.above}
      <div className="flex items-end gap-2">
        {slots.left}
        <div className="flex min-h-10 flex-1 items-center rounded-[20px] bg-surface-2 px-4 py-2">
          <textarea
            ref={box}
            rows={1}
            value={text}
            aria-label="Message"
            placeholder="Message"
            onChange={(e) => update(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={typing.stop}
            className="max-h-40 w-full resize-none bg-transparent text-[14px] leading-5 text-fg outline-none placeholder:text-fg-3"
          />
        </div>
        {slots.right ? (
          slots.right(hasText) ?? null
        ) : null}
        {(hasText || !slots.right) && (
          <button
            aria-label="Send"
            onClick={send}
            disabled={!hasText}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
          >
            <SendHorizontal size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
