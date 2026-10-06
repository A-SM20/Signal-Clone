import { create } from "zustand";
import type { MessageOut } from "@/lib/api/types";
import { onSignOut } from "./auth";

/** The message being edited in the composer, per conversation. */
export const useEditing = create<{
  byConversation: Record<number, MessageOut | null>;
  set: (conversationId: number, message: MessageOut | null) => void;
}>()((set) => ({
  byConversation: {},
  set: (conversationId, message) => set((s) => ({ byConversation: { ...s.byConversation, [conversationId]: message } })),
}));

onSignOut(() => useEditing.setState({ byConversation: {} }));
