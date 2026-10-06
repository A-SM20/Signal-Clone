"use client";

import { Avatar } from "@/components/ui/Avatar";

/** Mirrors backend/app/seed/data.py so evaluators can sign in with one click. */
export const DEMO_ACCOUNTS = [
  { name: "Alice Chen", phone: "+15550100001", color: "#3d8f6e" },
  { name: "Bob Martinez", phone: "+15550100002", color: "#b8562f" },
  { name: "Priya Sharma", phone: "+15550100003", color: "#8a5bc7" },
  { name: "Daniel Kim", phone: "+15550100004", color: "#2f7fa8" },
  { name: "Emma Wilson", phone: "+15550100005", color: "#b0436b" },
  { name: "Lucas Silva", phone: "+15550100006", color: "#6f7d2c" },
  { name: "Mei Tanaka", phone: "+15550100007", color: "#c26a1b" },
  { name: "Jordan Blake", phone: "+15550100008", color: "#4a6fa5" },
];

export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 ${m[1]}-${m[2]}-${m[3]}` : e164;
}

export function DemoAccounts({ onPick, busy }: { onPick: (phone: string) => void; busy: boolean }) {
  return (
    <section aria-label="Demo accounts" className="mt-8 w-full">
      <h2 className="mb-1 text-[13px] font-semibold text-fg-2">Demo accounts</h2>
      <p className="mb-3 text-[12px] text-fg-3">
        Verification is simulated: every number uses the code <b className="text-fg-2">123456</b>. Open two
        browsers with different accounts to chat in real time.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_ACCOUNTS.map((a) => (
          <button
            key={a.phone}
            disabled={busy}
            onClick={() => onPick(a.phone)}
            className="flex items-center gap-2 rounded-xl bg-surface px-2.5 py-2 text-left hover:bg-hover disabled:opacity-50"
          >
            <Avatar name={a.name} color={a.color} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{a.name}</span>
              <span className="block truncate text-[11px] text-fg-2">{formatPhone(a.phone)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
