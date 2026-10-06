import type { ConversationOut, MessageOut } from "./api/types";

export type DeliveryStatus = "sending" | "sent" | "delivered" | "read" | "failed";

/**
 * Mirror of backend services/status.py: a message is read once every active
 * recipient's read cursor reaches it (delivered likewise). Hidden cursors count as 0.
 */
export function deriveStatus(m: Pick<MessageOut, "id" | "sender_id">, c: Pick<ConversationOut, "members">, meId: number): "sent" | "delivered" | "read" {
  const recipients = c.members.filter((x) => x.left_at === null && x.user.id !== (m.sender_id ?? meId));
  if (recipients.every((x) => (x.last_read_message_id ?? 0) >= m.id)) return "read";
  if (recipients.every((x) => (x.last_delivered_message_id ?? 0) >= m.id)) return "delivered";
  return "sent";
}
