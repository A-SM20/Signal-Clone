import { apiFetch } from "@/lib/api/client";
import type { MeOut } from "@/lib/api/types";
import { API_URL } from "@/lib/config";

/** Mirrors backend CODE_ALPHABET: no 0/O or 1/I. */
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Typed or scanned input → canonical code, or null if it can't be one. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE.test(code) ? code : null;
}

export interface LinkRequest {
  id: number;
  code: string;
  poll_secret: string;
  expires_at: string;
}

export type LinkPoll = { status: "pending" | "expired" | "approved"; token?: string; user?: MeOut };

export function createLinkRequest(deviceName: string): Promise<LinkRequest> {
  return apiFetch<LinkRequest>("/api/link-requests", { method: "POST", json: { device_name: deviceName } });
}

/** Unauthenticated poll with the request's secret (plain fetch so a 401 can't sign anyone out). */
export async function pollLinkRequest(req: LinkRequest): Promise<LinkPoll> {
  const res = await fetch(`${API_URL}/api/link-requests/${req.id}`, { headers: { "X-Poll-Secret": req.poll_secret } });
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export function approveLinkCode(code: string): Promise<{ device_name: string }> {
  return apiFetch("/api/link-requests/approve", { method: "POST", json: { code } });
}
