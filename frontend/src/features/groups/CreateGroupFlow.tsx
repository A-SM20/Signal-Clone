"use client";

import { ArrowLeft, ArrowRight, Camera, Check, X } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton, SearchInput } from "@/components/ui/controls";
import { ApiError, apiFetch } from "@/lib/api/client";
import { upsertConversation, useContacts } from "@/lib/api/hooks";
import type { ConversationOut, UserOut } from "@/lib/api/types";
import { toast } from "@/stores/toast";
import { useUi } from "@/stores/ui";

export function ContactPicker({
  contacts,
  selected,
  onToggle,
  exclude = [],
}: {
  contacts: UserOut[];
  selected: number[];
  onToggle: (id: number) => void;
  exclude?: number[];
}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const shown = contacts.filter((u) => !exclude.includes(u.id) && (!q || u.display_name.toLowerCase().includes(q)));
  return (
    <>
      <div className="px-4 pb-2">
        <SearchInput value={filter} onChange={setFilter} placeholder="Search contacts" />
      </div>
      {!!selected.length && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {selected.map((id) => {
            const u = contacts.find((c) => c.id === id);
            return (
              u && (
                <button key={id} onClick={() => onToggle(id)} className="flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-2 pl-0.5 text-[12px]">
                  <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size="sm" />
                  {u.display_name.split(" ")[0]}
                  <X size={12} />
                </button>
              )
            );
          })}
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto pb-4">
        {shown.map((u) => {
          const on = selected.includes(u.id);
          return (
            <li key={u.id}>
              <button
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(u.id)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover"
              >
                <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size="md" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{u.display_name}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    on ? "border-primary bg-primary text-white" : "border-[var(--text-tertiary)]"
                  }`}
                >
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Signal's two-step group creation: pick members, then name (and optional photo). */
export function CreateGroupFlow() {
  const { closePanel, select } = useUi();
  const { data: contacts = [] } = useContacts();
  const [step, setStep] = useState<"members" | "details">("members");
  const [selected, setSelected] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    setBusy(true);
    try {
      let c = await apiFetch<ConversationOut>("/api/conversations/groups", {
        method: "POST",
        json: { title: title.trim(), member_ids: selected },
      });
      if (photo) {
        const form = new FormData();
        form.append("file", photo);
        c = await apiFetch<ConversationOut>(`/api/conversations/${c.id}/avatar`, { method: "POST", body: form });
      }
      upsertConversation(c);
      closePanel();
      select(c.id);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't create the group");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 px-2">
        <IconButton label="Back" onClick={() => (step === "details" ? setStep("members") : closePanel())}>
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="flex-1 text-[17px] font-semibold">{step === "members" ? "Add members" : "Name this group"}</h1>
        {step === "members" && <span className="pr-3 text-[12px] text-fg-2">{selected.length} selected</span>}
      </div>
      {step === "members" ? (
        <>
          <ContactPicker contacts={contacts} selected={selected} onToggle={toggle} />
          <div className="flex justify-end p-4 pt-2">
            <button
              aria-label="Next"
              onClick={() => setStep("details")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
          className="flex flex-1 flex-col items-center gap-4 px-6 pt-4"
        >
          <label className="relative cursor-pointer" aria-label="Group photo">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={URL.createObjectURL(photo)} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-2 text-fg-2">
                <Camera size={28} />
              </span>
            )}
            <input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <input
            autoFocus
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Group name (required)"
            aria-label="Group name"
            className="h-11 w-full rounded-xl border border-divider bg-surface px-3 text-[15px] outline-none focus:border-primary"
          />
          <p className="self-start text-[12px] text-fg-2">
            {selected.length} member{selected.length === 1 ? "" : "s"} + you
          </p>
          <button
            type="submit"
            disabled={!title.trim() || busy}
            className="mt-2 h-10 w-full rounded-full bg-primary text-[14px] font-semibold text-white disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}
    </div>
  );
}
