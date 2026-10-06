"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut } from "@/lib/api/types";
import { sortConversations } from "@/lib/conversations";
import { queryClient } from "@/lib/queryClient";
import { detectPlatform, matchShortcut, SHORTCUTS } from "@/lib/shortcuts";
import { useUi } from "@/stores/ui";

function visibleChats(): ConversationOut[] {
  const all = queryClient.getQueryData<ConversationOut[]>(qk.conversations) ?? [];
  return sortConversations(all.filter((c) => !c.me.is_archived && c.me.request_state !== "pending"));
}

/** App-wide keyboard shortcuts (Signal Desktop style) plus the Ctrl+/ guide. */
export function useShortcuts() {
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    const platform = detectPlatform();
    const onKey = (e: KeyboardEvent) => {
      const id = matchShortcut(e, platform);
      if (!id) return;
      const ui = useUi.getState();
      switch (id) {
        case "newChat":
          ui.setTab("chats");
          ui.openPanel("new-chat");
          break;
        case "search":
          ui.setTab("chats");
          ui.closePanel();
          setTimeout(() => window.dispatchEvent(new Event("signal:focus-search")));
          break;
        case "prevChat":
        case "nextChat": {
          const chats = visibleChats();
          if (!chats.length) return;
          const i = chats.findIndex((c) => c.id === ui.selectedId);
          const next = id === "nextChat" ? Math.min(chats.length - 1, i + 1) : Math.max(0, i === -1 ? 0 : i - 1);
          ui.select(chats[next].id);
          break;
        }
        case "closeOrCancel":
          if (!ui.panel) return; // let the composer handle Esc (cancel reply/edit)
          ui.closePanel();
          break;
        case "showShortcuts":
          setGuide((v) => !v);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const openGuide = () => setGuide(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("signal:shortcuts", openGuide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("signal:shortcuts", openGuide);
    };
  }, []);

  const platform = typeof navigator === "undefined" ? "other" : detectPlatform();
  return guide ? (
    <Modal title="Keyboard shortcuts" onClose={() => setGuide(false)}>
      <ul className="divide-y divide-[var(--divider)]">
        {SHORTCUTS.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2.5 text-[14px]">
            <span>{s.label}</span>
            <kbd className="rounded-md bg-surface-2 px-2 py-0.5 font-sans text-[12px] text-fg-2">{s.keys(platform)}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  ) : null;
}
