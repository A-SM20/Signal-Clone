"use client";

import {
  ArrowLeft,
  Bell,
  ChevronRight,
  CircleHelp,
  Database,
  Laptop,
  Lock,
  MessageSquare,
  Palette,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/controls";
import { formatPhone } from "@/features/onboarding/DemoAccounts";
import { ComingSoon } from "@/features/placeholders/ComingSoon";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { useAuth } from "@/stores/auth";
import { type SettingsSection, useUi } from "@/stores/ui";
import {
  AccountSection,
  AppearanceSection,
  HelpSection,
  LinkedDevicesSection,
  NotificationsSection,
  PrivacySection,
  ProfileSection,
} from "./sections";
import { FolderEditor } from "./FolderEditor";

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: "account", label: "Account", icon: <User size={18} /> },
  { id: "devices", label: "Linked devices", icon: <Laptop size={18} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={18} /> },
  { id: "chats", label: "Chats", icon: <MessageSquare size={18} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={18} /> },
  { id: "privacy", label: "Privacy", icon: <Lock size={18} /> },
  { id: "data", label: "Data usage", icon: <Database size={18} /> },
  { id: "help", label: "Help", icon: <CircleHelp size={18} /> },
];

const TITLES: Record<SettingsSection, string> = {
  profile: "Profile",
  account: "Account",
  devices: "Linked devices",
  appearance: "Appearance",
  chats: "Chats",
  notifications: "Notifications",
  privacy: "Privacy",
  data: "Data usage",
  help: "Help",
};

export interface SettingsExtras {
  chats?: ReactNode;
  linkAction?: ReactNode;
}

export function SettingsDetail({ extras = {} }: { extras?: SettingsExtras }) {
  const { settingsSection, openSettings } = useUi();
  const me = useAuth((s) => s.me);
  const mobile = useBreakpoint() === "mobile";
  if (!me) return null;
  const section = settingsSection ?? "profile";
  const body = {
    profile: <ProfileSection me={me} />,
    account: <AccountSection me={me} />,
    devices: <LinkedDevicesSection linkAction={extras.linkAction} />,
    appearance: <AppearanceSection me={me} />,
    chats: extras.chats ?? <FolderEditor />,
    notifications: <NotificationsSection me={me} />,
    privacy: <PrivacySection me={me} />,
    data: <ComingSoon icon={<Database size={28} />} title="Data usage" body="Control media auto-download and storage." />,
    help: <HelpSection />,
  }[section];
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-divider px-2">
        {mobile && (
          <IconButton label="Back" onClick={() => openSettings(null)}>
            <ArrowLeft size={20} />
          </IconButton>
        )}
        <h2 className="px-2 text-[17px] font-semibold">{TITLES[section]}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-5 py-6">{body}</div>
      </div>
    </div>
  );
}

/** Left column on desktop; on phones it is the screen and opens sections full-screen. */
export function SettingsList({ extras }: { extras?: SettingsExtras }) {
  const { settingsSection, openSettings, setTab } = useUi();
  const me = useAuth((s) => s.me);
  const mobile = useBreakpoint() === "mobile";
  if (mobile && settingsSection) return <SettingsDetail extras={extras} />;
  if (!me) return null;
  const active = settingsSection ?? (mobile ? null : "profile");
  const item = (id: SettingsSection, label: string, icon: ReactNode) => (
    <button
      key={id}
      onClick={() => openSettings(id)}
      aria-current={active === id ? "page" : undefined}
      className={`mx-2 flex w-[calc(100%-16px)] items-center gap-4 rounded-xl px-3 py-2.5 text-left text-[14px] ${
        active === id ? "bg-[var(--selected)]" : "hover:bg-hover"
      }`}
    >
      <span className="text-fg-2">{icon}</span>
      <span className="flex-1">{label}</span>
      {mobile && <ChevronRight size={16} className="text-fg-3" />}
    </button>
  );
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-1 px-4">
        {mobile && (
          <IconButton label="Back" onClick={() => setTab("chats")} className="-ml-2">
            <ArrowLeft size={20} />
          </IconButton>
        )}
        <h1 className="text-[20px] font-bold">Settings</h1>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <button
          onClick={() => openSettings("profile")}
          className={`mx-2 mb-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-xl px-3 py-3 text-left ${
            active === "profile" ? "bg-[var(--selected)]" : "hover:bg-hover"
          }`}
        >
          <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size="lg" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{me.display_name}</span>
            <span className="block truncate text-[12px] text-fg-2">{me.username ?? formatPhone(me.phone)}</span>
          </span>
        </button>
        {SECTIONS.map((s) => item(s.id, s.label, s.icon))}
      </div>
    </div>
  );
}
