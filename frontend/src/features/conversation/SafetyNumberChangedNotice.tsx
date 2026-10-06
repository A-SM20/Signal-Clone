"use client";

import { ShieldAlert } from "lucide-react";

/** Shown at the end of a direct chat while my verification snapshot no longer matches their current key. */
export function SafetyNumberChangedNotice({ name, onView }: { name: string; onView: () => void }) {
  return (
    <div className="flex shrink-0 justify-center px-6 py-2" role="status">
      <p className="flex max-w-md flex-wrap items-center justify-center gap-x-1.5 text-center text-[12px] leading-4 text-fg-2">
        <ShieldAlert size={13} className="shrink-0" aria-hidden />
        <span>Your safety number with {name} has changed.</span>
        <button onClick={onView} className="font-semibold text-fg underline-offset-2 hover:underline">
          View safety number
        </button>
      </p>
    </div>
  );
}
