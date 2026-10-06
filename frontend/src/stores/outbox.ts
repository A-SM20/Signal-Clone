import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ApiError } from "@/lib/api/client";
import type { MessageOut } from "@/lib/api/types";
import { onSignOut } from "./auth";

export interface OutboxDraft {
  client_id: string;
  conversation_id: number;
  kind: "text" | "media" | "voice" | "poll";
  body?: string | null;
  reply_to_id?: number | null;
  attachment_ids?: number[];
  poll?: { question: string; options: string[]; allow_multiple: boolean };
}

export interface OutboxEntry extends OutboxDraft {
  state: "sending" | "failed";
  attempts: number;
  created_at: string;
}

export type Sender = (entry: OutboxEntry) => Promise<MessageOut>;

const RETRY_DELAYS_MS = [2000, 4000, 8000];
const inFlight = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function retryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true; // network failure
  return err.status >= 500 || err.status === 408 || err.status === 429;
}

interface OutboxState {
  entries: Record<string, OutboxEntry>;
  enqueue: (draft: OutboxDraft) => void;
  flush: (send: Sender) => Promise<void>;
  retry: (clientId: string, send: Sender) => Promise<void>;
  discard: (clientId: string) => void;
}

/**
 * Messages that haven't been acknowledged by the server yet. Each send reuses the
 * same client_id, so retries can never create duplicates (the server is idempotent).
 */
export const useOutbox = create<OutboxState>()(
  persist(
    (set, get) => {
      const patch = (id: string, changes: Partial<OutboxEntry>) =>
        set((s) => (s.entries[id] ? { entries: { ...s.entries, [id]: { ...s.entries[id], ...changes } } } : s));
      const remove = (id: string) =>
        set((s) => {
          const { [id]: _, ...rest } = s.entries;
          return { entries: rest };
        });

      async function attempt(id: string, send: Sender): Promise<void> {
        const entry = get().entries[id];
        if (!entry || entry.state !== "sending" || inFlight.has(id)) return;
        inFlight.add(id);
        try {
          await send(entry);
          remove(id);
        } catch (err) {
          const attempts = entry.attempts + 1;
          if (!retryable(err) || attempts > RETRY_DELAYS_MS.length) {
            patch(id, { attempts, state: "failed" });
          } else {
            patch(id, { attempts });
            timers.set(id, setTimeout(() => attempt(id, send), RETRY_DELAYS_MS[attempts - 1]));
          }
        } finally {
          inFlight.delete(id);
        }
      }

      return {
        entries: {},
        enqueue: (draft) =>
          set((s) => ({
            entries: {
              ...s.entries,
              [draft.client_id]: { ...draft, state: "sending", attempts: 0, created_at: new Date().toISOString() },
            },
          })),
        flush: async (send) => {
          await Promise.all(
            Object.keys(get().entries)
              .filter((id) => !timers.has(id) || get().entries[id].attempts === 0)
              .map((id) => attempt(id, send)),
          );
        },
        retry: async (clientId, send) => {
          clearTimeout(timers.get(clientId));
          timers.delete(clientId);
          patch(clientId, { state: "sending", attempts: 0 });
          await attempt(clientId, send);
        },
        discard: (clientId) => {
          clearTimeout(timers.get(clientId));
          timers.delete(clientId);
          remove(clientId);
        },
      };
    },
    {
      name: "signal.outbox",
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ entries }) => ({ entries }),
    },
  ),
);

onSignOut(() => useOutbox.setState({ entries: {} }));
