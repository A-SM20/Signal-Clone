import { API_URL } from "@/lib/config";
import { useAuth } from "@/stores/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiInit = RequestInit & { json?: unknown };

/**
 * Typed fetch for the FastAPI backend. Adds the bearer token, parses the error
 * envelope, and treats 401 as "session gone" — e.g. after Render re-seeds the DB.
 */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const h = new Headers(headers);
  const token = useAuth.getState().token;
  if (token) h.set("Authorization", `Bearer ${token}`);
  let body = rest.body;
  if (json !== undefined) {
    h.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }

  const res = await fetch(`${API_URL}${path}`, { ...rest, headers: h, body });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) useAuth.getState().signOut();
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? "http_error", err.message ?? res.statusText);
  }
  return data as T;
}
