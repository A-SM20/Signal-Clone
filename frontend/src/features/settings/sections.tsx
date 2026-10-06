"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Keyboard, Laptop, LogOut, Monitor, Smartphone } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Switch } from "@/components/ui/controls";
import { ApiError, apiFetch } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import type { DeviceOut, MeOut, UserOut } from "@/lib/api/types";
import { timerLabel } from "@/lib/conversations";
import { CHAT_COLORS } from "@/lib/theme";
import { formatListTime } from "@/lib/time";
import { formatPhone } from "@/features/onboarding/DemoAccounts";
import { toast } from "@/stores/toast";
import { logout, updateProfile, updateSettings, uploadAvatar } from "./useSettings";

export function Group({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <section className="mb-6">
      {title && <h3 className="mb-2 px-1 text-[13px] font-semibold text-fg-2">{title}</h3>}
      <div className="divide-y divide-[var(--divider)] overflow-hidden rounded-xl bg-surface">{children}</div>
      {footer && <p className="mt-2 px-1 text-[12px] text-fg-2">{footer}</p>}
    </section>
  );
}

export function SettingRow({ label, detail, control, onClick }: { label: string; detail?: string; control?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px]">{label}</span>
        {detail && <span className="block text-[12px] text-fg-2">{detail}</span>}
      </span>
      {control}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-hover">
      {inner}
    </button>
  ) : (
    <div className="flex items-center gap-4 px-4 py-3">{inner}</div>
  );
}

function Choice<T extends string | number>({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className="flex w-full items-center justify-between border-t border-divider px-4 py-3 text-left text-[14px] first:border-t-0 hover:bg-hover"
        >
          {o.label}
          {o.value === value && <Check size={18} className="text-primary" />}
        </button>
      ))}
    </div>
  );
}

export function ProfileSection({ me }: { me: MeOut }) {
  const [name, setName] = useState(me.display_name);
  const [about, setAbout] = useState(me.about ?? "");
  const [username, setUsername] = useState(me.username ?? "");
  const dirty = name !== me.display_name || about !== (me.about ?? "") || username !== (me.username ?? "");
  const save = async () => {
    try {
      await updateProfile({ display_name: name.trim(), about: about.trim() || null, username: username.trim() || null });
      toast("Profile saved");
    } catch (e) {
      toast(e instanceof ApiError ? (e.code === "validation_error" ? "Usernames look like name.42" : e.message) : "Couldn't save");
    }
  };
  const field = "h-10 w-full rounded-lg border border-divider bg-bg px-3 text-[14px] outline-none focus:border-primary";
  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-2">
        <label className="relative cursor-pointer" aria-label="Change profile photo">
          <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size="xl" />
          <span className="absolute right-0 bottom-0 flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 shadow">
            <Camera size={14} />
          </span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0]).catch(() => toast("Couldn't upload photo"))}
          />
        </label>
      </div>
      <Group title="Name">
        <div className="p-3">
          <input aria-label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
      </Group>
      <Group title="About">
        <div className="p-3">
          <input aria-label="About" placeholder="Write a few words about yourself" value={about} maxLength={140} onChange={(e) => setAbout(e.target.value)} className={field} />
        </div>
      </Group>
      <Group title="Username" footer="People can message you with your username without seeing your phone number. Format: name.42">
        <div className="p-3">
          <input aria-label="Username" placeholder="name.42" value={username} maxLength={40} onChange={(e) => setUsername(e.target.value.toLowerCase())} className={field} />
        </div>
      </Group>
      <button
        disabled={!dirty || !name.trim()}
        onClick={save}
        className="h-10 rounded-full bg-primary px-6 text-[14px] font-semibold text-white disabled:opacity-40"
      >
        Save
      </button>
    </>
  );
}

export function AccountSection({ me }: { me: MeOut }) {
  return (
    <>
      <Group title="Account">
        <SettingRow label="Phone number" detail={formatPhone(me.phone)} />
        <SettingRow label="Username" detail={me.username ?? "Not set"} />
      </Group>
      <Group>
        <SettingRow label="Log out" control={<LogOut size={18} className="text-fg-2" />} onClick={logout} />
        <SettingRow label="Delete account" detail="Coming soon" onClick={() => toast("Account deletion is coming soon")} />
      </Group>
    </>
  );
}

function deviceIcon(name: string) {
  return /Android|iOS/.test(name) ? <Smartphone size={20} /> : /Windows|macOS|Linux/.test(name) ? <Laptop size={20} /> : <Monitor size={20} />;
}

export function LinkedDevicesSection({ linkAction }: { linkAction?: ReactNode }) {
  const qc = useQueryClient();
  const { data: devices = [] } = useQuery({ queryKey: qk.devices, queryFn: () => apiFetch<DeviceOut[]>("/api/devices") });
  const unlink = async (d: DeviceOut) => {
    try {
      await apiFetch(`/api/devices/${d.id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: qk.devices });
      toast(`${d.name} unlinked`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't unlink device");
    }
  };
  return (
    <>
      {linkAction}
      <Group title="Devices" footer="Each sign-in is a separate device. Unlinking signs it out immediately.">
        {devices.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-fg-2">{deviceIcon(d.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">
                {d.name}
                {d.is_current && <span className="ml-2 text-[12px] text-primary">This device</span>}
              </span>
              <span className="block text-[12px] text-fg-2">
                Linked {new Date(d.created_at).toLocaleDateString()} · Active {formatListTime(d.last_active_at)}
              </span>
            </span>
            {!d.is_current && (
              <button onClick={() => unlink(d)} className="text-[13px] font-medium text-danger hover:underline">
                Unlink
              </button>
            )}
          </div>
        ))}
      </Group>
    </>
  );
}

export function AppearanceSection({ me }: { me: MeOut }) {
  return (
    <>
      <Group title="Theme">
        <Choice
          name="Theme"
          value={me.settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Group>
      <Group title="Chat color" footer="Changes the color of your outgoing messages.">
        <div className="grid grid-cols-7 gap-3 p-4">
          {Object.entries(CHAT_COLORS).map(([name, hex]) => (
            <button
              key={name}
              aria-label={name}
              title={name[0].toUpperCase() + name.slice(1)}
              onClick={() => updateSettings({ chat_color: name })}
              className={`flex aspect-square items-center justify-center rounded-full ${me.settings.chat_color === name ? "ring-2 ring-offset-2 ring-[var(--text)] ring-offset-[var(--surface)]" : ""}`}
              style={{ backgroundColor: hex }}
            >
              {me.settings.chat_color === name && <Check size={16} className="text-white" />}
            </button>
          ))}
        </div>
      </Group>
    </>
  );
}

export function NotificationsSection({ me }: { me: MeOut }) {
  const [permission, setPermission] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const enable = async (on: boolean) => {
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
      setPermission(await Notification.requestPermission());
    }
    await updateSettings({ notifications_enabled: on });
  };
  return (
    <>
      <Group
        title="Messages"
        footer={permission === "denied" ? "Notifications are blocked in your browser settings." : undefined}
      >
        <SettingRow
          label="Show notifications"
          detail="When this tab is in the background"
          control={<Switch label="Show notifications" checked={me.settings.notifications_enabled} onChange={enable} />}
        />
      </Group>
      <Group title="Notification content">
        <Choice
          name="Notification content"
          value={me.settings.notification_preview}
          onChange={(notification_preview) => updateSettings({ notification_preview })}
          options={[
            { value: "name_and_message", label: "Name and message" },
            { value: "name_only", label: "Name only" },
            { value: "none", label: "No name or message" },
          ]}
        />
      </Group>
    </>
  );
}

export function PrivacySection({ me, disappearingNote }: { me: MeOut; disappearingNote?: string }) {
  const qc = useQueryClient();
  const { data: blocked = [] } = useQuery({ queryKey: qk.blocks, queryFn: () => apiFetch<UserOut[]>("/api/blocks") });
  const s = me.settings;
  const unblock = async (u: UserOut) => {
    await apiFetch(`/api/blocks/${u.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: qk.blocks });
    toast(`${u.display_name} unblocked`);
  };
  return (
    <>
      <Group title="Messaging">
        <SettingRow
          label="Read receipts"
          detail="If off, you won't see read receipts from others either."
          control={<Switch label="Read receipts" checked={s.read_receipts} onChange={(v) => updateSettings({ read_receipts: v })} />}
        />
        <SettingRow
          label="Typing indicators"
          detail="If off, you won't see typing indicators from others either."
          control={<Switch label="Typing indicators" checked={s.typing_indicators} onChange={(v) => updateSettings({ typing_indicators: v })} />}
        />
        <SettingRow
          label="Show online status"
          detail="Let contacts see when you're online or last active."
          control={<Switch label="Show online status" checked={s.share_last_seen} onChange={(v) => updateSettings({ share_last_seen: v })} />}
        />
      </Group>
      <Group title="Default timer for new chats" footer={disappearingNote}>
        <Choice
          name="Default disappearing timer"
          value={s.default_disappearing_seconds}
          onChange={(v) => updateSettings({ default_disappearing_seconds: v })}
          options={[0, 30, 300, 3600, 28800, 86400, 604800, 2419200].map((v) => ({ value: v, label: timerLabel(v) }))}
        />
      </Group>
      <Group title="Blocked">
        {blocked.length ? (
          blocked.map((u) => (
            <SettingRow
              key={u.id}
              label={u.display_name}
              detail={formatPhone(u.phone)}
              control={
                <button onClick={() => unblock(u)} className="text-[13px] font-medium text-primary hover:underline">
                  Unblock
                </button>
              }
            />
          ))
        ) : (
          <SettingRow label="No blocked users" />
        )}
      </Group>
    </>
  );
}

export function HelpSection() {
  return (
    <>
      <Group title="About">
        <SettingRow label="Signal clone" detail="A Signal-style messenger built with Next.js, FastAPI, SQLite and WebSockets." />
        <SettingRow label="Encryption" detail="End-to-end encryption is simulated in this demo; safety numbers use mock identity keys." />
      </Group>
      <Group>
        <SettingRow
          label="Keyboard shortcuts"
          control={<Keyboard size={18} className="text-fg-2" />}
          onClick={() => window.dispatchEvent(new Event("signal:shortcuts"))}
        />
      </Group>
    </>
  );
}
