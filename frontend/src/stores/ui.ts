import { create } from "zustand";
import { onSignOut } from "./auth";

export type Tab = "chats" | "calls" | "stories" | "settings";
export type SettingsSection =
  | "profile"
  | "account"
  | "devices"
  | "appearance"
  | "chats"
  | "notifications"
  | "privacy"
  | "data"
  | "help";
export type Panel = null | "conversation-settings" | "new-chat" | "new-group" | "archived" | "requests";

interface UiState {
  tab: Tab;
  selectedId: number | null;
  panel: Panel;
  settingsSection: SettingsSection | null;
  /** Chat-list folder tab: "all" or a folder id. */
  folder: number | "all";
  setFolder: (folder: number | "all") => void;
  openSettings: (section: SettingsSection | null) => void;
  select: (id: number | null) => void;
  setTab: (tab: Tab) => void;
  openPanel: (panel: Exclude<Panel, null>) => void;
  closePanel: () => void;
}

export const useUi = create<UiState>()((set) => ({
  tab: "chats",
  selectedId: null,
  panel: null,
  settingsSection: null,
  folder: "all",
  setFolder: (folder) => set({ folder }),
  openSettings: (settingsSection) => set({ settingsSection }),
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

// The next account starts on its chat list, never on the previous account's settings or chat.
onSignOut(() => useUi.setState({ tab: "chats", selectedId: null, panel: null, settingsSection: null, folder: "all" }));
