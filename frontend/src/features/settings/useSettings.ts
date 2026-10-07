"use client";

import { apiFetch } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { MeOut, SettingsOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { applyChatColor, applyTheme, applyWallpaper, applyTypography } from "@/lib/theme";
import { useAuth } from "@/stores/auth";
import { toast } from "@/stores/toast";

function storeMe(me: MeOut) {
  useAuth.getState().setMe(me);
  queryClient.setQueryData(qk.me, me);
}

/** Optimistically applies a settings change, then persists it. */
export async function updateSettings(changes: Partial<SettingsOut>): Promise<void> {
  const me = useAuth.getState().me;
  if (!me) return;
  const optimistic = { ...me, settings: { ...me.settings, ...changes } };
  storeMe(optimistic);
  if (changes.theme) applyTheme(changes.theme);
  if (changes.chat_color) applyChatColor(changes.chat_color);
  if (changes.chat_wallpaper) applyWallpaper(changes.chat_wallpaper);
  if (changes.chat_font_family !== undefined || changes.chat_font_size !== undefined) {
    applyTypography(optimistic.settings.chat_font_family, optimistic.settings.chat_font_size);
  }
  try {
    const settings = await apiFetch<SettingsOut>("/api/me/settings", { method: "PATCH", json: changes });
    storeMe({ ...optimistic, settings });
  } catch {
    storeMe(me);
    applyTheme(me.settings.theme);
    applyChatColor(me.settings.chat_color);
    applyWallpaper(me.settings.chat_wallpaper);
    applyTypography(me.settings.chat_font_family, me.settings.chat_font_size);
    toast("Couldn't save your settings");
  }
}

export async function updateProfile(changes: { display_name?: string; about?: string | null; username?: string | null; pin?: string | null }) {
  storeMe(await apiFetch<MeOut>("/api/me", { method: "PATCH", json: changes }));
}

export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("file", file);
  storeMe(await apiFetch<MeOut>("/api/me/avatar", { method: "POST", body: form }));
}

export async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } finally {
    useAuth.getState().signOut();
  }
}
