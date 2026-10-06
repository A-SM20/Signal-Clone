import { create } from "zustand";

export type Tab = "chats" | "calls" | "stories" | "settings";
export type Panel = null | "conversation-settings" | "new-chat" | "new-group" | "archived" | "requests";

interface UiState {
  tab: Tab;
  selectedId: number | null;
  panel: Panel;
  select: (id: number | null) => void;
  setTab: (tab: Tab) => void;
  openPanel: (panel: Exclude<Panel, null>) => void;
  closePanel: () => void;
}

export const useUi = create<UiState>()((set) => ({
  tab: "chats",
  selectedId: null,
  panel: null,
  select: (id) =>
    set((s) => ({
      selectedId: id,
      panel: s.panel === "conversation-settings" ? null : s.panel,
      tab: id === null ? s.tab : "chats",
    })),
  setTab: (tab) => set({ tab, panel: null }),
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),
}));
