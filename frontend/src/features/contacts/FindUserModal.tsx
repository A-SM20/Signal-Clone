"use client";

import { type FormEvent, useState } from "react";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { ApiError, apiFetch } from "@/lib/api/client";
import { openDirect } from "@/lib/api/hooks";
import { qk } from "@/lib/api/queryKeys";
import type { UserOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";

type Mode = "phone" | "username" | "add-contact";

const COPY: Record<Mode, { title: string; placeholder: string; action: string; hint: string }> = {
  phone: { title: "Find by phone number", placeholder: "+1 555 010 0002", action: "Next", hint: "Enter the full phone number." },
  username: { title: "Find by username", placeholder: "bob.02", action: "Next", hint: "Usernames include a dot and two digits." },
  "add-contact": {
    title: "Add contact",
    placeholder: "Phone number or username",
    action: "Add",
    hint: "Signal only finds people by their exact number or username.",
  },
};

/** Exact-match lookup (Signal never exposes a browsable user directory). */
export function FindUserModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const select = useUi((s) => s.select);
  const closePanel = useUi((s) => s.closePanel);
  const copy = COPY[mode];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const q = value.trim();
      if (mode === "add-contact") {
        const isUsername = /\.\d{2}$/.test(q);
        const user = await apiFetch<UserOut>("/api/contacts", {
          method: "POST",
          json: isUsername ? { username: q } : { phone: q },
        });
        queryClient.invalidateQueries({ queryKey: qk.contacts });
        toast(`${user.display_name} added to your contacts`);
        onClose();
        return;
      }
      const user = await apiFetch<UserOut>(`/api/users/lookup?q=${encodeURIComponent(q)}`);
      const c = await openDirect(user.id);
      select(c.id);
      closePanel();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? `${mode === "username" ? "Username" : "That number"} isn't a Signal user`
          : err instanceof ApiError
            ? err.message
            : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={copy.title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3 pt-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={copy.placeholder}
          aria-label={copy.title}
          className="h-11 rounded-xl border border-divider bg-surface px-3 text-[15px] outline-none focus:border-primary"
        />
        <p className={`text-[12px] ${error ? "text-danger" : "text-fg-2"}`} role={error ? "alert" : undefined}>
          {error ?? copy.hint}
        </p>
        <div className="flex justify-end gap-2">
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton type="submit" variant="primary" disabled={busy || !value.trim()}>
            {copy.action}
          </ModalButton>
        </div>
      </form>
    </Modal>
  );
}
