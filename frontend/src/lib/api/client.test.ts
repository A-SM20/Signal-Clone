import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/stores/auth";
import { ApiError, apiFetch } from "./client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("apiFetch", () => {
  beforeEach(() => {
    useAuth.getState().setSession("tok-123", null);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the bearer token and JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/contacts", { method: "POST", json: { phone: "+1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/contacts$/);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
    expect(init.body).toBe(JSON.stringify({ phone: "+1" }));
  });

  it("signs out on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, { error: { code: "unauthorized", message: "x" } })));
    await expect(apiFetch("/api/me")).rejects.toBeInstanceOf(ApiError);
    expect(useAuth.getState().token).toBeNull();
  });

  it("maps error envelope to ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(409, { error: { code: "already_contact", message: "Already in your contacts" } })),
    );
    await expect(apiFetch("/api/contacts", { method: "POST", json: {} })).rejects.toMatchObject({
      status: 409,
      code: "already_contact",
      message: "Already in your contacts",
    });
  });

  it("returns undefined for 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch("/api/blocks/2", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
