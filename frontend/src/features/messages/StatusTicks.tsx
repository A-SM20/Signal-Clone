import { AlertCircle, Clock3 } from "lucide-react";
import type { ConversationOut, MessageOut } from "@/lib/api/types";
import { type DeliveryStatus, deriveStatus } from "@/lib/status";

export function deriveStatusSafe(m: MessageOut, c: ConversationOut, meId: number): DeliveryStatus {
  return deriveStatus(m, c, meId);
}

const LABELS: Record<DeliveryStatus, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not sent",
};

/** Signal's circled ticks: one outlined (sent), two outlined (delivered), two filled (read). */
export function StatusTicks({ status, className = "" }: { status: DeliveryStatus; className?: string }) {
  const common = { "data-status": status, "aria-label": LABELS[status], role: "img" } as const;
  if (status === "sending") return <Clock3 size={13} className={className} {...common} />;
  if (status === "failed") return <AlertCircle size={14} className={`text-danger ${className}`} {...common} />;
  const filled = status === "read";
  const circle = (cx: number) => (
    <circle cx={cx} cy="7" r="5.6" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" />
  );
  const check = (x: number) => (
    <path
      d={`M${x - 2.4} 7.1l1.7 1.7 3.2-3.4`}
      fill="none"
      stroke={filled ? "var(--tick-check, #fff)" : "currentColor"}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
  return (
    <svg width={status === "sent" ? 14 : 20} height="14" viewBox={status === "sent" ? "0 0 14 14" : "0 0 20 14"} className={className} {...common}>
      {status === "sent" ? (
        <>
          {circle(7)}
          {check(7)}
        </>
      ) : (
        <>
          {circle(7)}
          {check(7)}
          {circle(13)}
          {check(13)}
        </>
      )}
    </svg>
  );
}
