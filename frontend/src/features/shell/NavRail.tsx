"use client";

import { CircleDashed, Menu, MessageCircle, Phone, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/stores/auth";
import { type Tab, useUi } from "@/stores/ui";

function RailButton({
  label,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`relative flex h-9 w-10 items-center justify-center rounded-xl text-fg-2 hover:bg-hover hover:text-fg ${
        active ? "bg-[var(--selected)] text-fg" : ""
      }`}
    >
      {children}
      {!!badge && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/** Signal Desktop's left icon column: Chats / Calls / Stories, profile + settings at the bottom. */
export function NavRail({ unread }: { unread: number }) {
  const { tab, setTab } = useUi();
  const me = useAuth((s) => s.me);
  const go = (t: Tab) => () => setTab(t);
  return (
    <nav
      aria-label="Main"
      className="flex h-full w-[var(--rail-width)] shrink-0 flex-col items-center gap-2 border-r border-divider bg-surface py-3"
    >
      <RailButton label="Collapse" onClick={() => {}}>
        <Menu size={20} />
      </RailButton>
      <div className="h-1" />
      <RailButton label="Chats" active={tab === "chats"} badge={unread} onClick={go("chats")}>
        <MessageCircle size={20} fill={tab === "chats" ? "currentColor" : "none"} />
      </RailButton>
      <RailButton label="Calls" active={tab === "calls"} onClick={go("calls")}>
        <Phone size={20} />
      </RailButton>
      <RailButton label="Stories" active={tab === "stories"} onClick={go("stories")}>
        <CircleDashed size={20} />
      </RailButton>
      <div className="flex-1" />
      <RailButton label="Settings" active={tab === "settings"} onClick={go("settings")}>
        <Settings size={20} />
      </RailButton>
      {me && (
        <button aria-label="Profile" title="Profile" onClick={go("settings")} className="mt-1 rounded-full">
          <Avatar name={me.display_name || me.phone} color={me.avatar_color} url={me.avatar_url} size="sm" />
        </button>
      )}
    </nav>
  );
}
