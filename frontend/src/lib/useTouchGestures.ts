"use client";

import { type TouchEvent, useRef, useState } from "react";

const LONG_PRESS_MS = 500;
const SWIPE_TRIGGER_PX = 64;
const MAX_DRAG_PX = 80;

/** Mobile message gestures: long-press opens the menu, swipe right starts a reply. */
export function useTouchGestures({
  onLongPress,
  onSwipeRight,
  enabled,
}: {
  onLongPress: (x: number, y: number) => void;
  onSwipeRight: () => void;
  enabled: boolean;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const [offset, setOffset] = useState(0);

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
    setOffset(0);
  };

  if (!enabled) return { handlers: {}, style: undefined };

  return {
    style: offset ? { transform: `translateX(${offset}px)`, transition: "none" } : { transition: "transform 150ms ease-out" },
    handlers: {
      onTouchStart: (e: TouchEvent) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        fired.current = false;
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress(t.clientX, t.clientY);
        }, LONG_PRESS_MS);
      },
      onTouchMove: (e: TouchEvent) => {
        if (!start.current) return;
        const t = e.touches[0];
        const dx = t.clientX - start.current.x;
        const dy = Math.abs(t.clientY - start.current.y);
        if (Math.abs(dx) > 8 || dy > 8) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
        }
        if (dx > 0 && dy < 30) setOffset(Math.min(dx, MAX_DRAG_PX));
      },
      onTouchEnd: () => {
        if (offset >= SWIPE_TRIGGER_PX && !fired.current) onSwipeRight();
        reset();
      },
      onTouchCancel: reset,
    },
  };
}
