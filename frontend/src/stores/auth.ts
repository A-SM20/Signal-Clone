import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { MeOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";

interface AuthState {
  token: string | null;
  me: MeOut | null;
  setSession: (token: string, me: MeOut | null) => void;
  setMe: (me: MeOut) => void;
  signOut: () => void;
}

const signOutHooks = new Set<() => void>();

/** Lets other stores (e.g. the outbox) clear themselves on sign-out without a circular import. */
export function onSignOut(hook: () => void): () => void {
  signOutHooks.add(hook);
  return () => signOutHooks.delete(hook);
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      me: null,
      setSession: (token, me) => set({ token, me }),
      setMe: (me) => set({ me }),
      signOut: () => {
        set({ token: null, me: null });
        queryClient.clear();
        signOutHooks.forEach((hook) => hook());
      },
    }),
    {
      name: "signal.session",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ token, me }) => ({ token, me }),
    },
  ),
);
