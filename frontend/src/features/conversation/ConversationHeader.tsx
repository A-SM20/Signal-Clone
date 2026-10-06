"use client";

import { ArrowLeft, Ellipsis, Phone, Video } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { IconButton } from "@/components/ui/controls";
import type { ConversationOut } from "@/lib/api/types";
import { otherMember } from "@/lib/conversations";
import { formatLastSeen } from "@/lib/time";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";

export function headerSubtitle(c: ConversationOut, meId: number): string {
  if (c.kind === "group") {
    const n = c.members.filter((m) => m.left_at === null).length;
    return `${n} member${n === 1 ? "" : "s"}`;
  }
  const other = otherMember(c, meId);
  if (!other) return "";
  if (other.online) return "Online";
  return other.last_seen_at ? formatLastSeen(other.last_seen_at) : "";
}

export function ConversationHeader({
  conversation: c,
  meId,
  menuItems = [],
  badges,
}: {
  conversation: ConversationOut;
  meId: number;
  menuItems?: MenuItem[];
  badges?: ReactNode;
}) {
  const { select, openPanel } = useUi();
  const mobile = useBreakpoint() === "mobile";
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const subtitle = headerSubtitle(c, meId);
  const other = otherMember(c, meId);
  const comingSoon = () => toast("Voice and video calls are coming soon");

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center gap-1 border-b border-divider bg-bg px-2">
      {mobile && (
        <IconButton label="Back" onClick={() => window.history.length > 1 ? window.history.back() : select(null)}>
          <ArrowLeft size={20} />
        </IconButton>
      )}
      <button
        onClick={() => openPanel("conversation-settings")}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 text-left hover:bg-hover"
        aria-label={`${c.title} — chat settings`}
      >
        <Avatar name={c.title} color={c.avatar_color} url={c.avatar_url} size="md" online={other?.online} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
            {c.title}
            {badges}
          </span>
          {subtitle && <span className="block truncate text-[12px] text-fg-2">{subtitle}</span>}
        </span>
      </button>
      {!c.is_note_to_self && (
        <>
          <IconButton label="Video call" onClick={comingSoon}>
            <Video size={20} />
          </IconButton>
          <IconButton label="Voice call" onClick={comingSoon}>
            <Phone size={19} />
          </IconButton>
        </>
      )}
      <IconButton
        label="More options"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.right - 220, y: r.bottom + 4 });
        }}
      >
        <Ellipsis size={20} />
      </IconButton>
      {menu && (
        <ContextMenu
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[{ label: "Chat settings", onSelect: () => openPanel("conversation-settings") }, ...menuItems]}
        />
      )}
    </header>
  );
}
