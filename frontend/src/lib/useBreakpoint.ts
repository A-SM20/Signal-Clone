"use client";

import { useSyncExternalStore } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

const MOBILE = "(max-width: 767.98px)";
const TABLET = "(max-width: 1023.98px)";

function current(): Breakpoint {
  if (window.matchMedia(MOBILE).matches) return "mobile";
  if (window.matchMedia(TABLET).matches) return "tablet";
  return "desktop";
}

function subscribe(onChange: () => void): () => void {
  const queries = [window.matchMedia(MOBILE), window.matchMedia(TABLET)];
  queries.forEach((q) => q.addEventListener("change", onChange));
  return () => queries.forEach((q) => q.removeEventListener("change", onChange));
}

/** mobile < 768 px ≤ tablet < 1024 px ≤ desktop. */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, current, () => "desktop");
}
