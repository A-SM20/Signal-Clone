"use client";

import { CircleDashed, MessageCircle, Phone } from "lucide-react";
import { type Tab, useUi } from "@/stores/ui";

const TABS: { id: Tab; label: string; Icon: typeof Phone }[] = [
  { id: "chats", label: "Chats", Icon: MessageCircle },
  { id: "calls", label: "Calls", Icon: Phone },
  { id: "stories", label: "Stories", Icon: CircleDashed },
];

/** Signal Android's bottom navigation with a pill behind the active icon. */
export function MobileTabBar({ unread }: { unread: number }) {
  const { tab, setTab } = useUi();
  return (
    <nav
      aria-label="Main"
      className="flex h-16 shrink-0 items-stretch justify-around border-t border-divider bg-surface pt-1 pb-[max(8px,env(safe-area-inset-bottom))]"
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            aria-current={active ? "page" : undefined}
            onClick={() => setTab(id)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-[12px] text-fg-2"
          >
            <span
              className={`relative flex h-8 w-16 items-center justify-center rounded-full ${
                active ? "bg-[var(--selected)] text-fg" : ""
              }`}
            >
              <Icon size={20} fill={active && id === "chats" ? "currentColor" : "none"} />
              {id === "chats" && unread > 0 && (
                <span className="absolute top-0 right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <span className={active ? "font-semibold text-fg" : ""}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
