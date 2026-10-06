"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";

const MIN = 300;
const MAX = 440;
const DEFAULT = 360;
const STORAGE_KEY = "signal.listWidth";

export function clampListWidth(px: number): number {
  return Math.min(MAX, Math.max(MIN, px));
}

function storedWidth(): number {
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    return raw ? clampListWidth(raw) : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Chat-list column with a drag handle on its right edge (desktop), like Signal Desktop. */
export function ResizableListPane({ children, resizable }: { children: ReactNode; resizable: boolean }) {
  const [width, setWidth] = useState(DEFAULT);
  useEffect(() => setWidth(storedWidth()), []);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: PointerEvent) => setWidth(clampListWidth(startWidth + ev.clientX - startX));
      const onUp = (ev: PointerEvent) => {
        const final = clampListWidth(startWidth + ev.clientX - startX);
        try {
          localStorage.setItem(STORAGE_KEY, String(final));
        } catch {}
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [width],
  );

  return (
    <div className="relative flex h-full shrink-0 flex-col bg-surface" style={{ width: resizable ? width : MIN }}>
      {children}
      {resizable && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat list"
          onPointerDown={startDrag}
          className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize"
        />
      )}
    </div>
  );
}
