"use client";

import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import type { MessageOut } from "@/lib/api/types";

type RevisionOut = components["schemas"]["RevisionOut"];

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

/** "Edit history": the current text first, then every earlier version, newest to oldest. */
export function EditHistoryModal({ message, onClose }: { message: MessageOut; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["revisions", message.id, message.edited_at],
    queryFn: () => apiFetch<RevisionOut[]>(`/api/messages/${message.id}/revisions`),
  });
  const versions = [
    { body: message.body ?? "", at: message.edited_at ?? message.created_at, current: true },
    ...[...(data ?? [])].reverse().map((r, i, all) => ({
      body: r.body,
      at: i === all.length - 1 ? message.created_at : all[i + 1].created_at,
      current: false,
    })),
  ];
  return (
    <Modal title="Edit history" onClose={onClose} width={420}>
      <ol className="flex flex-col gap-3 pt-1">
        {versions.map((v, i) => (
          <li key={i} className="rounded-xl bg-surface-2 px-3 py-2">
            <p className="text-[14px] whitespace-pre-wrap">{v.body}</p>
            <p className="mt-1 text-[11px] text-fg-2">
              {v.current ? "Edited " : i === versions.length - 1 ? "Sent " : "Edited "}
              {when(v.at)}
            </p>
          </li>
        ))}
      </ol>
      {!data && <p className="py-2 text-center text-[13px] text-fg-2">Loading…</p>}
    </Modal>
  );
}
