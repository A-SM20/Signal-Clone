export type ShortcutId = "newChat" | "search" | "prevChat" | "nextChat" | "closeOrCancel" | "showShortcuts" | "editLast";
export type Platform = "mac" | "other";
type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">;

export const SHORTCUTS: { id: ShortcutId; keys: (p: Platform) => string; label: string }[] = [
  { id: "newChat", keys: (p) => `${mod(p)} N`, label: "Start a new chat" },
  { id: "search", keys: (p) => `${mod(p)} F`, label: "Search chats" },
  { id: "prevChat", keys: () => "Alt ↑", label: "Previous chat" },
  { id: "nextChat", keys: () => "Alt ↓", label: "Next chat" },
  { id: "editLast", keys: () => "↑", label: "Edit your last message (empty composer)" },
  { id: "closeOrCancel", keys: () => "Esc", label: "Close panel, cancel reply or edit" },
  { id: "showShortcuts", keys: (p) => `${mod(p)} /`, label: "Show keyboard shortcuts" },
];

function mod(p: Platform): string {
  return p === "mac" ? "⌘" : "Ctrl";
}

export function detectPlatform(): Platform {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "mac" : "other";
}

/** Maps a key event to an app shortcut. Mod = ⌘ on mac, Ctrl elsewhere; extra modifiers never match. */
export function matchShortcut(e: KeyLike, platform: Platform): ShortcutId | null {
  const modOn = platform === "mac" ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  const key = e.key.toLowerCase();
  if (modOn && !e.altKey && !e.shiftKey) {
    if (key === "n") return "newChat";
    if (key === "f") return "search";
    if (key === "/") return "showShortcuts";
    return null;
  }
  const noMods = !e.ctrlKey && !e.metaKey && !e.shiftKey;
  if (noMods && e.altKey && e.key === "ArrowUp") return "prevChat";
  if (noMods && e.altKey && e.key === "ArrowDown") return "nextChat";
  if (noMods && !e.altKey && e.key === "Escape") return "closeOrCancel";
  return null;
}
