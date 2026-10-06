"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** Centered dialog with scrim, Esc-to-close and a simple focus trap. */
export function Modal({ title, onClose, children, footer, width = 440 }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
    (focusables()[0] ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl bg-elevated text-fg shadow-[var(--shadow)] [animation:pop-in_140ms_ease-out]"
        style={{ maxWidth: width }}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            <button aria-label="Close" onClick={onClose} className="rounded-full p-1.5 text-fg-2 hover:bg-hover">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pt-1 pb-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ModalButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-primary text-on-primary hover:bg-primary-hover",
    secondary: "bg-surface-2 text-fg hover:bg-selected",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-5 py-2 text-[14px] font-semibold disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}
