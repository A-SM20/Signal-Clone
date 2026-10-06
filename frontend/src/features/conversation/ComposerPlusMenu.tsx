"use client";

import { BarChart3, ImageIcon, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { CreatePollModal } from "./CreatePollModal";

/** The composer's "+" button: attach photos/files or start a poll. */
export function ComposerPlusMenu({ conversationId, onFiles }: { conversationId: number; onFiles: (files: File[]) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [poll, setPoll] = useState(false);
  return (
    <>
      <button
        aria-label="Attach"
        title="Attach"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor({ x: r.left, y: r.top - 96 });
        }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-hover hover:text-fg"
      >
        <Plus size={22} />
      </button>
      <input
        ref={file}
        type="file"
        multiple
        hidden
        aria-label="Attach file"
        accept="image/*,.pdf,.txt,.zip,.docx,.xlsx,.pptx"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      {anchor && (
        <ContextMenu
          anchor={anchor}
          onClose={() => setAnchor(null)}
          items={[
            { label: "Photo or file", icon: <ImageIcon size={16} />, onSelect: () => file.current?.click() },
            { label: "Poll", icon: <BarChart3 size={16} />, onSelect: () => setPoll(true) },
          ]}
        />
      )}
      {poll && <CreatePollModal conversationId={conversationId} onClose={() => setPoll(false)} />}
    </>
  );
}
