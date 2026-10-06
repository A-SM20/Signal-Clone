import { CircleDashed, Phone } from "lucide-react";
import type { ReactNode } from "react";

export function ComingSoon({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-fg-2">{icon}</span>
      <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
      <p className="max-w-xs text-[13px] text-fg-2">{body}</p>
      <span className="rounded-full bg-surface-2 px-3 py-1 text-[12px] font-medium text-fg-2">Coming soon</span>
    </div>
  );
}

function ListHeader({ title }: { title: string }) {
  return (
    <div className="flex h-[var(--header-height)] items-center px-4">
      <h1 className="text-[20px] font-bold">{title}</h1>
    </div>
  );
}

export function CallsList() {
  return (
    <>
      <ListHeader title="Calls" />
      <p className="px-4 pt-6 text-center text-[13px] text-fg-2">No recent calls</p>
    </>
  );
}

export function CallsTab() {
  return (
    <ComingSoon
      icon={<Phone size={28} />}
      title="Voice and video calls"
      body="Private, end-to-end encrypted calls with your contacts and groups."
    />
  );
}

export function StoriesList() {
  return (
    <>
      <ListHeader title="Stories" />
      <p className="px-4 pt-6 text-center text-[13px] text-fg-2">No recent stories</p>
    </>
  );
}

export function StoriesTab() {
  return (
    <ComingSoon
      icon={<CircleDashed size={28} />}
      title="Stories"
      body="Share photos and text updates that disappear after 24 hours."
    />
  );
}
