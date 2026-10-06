"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Camera,
  LogOut,
  Pencil,
  Pin,
  ShieldCheck,
  Timer,
  UserPlus,
} from "lucide-react";
import { type ReactNode, type MouseEvent, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { IconButton, Switch } from "@/components/ui/controls";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { ApiError, apiFetch } from "@/lib/api/client";
import { openDirect, patchMyState, upsertConversation, useContacts } from "@/lib/api/hooks";
import { qk } from "@/lib/api/queryKeys";
import type { ConversationOut, MemberOut } from "@/lib/api/types";
import { isMuted, otherMember, timerLabel } from "@/lib/conversations";
import { canEditGroupInfo, canManageMembers, canRemove, isActive } from "@/lib/permissions";
import { formatPhone } from "@/features/onboarding/DemoAccounts";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";
import { SafetyNumberModal } from "../contacts/SafetyNumberModal";
import { AddMembersModal } from "./AddMembersModal";
import { canSetTimer, timerMenuItems } from "../conversation/DisappearingMenu";

export interface SettingsPanelSlots {
  disappearingRow?: ReactNode;
  safetyRow?: ReactNode;
  extraRows?: ReactNode;
}

const MUTE_OPTIONS: { label: string; ms: number | null }[] = [
  { label: "Mute for 1 hour", ms: 3600_000 },
  { label: "Mute for 8 hours", ms: 8 * 3600_000 },
  { label: "Mute for 1 day", ms: 86_400_000 },
  { label: "Mute for 1 week", ms: 7 * 86_400_000 },
  { label: "Mute always", ms: 100 * 365 * 86_400_000 },
];

export function Row({
  icon,
  label,
  detail,
  onClick,
  danger,
  right,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  const body = (
    <>
      <span className={`flex w-6 justify-center ${danger ? "" : "text-fg-2"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px]">{label}</span>
        {detail && <span className="block text-[12px] text-fg-2">{detail}</span>}
      </span>
      {right}
    </>
  );
  const cls = `flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-left ${danger ? "text-danger" : ""}`;
  // Rows that carry their own control (a Switch) must not be buttons themselves.
  if (right) return <div className={cls}>{body}</div>;
  return (
    <button onClick={onClick} className={`${cls} hover:bg-hover`}>
      {body}
    </button>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="border-t border-divider px-3 py-2">
      {title && <h3 className="px-3 pt-2 pb-1 text-[13px] font-semibold text-fg-2">{title}</h3>}
      {children}
    </section>
  );
}

function EditGroupModal({ conversation, onClose }: { conversation: ConversationOut; onClose: () => void }) {
  const [title, setTitle] = useState(conversation.title);
  const [description, setDescription] = useState(conversation.description ?? "");
  const save = async () => {
    try {
      upsertConversation(
        await apiFetch<ConversationOut>(`/api/conversations/${conversation.id}`, {
          method: "PATCH",
          json: { title: title.trim(), description: description.trim() || null },
        }),
      );
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save");
    }
  };
  return (
    <Modal
      title="Edit group"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" disabled={!title.trim()} onClick={save}>
            Save
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 pt-1">
        <input aria-label="Group name" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className="h-11 rounded-xl border border-divider bg-surface px-3 outline-none focus:border-primary" />
        <textarea aria-label="Description" placeholder="Group description" value={description} maxLength={480} onChange={(e) => setDescription(e.target.value)} rows={3} className="resize-none rounded-xl border border-divider bg-surface px-3 py-2 outline-none focus:border-primary" />
      </div>
    </Modal>
  );
}

/** Slides over the conversation (Signal Desktop's "Chat settings"). */
export function ConversationSettingsPanel({
  conversation: c,
  meId,
  slots = {},
}: {
  conversation: ConversationOut;
  meId: number;
  slots?: SettingsPanelSlots;
}) {
  const { closePanel, select } = useUi();
  const qc = useQueryClient();
  const { data: contacts = [] } = useContacts();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [modal, setModal] = useState<null | "add" | "edit" | "leave" | "block" | "safety">(null);
  const other = otherMember(c, meId);
  const muted = isMuted(c);
  const active = c.members.filter((m) => m.left_at === null);
  const admin = canManageMembers(c);

  const call = async (fn: () => Promise<ConversationOut | void>, done?: string) => {
    try {
      const result = await fn();
      if (result) upsertConversation(result);
      if (done) toast(done);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong");
    }
  };

  const memberMenu = (e: MouseEvent, m: MemberOut) => {
    if (m.user.id === meId) return;
    const items: MenuItem[] = [
      { label: `Message ${m.user.display_name.split(" ")[0]}`, onSelect: async () => select((await openDirect(m.user.id)).id) },
    ];
    if (admin) {
      items.push(
        m.role === "admin"
          ? {
              label: "Remove as admin",
              onSelect: () =>
                call(() => apiFetch(`/api/conversations/${c.id}/members/${m.user.id}`, { method: "PATCH", json: { role: "member" } })),
            }
          : {
              label: "Make admin",
              onSelect: () =>
                call(() => apiFetch(`/api/conversations/${c.id}/members/${m.user.id}`, { method: "PATCH", json: { role: "admin" } })),
            },
      );
    }
    if (canRemove(c, m.user.id, meId)) {
      items.push({
        label: "Remove from group",
        danger: true,
        onSelect: () =>
          call(() => apiFetch(`/api/conversations/${c.id}/members/${m.user.id}`, { method: "DELETE" }), `${m.user.display_name} removed`),
      });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const uploadPhoto = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    void call(() => apiFetch(`/api/conversations/${c.id}/avatar`, { method: "POST", body: form }));
  };

  return (
    <aside className="absolute inset-0 z-20 flex flex-col bg-bg [animation:slide-in-right_160ms_ease-out]" aria-label="Chat settings">
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-divider px-2">
        <IconButton label="Back" onClick={closePanel}>
          <ArrowLeft size={20} />
        </IconButton>
        <h2 className="text-[15px] font-semibold">{c.kind === "group" ? "Group settings" : "Chat settings"}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl pb-10">
          <div className="flex flex-col items-center gap-1 px-6 pt-8 pb-5 text-center">
            <span className="relative">
              <Avatar name={c.title} color={c.avatar_color} url={c.avatar_url} size="xl" />
              {canEditGroupInfo(c) && (
                <label className="absolute right-0 bottom-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-surface-2 shadow" aria-label="Change group photo">
                  <Camera size={14} />
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
                </label>
              )}
            </span>
            <h3 className="mt-2 flex items-center gap-1.5 text-[20px] font-semibold">
              {c.title}
              {canEditGroupInfo(c) && (
                <IconButton label="Edit group" size={28} onClick={() => setModal("edit")}>
                  <Pencil size={14} />
                </IconButton>
              )}
            </h3>
            {c.kind === "group" ? (
              <p className="text-[13px] text-fg-2">
                Group · {active.length} member{active.length === 1 ? "" : "s"}
              </p>
            ) : (
              other && <p className="text-[13px] text-fg-2">{[other.username, formatPhone(other.phone)].filter(Boolean).join(" · ")}</p>
            )}
            {(c.description || other?.about) && <p className="mt-2 max-w-sm text-[13px] text-fg">{c.description ?? other?.about}</p>}
          </div>

          <Section>
            {slots.disappearingRow ?? (
              <Row
                icon={<Timer size={18} />}
                label="Disappearing messages"
                detail={timerLabel(c.disappearing_seconds)}
                onClick={(e) =>
                  canSetTimer(c)
                    ? setMenu({ x: e.clientX, y: e.clientY, items: timerMenuItems(c) })
                    : toast("Only admins can change the timer")
                }
              />
            )}
            <Row
              icon={muted ? <BellOff size={18} /> : <Bell size={18} />}
              label={muted ? "Unmute" : "Mute notifications"}
              detail={muted && c.me.muted_until ? `Muted until ${new Date(c.me.muted_until).toLocaleString()}` : undefined}
              onClick={(e) =>
                muted
                  ? void patchMyState(c.id, { muted_until: null })
                  : setMenu({
                      x: e.clientX,
                      y: e.clientY,
                      items: MUTE_OPTIONS.map((o) => ({
                        label: o.label,
                        onSelect: () => patchMyState(c.id, { muted_until: new Date(Date.now() + o.ms!).toISOString() }),
                      })),
                    })
              }
            />
            <Row icon={<Pin size={18} />} label="Pin chat" right={<Switch label="Pin chat" checked={c.me.is_pinned} onChange={(v) => patchMyState(c.id, { is_pinned: v })} />} />
            <Row icon={<Archive size={18} />} label="Archive chat" right={<Switch label="Archive chat" checked={c.me.is_archived} onChange={(v) => patchMyState(c.id, { is_archived: v })} />} />
            {slots.safetyRow ??
              (other && <Row icon={<ShieldCheck size={18} />} label="View safety number" onClick={() => setModal("safety")} />)}
            {slots.extraRows}
          </Section>

          {c.kind === "group" && (
            <Section title={`${active.length} member${active.length === 1 ? "" : "s"}`}>
              {admin && <Row icon={<UserPlus size={18} />} label="Add members" onClick={() => setModal("add")} />}
              {active.map((m) => (
                <button
                  key={m.user.id}
                  onClick={(e) => memberMenu(e, m)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    memberMenu(e, m);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover"
                >
                  <Avatar name={m.user.display_name} color={m.user.avatar_color} url={m.user.avatar_url} size="md" online={m.user.online} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{m.user.id === meId ? "You" : m.user.display_name}</span>
                    {m.user.about && <span className="block truncate text-[12px] text-fg-2">{m.user.about}</span>}
                  </span>
                  {m.role === "admin" && <span className="text-[12px] text-fg-2">Admin</span>}
                </button>
              ))}
            </Section>
          )}

          <Section>
            {other && !contacts.some((u) => u.id === other.id) && (
              <Row
                icon={<UserPlus size={18} />}
                label="Add to contacts"
                onClick={() =>
                  call(async () => {
                    await apiFetch("/api/contacts", { method: "POST", json: { phone: other.phone } });
                    qc.invalidateQueries({ queryKey: qk.contacts });
                  }, `${other.display_name} added to contacts`)
                }
              />
            )}
            {other && <Row icon={<Ban size={18} />} label={`Block ${other.display_name.split(" ")[0]}`} danger onClick={() => setModal("block")} />}
            {c.kind === "group" && isActive(c) && <Row icon={<LogOut size={18} />} label="Leave group" danger onClick={() => setModal("leave")} />}
          </Section>
        </div>
      </div>

      {menu && <ContextMenu items={menu.items} anchor={{ x: menu.x, y: menu.y }} onClose={() => setMenu(null)} />}
      {modal === "add" && <AddMembersModal conversation={c} onClose={() => setModal(null)} />}
      {modal === "edit" && <EditGroupModal conversation={c} onClose={() => setModal(null)} />}
      {modal === "leave" && (
        <Modal
          title="Leave group?"
          onClose={() => setModal(null)}
          footer={
            <>
              <ModalButton onClick={() => setModal(null)}>Cancel</ModalButton>
              <ModalButton
                variant="danger"
                onClick={() => {
                  setModal(null);
                  void call(() => apiFetch(`/api/conversations/${c.id}/members/${meId}`, { method: "DELETE" }), "You left the group");
                }}
              >
                Leave
              </ModalButton>
            </>
          }
        >
          <p className="text-[14px] text-fg-2">You will no longer be able to send or receive messages in this group.</p>
        </Modal>
      )}
      {modal === "safety" && other && (
        <SafetyNumberModal userId={other.id} name={other.display_name} onClose={() => setModal(null)} />
      )}
      {modal === "block" && other && (
        <Modal
          title={`Block ${other.display_name}?`}
          onClose={() => setModal(null)}
          footer={
            <>
              <ModalButton onClick={() => setModal(null)}>Cancel</ModalButton>
              <ModalButton
                variant="danger"
                onClick={() => {
                  setModal(null);
                  void call(async () => {
                    await apiFetch(`/api/blocks/${other.id}`, { method: "POST" });
                    qc.invalidateQueries({ queryKey: qk.blocks });
                  }, `${other.display_name} blocked`);
                }}
              >
                Block
              </ModalButton>
            </>
          }
        >
          <p className="text-[14px] text-fg-2">Blocked people won't be able to call you or send you messages.</p>
        </Modal>
      )}
    </aside>
  );
}
