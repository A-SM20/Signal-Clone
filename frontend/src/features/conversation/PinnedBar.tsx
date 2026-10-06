"use client";

import { Pin, X } from "lucide-react";
import { useState } from "react";
import type { ConversationOut } from "@/lib/api/types";
import { memberName, messageSummary } from "@/lib/conversations";
import { ApiError } from "@/lib/api/client";
import { canPin, nextPinIndex, unpinMessage } from "@/lib/pins";
import { toast } from "@/stores/toast";

/** Bar under the chat header: shows one pin at a time; clicking jumps to it and moves to the next. */
export function PinnedBar({ conversation: c, meId }: { conversation: ConversationOut; meId: number }) {
  const [index, setIndex] = useState(0);
  const pins = c.pins ?? [];
  if (!pins.length) return null;
  const i = index < pins.length ? index : 0;
  const pin = pins[i];
  const thumb = pin.message.attachments.find((a) => a.kind === "image");
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-divider bg-bg px-4 py-1.5">
      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent("signal:jump", { detail: pin.message_id }));
          setIndex(nextPinIndex(i, pins.length));
        }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-hover"
        aria-label="Go to pinned message"
      >
        <Pin size={16} className="shrink-0 text-fg-2" aria-hidden />
        {thumb && <img src={thumb.url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />}
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold">
            Pinned message{pins.length > 1 ? ` · ${i + 1} of ${pins.length}` : ""}
          </span>
          <span className="block truncate text-[13px] text-fg-2">
            {messageSummary(pin.message, (id) => memberName(c, id), meId)}
          </span>
        </span>
      </button>
      {canPin(c) && (
        <button
          aria-label="Unpin message"
          onClick={() => unpinMessage(pin.message_id).catch((e) => toast(e instanceof ApiError ? e.message : "Couldn't unpin"))}
          className="rounded-full p-1.5 text-fg-2 hover:bg-hover"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
