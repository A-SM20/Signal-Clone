"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Camera, Plus } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api/client";
import { qk } from "@/lib/api/queryKeys";
import { approveLinkCode, normalizeCode } from "@/lib/linking";
import { toast } from "@/stores/toast";
import { Group, SettingRow } from "./sections";

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Camera QR scanning where the browser has BarcodeDetector (Chrome/Edge/Android); otherwise type the code. */
function useQrScanner(active: boolean, onCode: (code: string) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;
  useEffect(() => {
    if (!active || !supported) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const detector = new (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector({ formats: ["qr_code"] });
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        void video.current.play();
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const found = (await detector.detect(video.current).catch(() => []))[0]?.rawValue;
          const code = found && normalizeCode(found);
          if (code) onCode(code);
        }, 400);
      })
      .catch(() => toast("Camera unavailable — type the code instead"));
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, supported]); // eslint-disable-line react-hooks/exhaustive-deps
  return { video, supported };
}

export function LinkNewDeviceAction() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Group>
        <SettingRow label="Link new device" control={<Plus size={18} className="text-fg-2" />} onClick={() => setOpen(true)} />
      </Group>
      {open && <LinkNewDeviceModal onClose={() => setOpen(false)} />}
    </>
  );
}

function LinkNewDeviceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async (raw: string) => {
    const normalized = normalizeCode(raw);
    if (!normalized) return setError("Codes are 8 letters and numbers, like ABCD-2345");
    setBusy(true);
    setError(null);
    try {
      const { device_name } = await approveLinkCode(normalized);
      await qc.invalidateQueries({ queryKey: qk.devices });
      toast(`${device_name} linked`);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't link the device");
    } finally {
      setBusy(false);
    }
  };

  const scanner = useQrScanner(scanning, (scanned) => {
    setScanning(false);
    setCode(scanned);
    void approve(scanned);
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void approve(code);
  };

  return (
    <Modal title="Link new device" onClose={onClose} width={400}>
      <form onSubmit={submit}>
        <p className="mb-4 text-[14px] text-fg-2">
          On the new device, open this app and choose <b>Link this browser to an existing account</b>. Then scan its QR
          code or type the code shown.
        </p>
        {scanner.supported &&
          (scanning ? (
            <video ref={scanner.video} muted playsInline className="mb-3 aspect-square w-full rounded-xl bg-black object-cover" />
          ) : (
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-full bg-surface-2 py-2.5 text-[14px] font-semibold hover:bg-selected"
            >
              <Camera size={17} /> Scan QR code
            </button>
          ))}
        <input
          aria-label="Pairing code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-2345"
          autoCapitalize="characters"
          maxLength={11}
          className="h-11 w-full rounded-xl bg-surface-2 px-4 text-center font-mono text-[18px] tracking-[0.2em] uppercase outline-none focus:ring-2 focus:ring-primary"
        />
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton type="submit" variant="primary" disabled={busy || !code.trim()}>
            Link device
          </ModalButton>
        </div>
      </form>
    </Modal>
  );
}
