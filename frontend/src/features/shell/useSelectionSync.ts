"use client";

import { useEffect, useRef } from "react";
import { parseSelection, selectionSearch } from "@/lib/selection";
import { useUi } from "@/stores/ui";

/**
 * Mirrors the open chat into ?c=<id>. Opening a chat pushes a history entry, so the
 * Android/browser back button returns to the list instead of leaving the app.
 */
export function useSelectionSync(): void {
  const selectedId = useUi((s) => s.selectedId);
  const fromPopState = useRef(false);

  useEffect(() => {
    useUi.getState().select(parseSelection(window.location.search));
    const onPop = () => {
      fromPopState.current = true;
      useUi.getState().select(parseSelection(window.location.search));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (fromPopState.current) {
      fromPopState.current = false;
      return;
    }
    // Read the live store value: this effect can run with a stale render's selectedId
    // (e.g. React StrictMode re-running effects), which must not wipe ?c= from the URL.
    const id = useUi.getState().selectedId;
    const current = parseSelection(window.location.search);
    if (current === id) return;
    const url = `${window.location.pathname}${selectionSearch(id)}`;
    if (current === null && id !== null) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, [selectedId]);
}
