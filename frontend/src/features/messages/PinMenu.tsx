"use client";

import { Pin, PinOff } from "lucide-react";
import { useState } from "react";
import type { MenuItem } from "@/components/ui/ContextMenu";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api/client";
import type { ConversationOut, MessageOut } from "@/lib/api/types";
import { canPin, PIN_DURATIONS, type PinDuration, pinMessage, unpinMessage } from "@/lib/pins";
import { toast } from "@/stores/toast";

const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : "Something went wrong");

/** "Pin" / "Unpin" entries for the message menu; pinning first asks how long to keep it pinned. */
export function pinMenuItems(c: ConversationOut, m: MessageOut, choose: (m: MessageOut) => void): MenuItem[] {
  if (!canPin(c) || m.kind === "system" || m.deleted_at) return [];
  const pinned = (c.pins ?? []).some((p) => p.message_id === m.id);
  return pinned
    ? [{ label: "Unpin", icon: <PinOff size={16} />, onSelect: () => void unpinMessage(m.id).catch(fail) }]
    : [{ label: "Pin", icon: <Pin size={16} />, onSelect: () => choose(m) }];
}

export function PinDurationModal({ message, full, onClose }: { message: MessageOut; full: boolean; onClose: () => void }) {
  const [duration, setDuration] = useState<PinDuration>("7d");
  const save = () => {
    onClose();
    pinMessage(message, duration)
      .then(() => toast("Message pinned"))
      .catch(fail);
  };
  return (
    <Modal
      title="Keep pinned for…"
      onClose={onClose}
      width={360}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={save}>
            Pin
          </ModalButton>
        </>
      }
    >
      <div role="radiogroup" className="flex flex-col">
        {PIN_DURATIONS.map((d) => (
          <label key={d.value} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-[14px] hover:bg-hover">
            <input
              type="radio"
              name="pin-duration"
              checked={duration === d.value}
              onChange={() => setDuration(d.value)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            {d.label}
          </label>
        ))}
      </div>
      {full && <p className="mt-2 text-[12px] text-fg-2">This chat already has 3 pins. Pinning this replaces the oldest one.</p>}
    </Modal>
  );
}
