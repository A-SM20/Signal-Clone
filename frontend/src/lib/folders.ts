"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { components } from "@/lib/api/schema";
import type { ConversationOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/stores/auth";

export type FolderOut = components["schemas"]["FolderOut"];
export type FolderInput = Omit<FolderOut, "id" | "position">;

export function inFolder(c: ConversationOut, f: FolderOut | "all"): boolean {
  if (f === "all") return true;
  const matches =
    f.conversation_ids.includes(c.id) || (f.include_direct && c.kind === "direct") || (f.include_groups && c.kind === "group");
  return matches && (!f.unread_only || c.unread_count > 0);
}

/** Signal's suggested folders (Settings → Chats → Chat folders). */
export const PRESETS: FolderInput[] = [
  { name: "Unread", include_direct: true, include_groups: true, unread_only: true, conversation_ids: [] },
  { name: "1:1 chats", include_direct: true, include_groups: false, unread_only: false, conversation_ids: [] },
  { name: "Groups", include_direct: false, include_groups: true, unread_only: false, conversation_ids: [] },
];

export function useFolders() {
  const token = useAuth((s) => s.token);
  return useQuery({ queryKey: qk.folders, queryFn: () => apiFetch<FolderOut[]>("/api/folders"), enabled: !!token });
}

const refresh = () => queryClient.invalidateQueries({ queryKey: qk.folders });

export async function createFolder(input: FolderInput): Promise<FolderOut> {
  const f = await apiFetch<FolderOut>("/api/folders", { method: "POST", json: input });
  await refresh();
  return f;
}

export async function updateFolder(id: number, input: Partial<FolderInput>): Promise<void> {
  await apiFetch(`/api/folders/${id}`, { method: "PATCH", json: input });
  await refresh();
}

export async function deleteFolder(id: number): Promise<void> {
  await apiFetch(`/api/folders/${id}`, { method: "DELETE" });
  await refresh();
}

export async function reorderFolders(ids: number[]): Promise<void> {
  queryClient.setQueryData<FolderOut[]>(qk.folders, (list) =>
    list ? ids.flatMap((id, position) => list.filter((f) => f.id === id).map((f) => ({ ...f, position }))) : list,
  );
  await apiFetch("/api/folders/order", { method: "PUT", json: { ids } });
}
