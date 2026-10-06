"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { qk } from "@/lib/api/queryKeys";
import { createLinkRequest, formatCode, type LinkRequest, pollLinkRequest } from "@/lib/linking";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/stores/auth";
import { deviceName, Shell } from "./OnboardingFlow";

const POLL_MS = 2000;

/** /link/: show a QR + pairing code, poll until a signed-in device approves, then enter the app. */
export function LinkDeviceScreen() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const token = useAuth((s) => s.token);
  const [request, setRequest] = useState<LinkRequest | null>(null);
  const [state, setState] = useState<"loading" | "waiting" | "expired" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (token) router.replace("/");
  }, [token, router]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    createLinkRequest(deviceName())
      .then((r) => {
        if (cancelled) return;
        setRequest(r);
        setState("waiting");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!request || state !== "waiting") return;
    const id = setInterval(async () => {
      try {
        const res = await pollLinkRequest(request);
        if (res.status === "expired") setState("expired");
        if (res.status === "approved" && res.token && res.user) {
          clearInterval(id);
          setSession(res.token, res.user);
          queryClient.setQueryData(qk.me, res.user);
          router.replace("/");
        }
      } catch {
        // transient network errors: keep polling until the code expires
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [request, state, setSession, router]);

  return (
    <Shell
      title="Link this browser"
      subtitle={
        <>
          On a device where you're signed in, open <b>Settings → Linked devices → Link new device</b>, then scan this
          code or type it in.
        </>
      }
    >
      {state === "loading" && <Loader2 className="animate-spin text-fg-2" size={28} />}
      {state === "waiting" && request && (
        <>
          <div className="rounded-2xl bg-white p-4" data-testid="link-qr">
            <QRCodeSVG value={request.code} size={200} level="M" />
          </div>
          <p className="mt-6 font-mono text-[30px] font-semibold tracking-[0.2em]" aria-label="Pairing code">
            {formatCode(request.code)}
          </p>
          <p className="mt-2 flex items-center gap-2 text-[13px] text-fg-2">
            <Loader2 className="animate-spin" size={14} /> Waiting for approval… the code expires in 5 minutes.
          </p>
        </>
      )}
      {(state === "expired" || state === "error") && (
        <div className="text-center">
          <p className="text-[14px] text-fg-2">
            {state === "expired" ? "This code has expired." : "Couldn't create a code. Check your connection."}
          </p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-4 rounded-full bg-primary px-6 py-2.5 text-[15px] font-semibold text-on-primary hover:bg-primary-hover"
          >
            Get a new code
          </button>
        </div>
      )}
      <a href="/onboarding/" className="mt-8 text-[14px] font-medium text-primary hover:underline">
        Sign in with a phone number instead
      </a>
    </Shell>
  );
}
