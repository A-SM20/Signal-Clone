"use client";

import { Search, X } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-[var(--selected)]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode; size?: number };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, size = 36, className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-fg-2 hover:bg-hover hover:text-fg disabled:opacity-40 ${className}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  );
});

export const SearchInput = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }
>(function SearchInput({ value, onChange, placeholder = "Search", className = "" }, ref) {
  return (
    <label className={`flex h-8 items-center gap-2 rounded-lg bg-surface-2 px-2.5 text-fg-2 ${className}`}>
      <Search size={16} aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && (e.stopPropagation(), onChange(""))}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none focus-visible:outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")} className="rounded-full p-0.5 hover:bg-hover">
          <X size={14} />
        </button>
      )}
    </label>
  );
});

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium ${
            t.id === value ? "bg-[var(--selected)] text-fg" : "text-fg-2 hover:bg-hover"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-50 mt-1 -translate-x-1/2 rounded-md bg-[#3b3b3b] px-2 py-1 text-[12px] whitespace-nowrap text-white opacity-0 transition-opacity delay-300 group-hover:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
