"use client";

import { Pencil, X } from "lucide-react";
import type { MessageOut } from "@/lib/api/types";

/** Sits above the composer while a sent message is being edited (Esc or ✕ cancels). */
export function EditingBar({ message, onCancel }: { message: MessageOut; onCancel: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
      <Pencil size={15} className="shrink-0 text-fg-2" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">Edit message</div>
        <div className="truncate text-[13px] text-fg-2">{message.body}</div>
      </div>
      <button aria-label="Cancel editing" onClick={onCancel} className="rounded-full p-1 text-fg-2 hover:bg-hover">
        <X size={16} />
      </button>
    </div>
  );
}
