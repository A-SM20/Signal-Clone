"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Switch } from "@/components/ui/controls";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api/client";
import { useConversations } from "@/lib/api/hooks";
import {
  createFolder,
  deleteFolder,
  type FolderInput,
  type FolderOut,
  PRESETS,
  reorderFolders,
  updateFolder,
  useFolders,
} from "@/lib/folders";
import { toast } from "@/stores/toast";
import { Group, SettingRow } from "./sections";

const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong");

function describe(f: FolderInput): string {
  const parts = [f.include_direct && "1:1 chats", f.include_groups && "Groups"].filter(Boolean) as string[];
  if (f.conversation_ids.length) parts.push(`${f.conversation_ids.length} chat${f.conversation_ids.length === 1 ? "" : "s"}`);
  if (f.unread_only) parts.push("unread only");
  return parts.join(" · ") || "No chats yet";
}

/** Settings → Chats → Chat folders: reorder by dragging, edit, delete, add suggested or custom folders. */
export function FolderEditor() {
  const { data: folders = [] } = useFolders();
  const [editing, setEditing] = useState<FolderOut | "new" | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const sorted = [...folders].sort((a, b) => a.position - b.position);
  const suggestions = PRESETS.filter((p) => !folders.some((f) => f.name.toLowerCase() === p.name.toLowerCase()));

  const drop = (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    const ids = sorted.map((f) => f.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    setDragId(null);
    void reorderFolders(ids).catch(fail);
  };

  return (
    <>
      <Group title="Chat folders" footer="Folders appear as tabs above your chat list. Drag to reorder.">
        {sorted.length === 0 && <p className="px-4 py-3 text-[13px] text-fg-2">You haven't created any folders yet.</p>}
        <ul>
          {sorted.map((f) => (
            <li
              key={f.id}
              draggable
              onDragStart={() => setDragId(f.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(f.id)}
              className={`flex items-center gap-1 pr-2 ${dragId === f.id ? "opacity-50" : ""}`}
            >
              <span className="cursor-grab pl-3 text-fg-3" aria-hidden>
                <GripVertical size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <SettingRow label={f.name} detail={describe(f)} onClick={() => setEditing(f)} />
              </div>
              <button
                aria-label={`Delete ${f.name}`}
                onClick={() => void deleteFolder(f.id).then(() => toast(`${f.name} deleted`)).catch(fail)}
                className="rounded-full p-2 text-fg-2 hover:bg-hover hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        <SettingRow label="Create a folder" control={<Plus size={18} className="text-fg-2" />} onClick={() => setEditing("new")} />
      </Group>
      {suggestions.length > 0 && (
        <Group title="Suggested folders">
          {suggestions.map((p) => (
            <SettingRow
              key={p.name}
              label={p.name}
              detail={describe(p)}
              control={<span className="rounded-full bg-surface-2 px-3 py-1 text-[13px] font-semibold">Add</span>}
              onClick={() => void createFolder(p).then(() => toast(`${p.name} added`)).catch(fail)}
            />
          ))}
        </Group>
      )}
      {editing && <FolderModal folder={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function FolderModal({ folder, onClose }: { folder: FolderOut | null; onClose: () => void }) {
  const { data: conversations = [] } = useConversations();
  const [draft, setDraft] = useState<FolderInput>(
    folder ?? { name: "", include_direct: false, include_groups: false, unread_only: false, conversation_ids: [] },
  );
  const set = (changes: Partial<FolderInput>) => setDraft((d) => ({ ...d, ...changes }));
  const chats = conversations.filter((c) => c.me.request_state !== "pending");
  const toggleChat = (id: number) =>
    set({
      conversation_ids: draft.conversation_ids.includes(id)
        ? draft.conversation_ids.filter((x) => x !== id)
        : [...draft.conversation_ids, id],
    });

  const save = () => {
    const input = { ...draft, name: draft.name.trim() };
    (folder ? updateFolder(folder.id, input) : createFolder(input)).then(onClose).catch(fail);
  };

  return (
    <Modal
      title={folder ? "Edit folder" : "Create a folder"}
      onClose={onClose}
      width={440}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={save} disabled={!draft.name.trim()}>
            Save
          </ModalButton>
        </>
      }
    >
      <label className="mb-1 block text-[13px] font-semibold text-fg-2" htmlFor="folder-name">
        Folder name
      </label>
      <input
        id="folder-name"
        maxLength={32}
        value={draft.name}
        onChange={(e) => set({ name: e.target.value })}
        placeholder="Folder name"
        className="w-full rounded-lg bg-surface-2 px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-primary"
      />
      <p className="mt-4 mb-1 text-[13px] font-semibold text-fg-2">Included chats</p>
      {(
        [
          ["include_direct", "All 1:1 chats"],
          ["include_groups", "All groups"],
          ["unread_only", "Only unread chats"],
        ] as const
      ).map(([key, label]) => (
        <div key={key} className="flex items-center justify-between py-2 text-[14px]">
          {label}
          <Switch label={label} checked={draft[key]} onChange={(v) => set({ [key]: v })} />
        </div>
      ))}
      <p className="mt-3 mb-1 text-[13px] font-semibold text-fg-2">Specific chats</p>
      <ul className="max-h-56 overflow-y-auto">
        {chats.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-hover">
              <input
                type="checkbox"
                checked={draft.conversation_ids.includes(c.id)}
                onChange={() => toggleChat(c.id)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <Avatar name={c.title} color={c.avatar_color} url={c.avatar_url} size="sm" />
              <span className="truncate text-[14px]">{c.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
