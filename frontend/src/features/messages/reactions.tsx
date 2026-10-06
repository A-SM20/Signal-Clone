"use client";

import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { ConversationOut, MessageOut } from "@/lib/api/types";
import { toast } from "@/stores/toast";

export const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢"];
const MORE_EMOJI =
  "😀 😃 😄 😁 😆 🥹 😅 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 😰 🤗 🤔 🫡 🤭 🫢 🤫 😶 😐 😑 😬 🙄 😯 😦 😧 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👻 💀 🤖 🎃 😺 👋 🤚 ✋ 👌 ✌️ 🤞 🫶 🤟 🤘 👈 👉 👆 👇 ☝️ 👏 🙌 👐 🙏 💪 🔥 ✨ ⭐ 🎉 🎊 💯 ✅ ❌ 💔 💕 💖 💙 💚 💛 🧡 💜 🖤 🤍 ☕ 🍕 🍔 🍰 🍫 🍷 🍺 🥾 ⛰️ 🏕️ 🌲 🌊 ☀️ 🌧️ 🚀 💡 📷 🎵".split(
    " ",
  );

export async function toggleReaction(m: MessageOut, emoji: string, meId: number): Promise<void> {
  const mine = m.reactions.find((r) => r.user_id === meId);
  try {
    if (mine?.emoji === emoji) await apiFetch(`/api/messages/${m.id}/reaction`, { method: "DELETE" });
    else await apiFetch(`/api/messages/${m.id}/reaction`, { method: "PUT", json: { emoji } });
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Couldn't react");
  }
}

/** Six quick reactions plus a "+" grid, anchored to a screen point. */
export function ReactionPicker({
  anchor,
  message,
  meId,
  onClose,
}: {
  anchor: { x: number; y: number };
  message: MessageOut;
  meId: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState(anchor);
  const mine = message.reactions.find((r) => r.user_id === meId)?.emoji;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(anchor.x - width / 2, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(anchor.y - height - 8, window.innerHeight - height - 8)),
    });
  }, [anchor, expanded]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const pick = (emoji: string) => {
    void toggleReaction(message, emoji, meId);
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="React"
      className="fixed z-[65] rounded-3xl bg-elevated p-1.5 shadow-[var(--shadow)] [animation:pop-in_100ms_ease-out]"
      style={{ left: pos.x, top: pos.y }}
    >
      {expanded ? (
        <div className="grid max-h-64 w-72 grid-cols-8 gap-0.5 overflow-y-auto p-1">
          {MORE_EMOJI.map((e) => (
            <button key={e} onClick={() => pick(e)} className="rounded-lg p-1 text-[20px] hover:bg-hover" aria-label={`React ${e}`}>
              {e}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              onClick={() => pick(e)}
              aria-label={`React ${e}`}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-[24px] transition-transform hover:scale-125 ${
                mine === e ? "bg-[var(--selected)]" : ""
              }`}
            >
              {e}
            </button>
          ))}
          <button
            onClick={() => setExpanded(true)}
            aria-label="More reactions"
            className="flex h-10 w-10 items-center justify-center rounded-full text-fg-2 hover:bg-hover"
          >
            <Plus size={20} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Emoji + count pills under the bubble; mine are outlined; hover lists who reacted. */
export function ReactionChips({ message, conversation, meId, mine }: { message: MessageOut; conversation: ConversationOut; meId: number; mine: boolean }) {
  if (!message.reactions.length) return null;
  const groups = new Map<string, number[]>();
  for (const r of message.reactions) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.user_id]);
  const name = (id: number) =>
    id === meId ? "You" : conversation.members.find((m) => m.user.id === id)?.user.display_name ?? "Someone";
  return (
    <div className={`relative z-[1] -mt-1.5 flex flex-wrap gap-1 ${mine ? "mr-2 justify-end" : "ml-2"}`}>
      {[...groups.entries()].map(([emoji, users]) => {
        const iReacted = users.includes(meId);
        return (
          <button
            key={emoji}
            title={users.map(name).join(", ")}
            onClick={() => toggleReaction(message, emoji, meId)}
            className={`flex h-6 items-center gap-1 rounded-full border-2 border-[var(--bg)] px-1.5 text-[13px] ${
              iReacted ? "bg-[var(--selected)]" : "bg-surface-2"
            }`}
          >
            <span>{emoji}</span>
            {users.length > 1 && <span className="text-[11px] font-semibold text-fg-2">{users.length}</span>}
          </button>
        );
      })}
    </div>
  );
}
