import { create } from "zustand";

export type SocketStatus = "connecting" | "open" | "closed";

export const useSocket = create<{ status: SocketStatus; setStatus: (s: SocketStatus) => void }>()((set) => ({
  status: "closed",
  setStatus: (status) => set({ status }),
}));
