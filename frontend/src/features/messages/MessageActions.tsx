"use client";

import { Copy, Ellipsis, Info, Reply, SmilePlus } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import type { MessageOut } from "@/lib/api/types";
import { toast } from "@/stores/toast";

export interface ActionHandlers {
  onReply: (m: MessageOut) => void;
  onReact: (m: MessageOut, anchor: { x: number; y: number }) => void;
  onInfo?: (m: MessageOut) => void;
  extraItems?: (m: MessageOut, mine: boolean) => MenuItem[];
}

/** Right-click / "More" menu for one message. */
export function useMessageMenu(m: MessageOut, mine: boolean, handlers: ActionHandlers) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const items: MenuItem[] = anchor
    ? [
        { label: "React", icon: <SmilePlus size={16} />, onSelect: () => handlers.onReact(m, anchor) },
        { label: "Reply", icon: <Reply size={16} />, onSelect: () => handlers.onReply(m) },
        ...(m.body
          ? [
              {
                label: "Copy text",
                icon: <Copy size={16} />,
                onSelect: () => void navigator.clipboard?.writeText(m.body ?? "").then(() => toast("Copied")),
              },
            ]
          : []),
        ...(mine && handlers.onInfo ? [{ label: "Info", icon: <Info size={16} />, onSelect: () => handlers.onInfo!(m) }] : []),
        ...(handlers.extraItems?.(m, mine) ?? []),
      ]
    : [];
  return {
    open: (x: number, y: number) => setAnchor({ x, y }),
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      setAnchor({ x: e.clientX, y: e.clientY });
    },
    element: anchor && <ContextMenu items={items} anchor={anchor} onClose={() => setAnchor(null)} />,
  };
}

/** Desktop hover toolbar shown beside the bubble (react, reply, more). */
export function ActionToolbar({
  message,
  handlers,
  onMore,
}: {
  message: MessageOut;
  handlers: ActionHandlers;
  onMore: (x: number, y: number) => void;
}) {
  const btn = "rounded-full p-1.5 text-fg-2 hover:bg-hover hover:text-fg";
  return (
    <div className="hidden shrink-0 items-center self-center opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 md:flex">
      <button
        aria-label="React"
        className={btn}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          handlers.onReact(message, { x: r.left + r.width / 2, y: r.top });
        }}
      >
        <SmilePlus size={17} />
      </button>
      <button aria-label="Reply" className={btn} onClick={() => handlers.onReply(message)}>
        <Reply size={17} />
      </button>
      <button aria-label="More actions" className={btn} onClick={(e) => onMore(e.clientX, e.clientY)}>
        <Ellipsis size={17} />
      </button>
    </div>
  );
}
