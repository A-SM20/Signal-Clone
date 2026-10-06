"use client";

import { Tabs } from "@/components/ui/controls";
import type { FolderOut } from "@/lib/folders";

/** "All chats" + the user's folders; hidden entirely until they create one (as in Signal). */
export function FolderTabs({
  folders,
  value,
  onChange,
}: {
  folders: FolderOut[];
  value: number | "all";
  onChange: (folder: number | "all") => void;
}) {
  if (!folders.length) return null;
  const tabs = [
    { id: "all", label: "All chats" },
    ...[...folders].sort((a, b) => a.position - b.position).map((f) => ({ id: String(f.id), label: f.name })),
  ];
  return <Tabs tabs={tabs} value={String(value)} onChange={(id) => onChange(id === "all" ? "all" : Number(id))} />;
}
