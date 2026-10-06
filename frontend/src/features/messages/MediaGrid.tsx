"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AttachmentOut } from "@/lib/api/types";
import { formatBytes } from "@/lib/upload";
import { useSignedMedia } from "@/lib/useSignedMedia";
import { FileText } from "lucide-react";

function Img({ a, className, onClick }: { a: AttachmentOut; className?: string; onClick?: () => void }) {
  const { src, onError } = useSignedMedia(a.url);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed API URL, static export
    <img
      src={src}
      onError={onError}
      onClick={onClick}
      alt={a.original_name}
      loading="lazy"
      className={`cursor-zoom-in bg-surface-2 object-cover ${className ?? ""}`}
      style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
    />
  );
}

export function Lightbox({ images, start, onClose }: { images: AttachmentOut[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const current = images[i];
  const { src, onError } = useSignedMedia(current.url);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(images.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [images.length, onClose]);
  return createPortal(
    <div role="dialog" aria-label="Image viewer" className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-between p-3">
        <span className="text-[13px] opacity-80">
          {i + 1} / {images.length}
        </span>
        <span className="flex gap-1">
          <a href={src} download={current.original_name} className="rounded-full p-2 hover:bg-white/10" aria-label="Download">
            <Download size={20} />
          </a>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
            <X size={22} />
          </button>
        </span>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed API URL */}
        <img src={src} onError={onError} alt={current.original_name} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        {i > 0 && (
          <button aria-label="Previous" onClick={(e) => (e.stopPropagation(), setI(i - 1))} className="absolute left-4 rounded-full bg-white/10 p-2 hover:bg-white/20">
            <ChevronLeft size={24} />
          </button>
        )}
        {i < images.length - 1 && (
          <button aria-label="Next" onClick={(e) => (e.stopPropagation(), setI(i + 1))} className="absolute right-4 rounded-full bg-white/10 p-2 hover:bg-white/20">
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Signal-style album layouts: 1 | 2 side by side | 1 + 2 stacked | 2×2 with "+N". */
export function MediaGrid({ attachments }: { attachments: AttachmentOut[] }) {
  const images = attachments.filter((a) => a.kind === "image");
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  const show = images.slice(0, 4);
  const extra = images.length - show.length;
  const view = (i: number) => () => setOpen(i);
  let grid;
  if (show.length === 1) {
    grid = <Img a={show[0]} onClick={view(0)} className="block max-h-[360px] w-full max-w-[320px] min-w-[180px]" />;
  } else if (show.length === 2) {
    grid = (
      <div className="grid w-[300px] grid-cols-2 gap-0.5">
        {show.map((a, i) => (
          <Img key={a.id} a={a} onClick={view(i)} className="aspect-square h-full w-full" />
        ))}
      </div>
    );
  } else if (show.length === 3) {
    grid = (
      <div className="grid h-[240px] w-[300px] grid-cols-2 grid-rows-2 gap-0.5">
        <Img a={show[0]} onClick={view(0)} className="row-span-2 h-full w-full !aspect-auto" />
        <Img a={show[1]} onClick={view(1)} className="h-full w-full !aspect-auto" />
        <Img a={show[2]} onClick={view(2)} className="h-full w-full !aspect-auto" />
      </div>
    );
  } else {
    grid = (
      <div className="grid w-[300px] grid-cols-2 gap-0.5">
        {show.map((a, i) => (
          <div key={a.id} className="relative">
            <Img a={a} onClick={view(i)} className="aspect-square h-full w-full !aspect-square" />
            {i === 3 && extra > 0 && (
              <button onClick={view(3)} className="absolute inset-0 flex items-center justify-center bg-black/50 text-[22px] font-semibold text-white">
                +{extra}
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="-mx-3 mt-1 mb-1 overflow-hidden first:-mt-[7px] first:rounded-t-[inherit]">{grid}</div>
      {open !== null && <Lightbox images={images} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function FileCard({ a }: { a: AttachmentOut }) {
  const { src } = useSignedMedia(a.url);
  const ext = a.original_name.split(".").pop()?.toUpperCase() ?? "FILE";
  return (
    <a
      href={src}
      download={a.original_name}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 flex min-w-[220px] items-center gap-3 rounded-xl bg-black/10 p-2.5 no-underline dark:bg-white/10"
    >
      <span className="relative flex h-10 w-9 items-center justify-center">
        <FileText size={34} strokeWidth={1.4} />
        <span className="absolute bottom-1 text-[7px] font-bold">{ext.slice(0, 4)}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium">{a.original_name}</span>
        <span className="block text-[12px] opacity-75">{formatBytes(a.size_bytes)}</span>
      </span>
    </a>
  );
}
