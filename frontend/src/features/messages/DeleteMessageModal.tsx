"use client";

import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api/client";
import type { MessageOut } from "@/lib/api/types";
import { canDeleteForEveryone, deleteMessage } from "@/lib/editing";
import { toast } from "@/stores/toast";

export function DeleteMessageModal({ message, meId, onClose }: { message: MessageOut; meId: number; onClose: () => void }) {
  const everyone = canDeleteForEveryone(message, meId);
  const run = async (scope: "me" | "everyone") => {
    onClose();
    try {
      await deleteMessage(message, scope);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't delete the message");
    }
  };
  const option = "w-full rounded-full py-2.5 text-[14px] font-semibold";
  return (
    <Modal title="Delete message?" onClose={onClose} width={360}>
      <p className="text-[14px] text-fg-2">
        {everyone
          ? "You can delete this message for yourself, or for everyone in this chat."
          : "This message will be deleted from this device."}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button onClick={() => void run("me")} className={`${option} bg-surface-2 text-danger hover:bg-selected`}>
          Delete for me
        </button>
        {everyone && (
          <button onClick={() => void run("everyone")} className={`${option} bg-danger text-white hover:opacity-90`}>
            Delete for everyone
          </button>
        )}
        <button onClick={onClose} className={`${option} text-fg hover:bg-hover`}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
