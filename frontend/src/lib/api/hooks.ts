"use client";

import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { sortConversations } from "@/lib/conversations";
import { useAuth } from "@/stores/auth";
import { apiFetch } from "./client";
import { qk } from "./queryKeys";
import type { ConversationOut, UserOut } from "./types";

export function useConversations() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: qk.conversations,
    queryFn: () => apiFetch<ConversationOut[]>("/api/conversations"),
    enabled: !!token,
    select: sortConversations,
  });
}

export function useConversation(id: number | null): ConversationOut | undefined {
  const { data } = useConversations();
  return id === null ? undefined : data?.find((c) => c.id === id);
}

export function useContacts() {
  return useQuery({ queryKey: qk.contacts, queryFn: () => apiFetch<UserOut[]>("/api/contacts") });
}

export function useMeId(): number {
  return useAuth((s) => s.me?.id ?? 0);
}

/** Insert or replace a conversation in the cached list. */
export function upsertConversation(c: ConversationOut): void {
  queryClient.setQueryData<ConversationOut[]>(qk.conversations, (old) =>
    old ? [c, ...old.filter((x) => x.id !== c.id)] : [c],
  );
}

export async function openDirect(userId: number): Promise<ConversationOut> {
  const c = await apiFetch<ConversationOut>("/api/conversations/direct", { method: "POST", json: { user_id: userId } });
  upsertConversation(c);
  return c;
}

export async function patchMyState(
  id: number,
  changes: Partial<{ is_pinned: boolean; is_archived: boolean; muted_until: string | null }>,
): Promise<void> {
  const c = await apiFetch<ConversationOut>(`/api/conversations/${id}/me`, { method: "PATCH", json: changes });
  upsertConversation(c);
}
