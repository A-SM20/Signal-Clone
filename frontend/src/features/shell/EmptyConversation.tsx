import { LogoMark } from "@/components/app/LogoMark";

/** Right pane before any chat is opened (desktop/tablet). */
export function EmptyConversation() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg text-center">
      <LogoMark size={64} className="text-[var(--selected)]" />
      <p className="max-w-xs text-[13px] text-fg-2">Pick a chat from the list, or start a new one with the pencil icon.</p>
    </div>
  );
}
