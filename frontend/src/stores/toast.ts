import { create } from "zustand";

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  dismiss: (id: number) => void;
}

const DISMISS_AFTER_MS = 4000;
let nextId = 1;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Signal-style bottom toast. Returns its id. */
export function toast(message: string, opts: { action?: Toast["action"] } = {}): number {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, action: opts.action }] }));
  setTimeout(() => useToasts.getState().dismiss(id), DISMISS_AFTER_MS);
  return id;
}
