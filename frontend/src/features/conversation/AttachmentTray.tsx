"use client";

import { FileText, Loader2, Plus, X } from "lucide-react";
import { useCallback, useState } from "react";
import type { AttachmentOut } from "@/lib/api/types";
import { formatBytes, uploadAttachment } from "@/lib/upload";
import { toast } from "@/stores/toast";

export interface TrayItem {
  localId: string;
  file: File;
  preview: string | null;
  progress: number;
  uploaded?: AttachmentOut;
  failed?: boolean;
}

const MAX_ITEMS = 10;
const MAX_BYTES = 10 * 1024 * 1024;

/** Upload state for files picked, dropped or pasted into the composer. */
export function useAttachmentTray() {
  const [items, setItems] = useState<TrayItem[]>([]);

  const add = useCallback((files: File[]) => {
    setItems((current) => {
      const room = MAX_ITEMS - current.length;
      if (files.length > room) toast(`You can attach up to ${MAX_ITEMS} files`);
      const fresh = files.slice(0, Math.max(0, room)).flatMap((file) => {
        if (file.size > MAX_BYTES) {
          toast(`${file.name} is larger than 10 MB`);
          return [];
        }
        const localId = crypto.randomUUID();
        const item: TrayItem = {
          localId,
          file,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          progress: 0,
        };
        const patch = (changes: Partial<TrayItem>) =>
          setItems((list) => list.map((x) => (x.localId === localId ? { ...x, ...changes } : x)));
        uploadAttachment(file, { onProgress: (p) => patch({ progress: p }) })
          .then((uploaded) => patch({ uploaded, progress: 1 }))
          .catch((e) => {
            patch({ failed: true });
            toast(e instanceof Error ? e.message : "Upload failed");
          });
        return [item];
      });
      return [...current, ...fresh];
    });
  }, []);

  const remove = (localId: string) => setItems((list) => list.filter((x) => x.localId !== localId));
  const clear = () => setItems([]);
  const ready = items.length > 0 && items.every((x) => x.uploaded);
  const busy = items.some((x) => !x.uploaded && !x.failed);
  return { items, add, remove, clear, ready, busy };
}

export function AttachButton({ onFiles }: { onFiles: (files: File[]) => void }) {
  return (
    <label
      className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-2 hover:bg-hover hover:text-fg"
      aria-label="Attach file"
      title="Attach file"
    >
      <Plus size={22} />
      <input
        type="file"
        multiple
        hidden
        accept="image/*,.pdf,.txt,.zip,.docx,.xlsx,.pptx"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function AttachmentTray({ items, onRemove }: { items: TrayItem[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
      {items.map((x) => (
        <div key={x.localId} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {x.preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={x.preview} alt={x.file.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center text-fg-2">
              <FileText size={22} />
              <span className="w-full truncate text-[10px]">{x.file.name}</span>
              <span className="text-[9px]">{formatBytes(x.file.size)}</span>
            </div>
          )}
          {!x.uploaded && !x.failed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
              <Loader2 size={18} className="animate-spin" />
              <span className="absolute bottom-1 text-[10px]">{Math.round(x.progress * 100)}%</span>
            </div>
          )}
          {x.failed && <div className="absolute inset-0 flex items-center justify-center bg-danger/70 text-[11px] text-white">Failed</div>}
          <button
            aria-label={`Remove ${x.file.name}`}
            onClick={() => onRemove(x.localId)}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
