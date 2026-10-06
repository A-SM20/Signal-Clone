"use client";

import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api/client";
import type { MessageOut, UserOut } from "@/lib/api/types";
import type { DeliveryStatus } from "@/lib/status";
import { StatusTicks } from "./StatusTicks";

interface Details {
  recipients: { user: UserOut; status: DeliveryStatus }[];
}

const LABEL: Record<string, string> = { read: "Read", delivered: "Delivered", sent: "Sent" };

/** Signal's "Info" screen: per-recipient delivery state of my message. */
export function MessageDetailsModal({ message, onClose }: { message: MessageOut; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["message-details", message.id],
    queryFn: () => apiFetch<Details>(`/api/messages/${message.id}/details`),
  });
  const sections = (["read", "delivered", "sent"] as const).map((s) => ({
    status: s,
    people: data?.recipients.filter((r) => r.status === s) ?? [],
  }));
  return (
    <Modal title="Message details" onClose={onClose}>
      <p className="mb-3 text-[12px] text-fg-2">Sent {new Date(message.created_at).toLocaleString()}</p>
      {!data && <p className="text-[13px] text-fg-2">Loading…</p>}
      {sections
        .filter((s) => s.people.length)
        .map((s) => (
          <section key={s.status} className="mb-3">
            <h3 className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-fg-2">
              <StatusTicks status={s.status} /> {LABEL[s.status]}
            </h3>
            {s.people.map(({ user }) => (
              <div key={user.id} className="flex items-center gap-3 py-1.5">
                <Avatar name={user.display_name} color={user.avatar_color} url={user.avatar_url} size="sm" />
                <span className="text-[14px]">{user.display_name}</span>
              </div>
            ))}
          </section>
        ))}
    </Modal>
  );
}
