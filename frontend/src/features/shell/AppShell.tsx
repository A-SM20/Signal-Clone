"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { apiFetch } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut, MeOut } from "@/lib/api/types";
import { applyChatColor, applyTheme } from "@/lib/theme";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";
import { CallsList, CallsTab, StoriesList, StoriesTab } from "../placeholders/ComingSoon";
import { EmptyConversation } from "./EmptyConversation";
import { MobileTabBar } from "./MobileTabBar";
import { NavRail } from "./NavRail";
import { ResizableListPane } from "./ResizableListPane";
import { useSelectionSync } from "./useSelectionSync";
import { useShortcuts } from "./useShortcuts";
import { useNotifications } from "@/lib/useNotifications";

export interface ShellSlots {
  chatList: ReactNode;
  conversation: ReactNode;
  settingsList: ReactNode;
  settingsDetail: ReactNode;
  overlays?: ReactNode;
}

export function useUnreadTotal(): number {
  const token = useAuth((s) => s.token);
  const { data } = useQuery({
    queryKey: qk.conversations,
    queryFn: () => apiFetch<ConversationOut[]>("/api/conversations"),
    enabled: !!token,
  });
  const now = Date.now();
  return (data ?? [])
    .filter((c) => !c.me.is_archived && !(c.me.muted_until && Date.parse(c.me.muted_until) > now))
    .reduce((sum, c) => sum + c.unread_count, 0);
}

/** Signal Desktop three-region layout on wide screens; Signal Android's stacked screens on phones. */
export function AppShell(slots: ShellSlots) {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const setMe = useAuth((s) => s.setMe);
  const { tab, selectedId } = useUi();
  const breakpoint = useBreakpoint();
  const unread = useUnreadTotal();
  useSelectionSync();
  useNotifications(unread);
  const shortcutsGuide = useShortcuts();

  const { data: me } = useQuery({
    queryKey: qk.me,
    queryFn: () => apiFetch<MeOut>("/api/me"),
    enabled: !!token,
  });

  useEffect(() => {
    if (!token) router.replace("/onboarding/");
  }, [token, router]);

  useEffect(() => {
    if (!me) return;
    setMe(me);
    applyTheme(me.settings.theme);
    applyChatColor(me.settings.chat_color);
    import("@/lib/theme").then((m) => m.applyWallpaper(me.settings.chat_wallpaper));
    if (!me.display_name) router.replace("/onboarding/?step=profile");
  }, [me, setMe, router]);

  if (!token) return null;

  const list =
    tab === "calls" ? <CallsList /> : tab === "stories" ? <StoriesList /> : tab === "settings" ? slots.settingsList : slots.chatList;
  const detail =
    tab === "calls" ? (
      <CallsTab />
    ) : tab === "stories" ? (
      <StoriesTab />
    ) : tab === "settings" ? (
      slots.settingsDetail
    ) : selectedId !== null ? (
      slots.conversation
    ) : (
      <EmptyConversation />
    );

  if (breakpoint === "mobile") {
    const showDetail = (tab === "chats" && selectedId !== null) || tab === "settings";
    return (
      <div className="flex h-dvh flex-col bg-bg">
        <div className="relative min-h-0 flex-1">{showDetail ? (tab === "settings" ? slots.settingsList : detail) : list}</div>
        {!showDetail && <MobileTabBar unread={unread} />}
        {me?.username === null && (
          <div className="absolute bottom-20 left-4 right-4 rounded-xl bg-surface-2 p-4 shadow-lg flex items-center justify-between border border-divider">
            <p className="text-[14px] text-fg">You haven't set a username yet.</p>
            <button onClick={() => { useUi.getState().setTab("settings"); useUi.getState().setPanel("profile"); }} className="rounded-full bg-primary px-4 py-2 text-[14px] font-semibold text-white hover:bg-primary-hover">
              Set now
            </button>
          </div>
        )}
        {slots.overlays}
        {shortcutsGuide}
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-bg">
      <NavRail unread={unread} />
      <ResizableListPane resizable={breakpoint === "desktop"}>{list}</ResizableListPane>
      <main className="relative min-w-0 flex-1 border-l border-divider">{detail}</main>
      {me?.username === null && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-surface-2 p-4 shadow-lg flex items-center gap-4 border border-divider">
          <p className="text-[14px] text-fg">You haven't set a username yet.</p>
          <button onClick={() => { useUi.getState().setTab("settings"); useUi.getState().setPanel("profile"); }} className="rounded-full bg-primary px-4 py-2 text-[14px] font-semibold text-white hover:bg-primary-hover">
            Set now
          </button>
        </div>
      )}
      {slots.overlays}
      {shortcutsGuide}
    </div>
  );
}
