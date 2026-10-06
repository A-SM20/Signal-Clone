"use client";

import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api/queryKeys";
import { API_URL } from "@/lib/config";
import { queryClient } from "@/lib/queryClient";
import { useUi } from "@/stores/ui";

export function mediaUrl(path: string): string {
  return path.startsWith("http") || path.startsWith("blob:") ? path : `${API_URL}${path}`;
}

const reported = new Set<string>();

/**
 * Signed file URLs expire (1–2 h). When one fails to load in a long-open tab,
 * refetch the data that carries fresh URLs — once per URL, so a missing file
 * can't trigger a refetch loop.
 */
export function reportBrokenMedia(url: string, qc: QueryClient = queryClient): void {
  if (reported.has(url)) return;
  reported.add(url);
  qc.invalidateQueries({ queryKey: qk.conversations });
  const open = useUi.getState().selectedId;
  if (open !== null) qc.invalidateQueries({ queryKey: qk.messages(open) });
  qc.invalidateQueries({ queryKey: qk.me });
}

export function useSignedMedia(url: string): { src: string; onError: () => void } {
  return { src: mediaUrl(url), onError: () => reportBrokenMedia(url) };
}
