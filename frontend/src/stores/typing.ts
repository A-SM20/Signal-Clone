import { create } from "zustand";

const EXPIRE_MS = 8000;

interface TypingState {
  /** conversationId -> userId -> expiresAt (ms) */
  byConversation: Record<number, Record<number, number>>;
  set: (conversationId: number, userId: number, state: "start" | "stop") => void;
  active: (conversationId: number) => number[];
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Who is typing where. Entries self-expire so a lost "stop" can't leave someone typing forever. */
export const useTyping = create<TypingState>()((set, get) => ({
  byConversation: {},
  set: (conversationId, userId, state) => {
    const key = `${conversationId}:${userId}`;
    clearTimeout(timers.get(key));
    timers.delete(key);
    const remove = () =>
      set((s) => {
        const { [userId]: _, ...rest } = s.byConversation[conversationId] ?? {};
        return { byConversation: { ...s.byConversation, [conversationId]: rest } };
      });
    if (state === "stop") return remove();
    const expiresAt = Date.now() + EXPIRE_MS;
    set((s) => ({
      byConversation: {
        ...s.byConversation,
        [conversationId]: { ...s.byConversation[conversationId], [userId]: expiresAt },
      },
    }));
    timers.set(key, setTimeout(remove, EXPIRE_MS));
  },
  active: (conversationId) => Object.keys(get().byConversation[conversationId] ?? {}).map(Number),
}));
