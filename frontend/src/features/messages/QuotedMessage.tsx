import { X } from "lucide-react";
import type { ConversationOut, MessageOut, ReplyPreviewOut } from "@/lib/api/types";
import { memberName } from "@/lib/conversations";

function quoteText(q: Pick<ReplyPreviewOut, "kind" | "body" | "deleted">): string {
  if (q.deleted) return "This message was deleted";
  if (q.body) return q.body;
  return { media: "📷 Photo", voice: "🎤 Voice message", poll: "📊 Poll" }[q.kind] ?? "";
}

/** The quoted original inside a reply bubble; clicking scrolls to it. */
export function QuotedMessage({
  quote,
  conversation,
  meId,
  outgoing,
}: {
  quote: ReplyPreviewOut;
  conversation: ConversationOut;
  meId: number;
  outgoing: boolean;
}) {
  const author = quote.sender_id === meId ? "You" : memberName(conversation, quote.sender_id ?? 0);
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("signal:jump", { detail: quote.id }))}
      className={`mb-1.5 block w-full min-w-[160px] rounded-lg border-l-4 px-2.5 py-1.5 text-left ${
        outgoing ? "border-white/80 bg-white/15" : "border-[var(--primary)] bg-black/5 dark:bg-white/10"
      }`}
    >
      <span className="block text-[12px] font-semibold">{author}</span>
      <span className="line-clamp-2 text-[13px] opacity-90">{quoteText(quote)}</span>
    </button>
  );
}

/** Banner above the composer while replying. */
export function ReplyPreview({
  message,
  conversation,
  meId,
  onCancel,
}: {
  message: MessageOut;
  conversation: ConversationOut;
  meId: number;
  onCancel: () => void;
}) {
  const author = message.sender_id === meId ? "You" : memberName(conversation, message.sender_id ?? 0);
  return (
    <div className="mb-2 flex items-start gap-2 rounded-xl border-l-4 border-[var(--primary)] bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-semibold text-primary">Replying to {author}</div>
        <div className="line-clamp-1 text-[13px] text-fg-2">
          {quoteText({ kind: message.kind, body: message.body, deleted: !!message.deleted_at })}
        </div>
      </div>
      <button aria-label="Cancel reply" onClick={onCancel} className="rounded-full p-1 text-fg-2 hover:bg-hover">
        <X size={16} />
      </button>
    </div>
  );
}
