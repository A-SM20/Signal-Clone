"use client";

import { useState } from "react";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { ApiError, apiFetch } from "@/lib/api/client";
import { upsertConversation, useContacts } from "@/lib/api/hooks";
import type { ConversationOut } from "@/lib/api/types";
import { toast } from "@/stores/toast";
import { ContactPicker } from "./CreateGroupFlow";

export function AddMembersModal({ conversation, onClose }: { conversation: ConversationOut; onClose: () => void }) {
  const { data: contacts = [] } = useContacts();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const current = conversation.members.filter((m) => m.left_at === null).map((m) => m.user.id);

  const add = async () => {
    setBusy(true);
    try {
      upsertConversation(
        await apiFetch<ConversationOut>(`/api/conversations/${conversation.id}/members`, {
          method: "POST",
          json: { user_ids: selected },
        }),
      );
      toast(`${selected.length} member${selected.length === 1 ? "" : "s"} added`);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't add members");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add members"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" disabled={!selected.length || busy} onClick={add}>
            Add
          </ModalButton>
        </>
      }
    >
      <div className="-mx-5 flex h-[50dvh] flex-col">
        <ContactPicker
          contacts={contacts}
          exclude={current}
          selected={selected}
          onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
        />
      </div>
    </Modal>
  );
}
