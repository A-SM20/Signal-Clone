"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  anchor: { x: number; y: number };
  onClose: () => void;
}

/** Floating menu positioned at a point, kept inside the viewport, keyboard navigable. */
export function ContextMenu({ items, anchor, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(anchor);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(anchor.y, window.innerHeight - height - 8)),
    });
    el.focus();
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") setActive((i) => (i + 1) % items.length);
      else if (e.key === "ArrowUp") setActive((i) => (i - 1 + items.length) % items.length);
      else if (e.key === "Enter" && !items[active]?.disabled) {
        items[active]?.onSelect();
        onClose();
      } else return;
      e.preventDefault();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [items, active, onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      className="fixed z-[60] min-w-[200px] rounded-xl bg-elevated py-1.5 text-[14px] text-fg shadow-[var(--shadow)] outline-none [animation:pop-in_100ms_ease-out]"
      style={{ left: pos.x, top: pos.y }}
    >
      {items.map((item, i) => (
        <button
          key={item.label}
          role="menuitem"
          disabled={item.disabled}
          onMouseEnter={() => setActive(i)}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className={`flex w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-40 ${
            i === active ? "bg-hover" : ""
          } ${item.danger ? "text-danger" : ""}`}
        >
          {item.icon && <span className="flex w-5 justify-center text-fg-2">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}
