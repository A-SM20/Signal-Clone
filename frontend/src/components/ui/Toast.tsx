"use client";

import { useToasts } from "@/stores/toast";

export function ToastViewport() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-4 rounded-xl bg-[#3b3b3b] px-4 py-3 text-[13px] text-white shadow-lg [animation:toast-in_160ms_ease-out]"
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              className="font-semibold text-[#8cb2ff] hover:underline"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
