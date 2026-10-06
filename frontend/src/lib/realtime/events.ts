import type { ConversationOut, MessageOut, PollOut, ReactionOut } from "@/lib/api/types";

/** Mirrors backend/app/realtime/events.py. */
type Envelope<T extends string, D> = { type: T; data: D; ts: string };

export type ServerEvent =
  | Envelope<"ready", { user_id: number; device_id: number }>
  | Envelope<"pong", Record<string, never>>
  | Envelope<"message.created", MessageOut>
  | Envelope<"message.updated", MessageOut>
  | Envelope<"message.removed", { conversation_id: number; message_ids: number[] }>
  | Envelope<"reaction.updated", { conversation_id: number; message_id: number; reactions: ReactionOut[] }>
  | Envelope<
      "poll.updated",
      { conversation_id: number; message_id: number; options: PollOut["options"]; ended_at: string | null }
    >
  | Envelope<"pin.updated", { conversation_id: number; pins: unknown[] }>
  | Envelope<
      "receipt.updated",
      { conversation_id: number; user_id: number; delivered_up_to: number | null; read_up_to: number | null }
    >
  | Envelope<"typing", { conversation_id: number; user_id: number; state: "start" | "stop" }>
  | Envelope<"presence", { user_id: number; online: boolean; last_seen_at: string | null }>
  | Envelope<"conversation.updated", ConversationOut>
  | Envelope<"conversation.removed", { conversation_id: number }>
  | Envelope<"device.revoked", Record<string, never>>;

export type ClientFrame =
  | { type: "auth"; token: string }
  | { type: "ping" }
  | { type: "typing"; data: { conversation_id: number; state: "start" | "stop" } }
  | { type: "receipt"; data: { conversation_id: number; kind: "delivered" | "read"; up_to_message_id: number } };
