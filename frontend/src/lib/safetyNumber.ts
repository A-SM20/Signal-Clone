"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { components } from "@/lib/api/schema";
import type { ConversationOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";

export type SafetyNumberOut = components["schemas"]["SafetyNumberOut"];

/** Signal shows the 60 digits as 12 blocks of 5. */
export function groupSafetyNumber(digits: string): string[] {
  return digits.match(/.{1,5}/g) ?? [];
}

export function useSafetyNumber(userId: number | null | undefined) {
  return useQuery({
    queryKey: qk.safety(userId ?? 0),
    queryFn: () => apiFetch<SafetyNumberOut>(`/api/users/${userId}/safety-number`),
    enabled: !!userId,
    staleTime: 60_000,
  });
}

/** Mark or clear verification, then refresh the cached number and the direct chat's "changed" flag. */
export async function setVerified(userId: number, verified: boolean): Promise<SafetyNumberOut> {
  const res = await apiFetch<SafetyNumberOut>(`/api/users/${userId}/verification`, {
    method: verified ? "POST" : "DELETE",
  });
  queryClient.setQueryData(qk.safety(userId), res);
  queryClient.setQueryData<ConversationOut[]>(qk.conversations, (list) =>
    list?.map((c) =>
      c.kind === "direct" && c.members.some((m) => m.user.id === userId)
        ? { ...c, safety_number_changed: res.changed }
        : c,
    ),
  );
  return res;
}
