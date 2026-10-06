"use client";

import { BadgeCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api/client";
import { groupSafetyNumber, setVerified, useSafetyNumber } from "@/lib/safetyNumber";
import { toast } from "@/stores/toast";

/** Signal's "View safety number" dialog: QR code, 12 blocks of 5 digits, mark/clear verified. */
export function SafetyNumberModal({ userId, name, onClose }: { userId: number; name: string; onClose: () => void }) {
  const { data, isLoading } = useSafetyNumber(userId);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await setVerified(userId, !data.verified);
      toast(res.verified ? `${name} marked as verified` : "Verification cleared");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Safety number"
      onClose={onClose}
      width={420}
      footer={
        <>
          <ModalButton onClick={onClose}>Close</ModalButton>
          <ModalButton variant="primary" onClick={toggle} disabled={!data || busy}>
            {data?.verified ? "Clear verification" : "Mark as verified"}
          </ModalButton>
        </>
      }
    >
      {isLoading || !data ? (
        <p className="py-10 text-center text-[13px] text-fg-2">Loading…</p>
      ) : (
        <div className="flex flex-col items-center gap-4 pt-1">
          {data.changed && (
            <p className="w-full rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
              Your safety number with {name} has changed since you last verified it. This could mean they reinstalled
              Signal or changed devices.
            </p>
          )}
          <div className="rounded-xl bg-white p-3" data-testid="safety-qr">
            <QRCodeSVG value={data.qr_payload} size={176} level="M" />
          </div>
          <div
            className="grid grid-cols-4 gap-x-5 gap-y-1.5 font-mono text-[17px] tracking-wider tabular-nums"
            aria-label="Safety number"
          >
            {groupSafetyNumber(data.digits).map((g, i) => (
              <span key={i}>{g}</span>
            ))}
          </div>
          {data.verified && (
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
              <BadgeCheck size={16} /> Verified
            </p>
          )}
          <p className="text-center text-[13px] text-fg-2">
            To verify the security of your end-to-end encryption with {name}, compare the numbers above with their
            device. They can also scan your code with their device.
          </p>
          <p className="text-center text-[12px] text-fg-3">Encryption keys in this demo are simulated.</p>
        </div>
      )}
    </Modal>
  );
}
