"use client";

import { ArrowLeft, AtSign, Hash, UserPlus, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton, SearchInput } from "@/components/ui/controls";
import { openDirect, useContacts } from "@/lib/api/hooks";
import { useUi } from "@/stores/ui";
import { FindUserModal } from "./FindUserModal";

function ActionRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-fg">{icon}</span>
      <span className="text-[14px] font-medium">{label}</span>
    </button>
  );
}

/** Signal Desktop's "New chat" pane: actions on top, then contacts. */
export function NewChatPanel() {
  const { select, closePanel, openPanel } = useUi();
  const { data: contacts } = useContacts();
  const [filter, setFilter] = useState("");
  const [modal, setModal] = useState<null | "phone" | "username" | "add-contact">(null);
  const q = filter.trim().toLowerCase();
  const shown = (contacts ?? []).filter(
    (u) => !q || u.display_name.toLowerCase().includes(q) || u.phone.includes(q) || u.username?.includes(q),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[var(--header-height)] items-center gap-2 px-2">
        <IconButton label="Back" onClick={closePanel}>
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="text-[17px] font-semibold">New chat</h1>
      </div>
      <div className="px-4 pb-2">
        <SearchInput value={filter} onChange={setFilter} placeholder="Name, username or number" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <ActionRow icon={<Users size={18} />} label="New group" onClick={() => openPanel("new-group")} />
        <ActionRow icon={<AtSign size={18} />} label="Find by username" onClick={() => setModal("username")} />
        <ActionRow icon={<Hash size={18} />} label="Find by phone number" onClick={() => setModal("phone")} />
        <ActionRow icon={<UserPlus size={18} />} label="Add contact" onClick={() => setModal("add-contact")} />
        <h3 className="px-4 pt-4 pb-1 text-[13px] font-semibold text-fg-2">Contacts</h3>
        {shown.map((u) => (
          <button
            key={u.id}
            onClick={async () => {
              const c = await openDirect(u.id);
              select(c.id);
              closePanel();
            }}
            className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover"
          >
            <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium">{u.display_name}</span>
              {u.about && <span className="block truncate text-[12px] text-fg-2">{u.about}</span>}
            </span>
          </button>
        ))}
        {contacts && !shown.length && <p className="px-4 pt-4 text-[13px] text-fg-2">No contacts found</p>}
      </div>
      {modal && <FindUserModal mode={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
