"use client";

import { Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/app/LogoMark";
import { Avatar } from "@/components/ui/Avatar";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { AuthOut, MeOut } from "@/lib/api/types";
import { queryClient } from "@/lib/queryClient";
import { qk } from "@/lib/api/queryKeys";
import { useAuth } from "@/stores/auth";
import { DemoAccounts, formatPhone } from "./DemoAccounts";

type Step = "phone" | "code" | "profile";

export function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export function Shell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center overflow-y-auto bg-bg px-6 py-10">
      <div className="flex w-full max-w-[400px] flex-col items-center">
        <LogoMark size={56} className="mb-6 text-primary" />
        <h1 className="text-center text-[26px] font-semibold">{title}</h1>
        <p className="mt-2 mb-8 text-center text-[14px] text-fg-2">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

function PrimaryButton({ children, busy, disabled }: { children: ReactNode; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className="mt-6 flex h-11 w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
    >
      {busy ? <Loader2 className="animate-spin" size={20} /> : children}
    </button>
  );
}

const field =
  "h-12 w-full rounded-xl border border-divider bg-surface px-4 text-[16px] outline-none focus:border-primary";

export function OnboardingFlow() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const token = useAuth((s) => s.token);
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState("1");
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token && new URLSearchParams(window.location.search).get("step") === "profile") setStep("profile");
    else if (token) router.replace("/");
  }, [token, router]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(target: string, otp: string) {
    const auth = await apiFetch<AuthOut>("/api/auth/verify-otp", {
      method: "POST",
      json: { phone: target, code: otp, device_name: deviceName() },
    });
    setSession(auth.token, auth.user);
    queryClient.setQueryData(qk.me, auth.user);
    if (auth.is_new_user || !auth.user.display_name) setStep("profile");
    else router.replace("/");
  }

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    const target = `+${country.replace(/\D/g, "")}${number.replace(/\D/g, "")}`;
    run(async () => {
      await apiFetch("/api/auth/request-otp", { method: "POST", json: { phone: target } });
      setPhone(target);
      setStep("code");
    });
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    run(() => verify(phone, code));
  };

  const submitProfile = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (photo) {
        const form = new FormData();
        form.append("file", photo);
        await apiFetch<MeOut>("/api/me/avatar", { method: "POST", body: form });
      }
      const me = await apiFetch<MeOut>("/api/me", {
        method: "PATCH",
        json: { display_name: [first.trim(), last.trim()].filter(Boolean).join(" ") },
      });
      useAuth.getState().setMe(me);
      queryClient.setQueryData(qk.me, me);
      router.replace("/");
    });
  };

  const errorLine = error && (
    <p role="alert" className="mt-3 w-full text-[13px] text-danger">
      {error}
    </p>
  );

  if (step === "code") {
    return (
      <Shell title="Verification code" subtitle={<>Enter the code we sent to {formatPhone(phone)}</>}>
        <form onSubmit={submitCode} className="w-full">
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Verification code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className={`${field} text-center text-[24px] tracking-[0.6em]`}
          />
          <p className="mt-3 text-center text-[12px] text-fg-3">Demo mode: the code is always 123456.</p>
          {errorLine}
          <PrimaryButton busy={busy} disabled={code.length !== 6}>
            Continue
          </PrimaryButton>
          <button type="button" onClick={() => setStep("phone")} className="mt-4 w-full text-[14px] text-primary">
            Wrong number?
          </button>
        </form>
      </Shell>
    );
  }

  if (step === "profile") {
    const preview = photo ? URL.createObjectURL(photo) : null;
    const name = [first, last].filter(Boolean).join(" ") || "?";
    return (
      <Shell title="Set up your profile" subtitle="Your profile is visible to people you message, contacts and groups.">
        <form onSubmit={submitProfile} className="flex w-full flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="relative mb-2 rounded-full"
            aria-label="Choose a profile photo"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={preview} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <Avatar name={name} color="#5e6bd6" size="xl" />
            )}
            <span className="absolute right-0 bottom-0 flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-fg shadow">
              <Camera size={15} />
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
          <input autoFocus aria-label="First name" placeholder="First name (required)" value={first} onChange={(e) => setFirst(e.target.value)} className={field} maxLength={40} />
          <input aria-label="Last name" placeholder="Last name (optional)" value={last} onChange={(e) => setLast(e.target.value)} className={field} maxLength={39} />
          {errorLine}
          <PrimaryButton busy={busy} disabled={!first.trim()}>
            Next
          </PrimaryButton>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title="Phone number" subtitle="Enter your phone number to get started.">
      <form onSubmit={submitPhone} className="w-full">
        <div className="flex gap-2">
          <label className={`${field.replace("w-full", "")} flex w-20 shrink-0 items-center gap-1 px-3`}>
            <span className="text-fg-2">+</span>
            <input
              aria-label="Country code"
              inputMode="numeric"
              value={country}
              onChange={(e) => setCountry(e.target.value.replace(/\D/g, "").slice(0, 3))}
              className="w-full bg-transparent outline-none"
            />
          </label>
          <input
            autoFocus
            aria-label="Phone number"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="555 010 0001"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={field}
          />
        </div>
        {errorLine}
        <PrimaryButton busy={busy} disabled={number.replace(/\D/g, "").length < 4}>
          Next
        </PrimaryButton>
      </form>
      <DemoAccounts busy={busy} onPick={(p) => run(() => verify(p, "123456"))} />
      <a href="/link/" className="mt-6 text-[14px] font-medium text-primary hover:underline">
        Link this browser to an existing account
      </a>
    </Shell>
  );
}
