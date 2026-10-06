import type { MessageOut } from "@/lib/api/types";
import { FileCard, MediaGrid } from "./MediaGrid";
import { TextBody } from "./TextBody";

/** Picks the right renderer for a message's content. Later kinds (voice, poll) slot in here. */
export function MessageBody({ message: m }: { message: MessageOut }) {
  if (m.deleted_at) return <TextBody text={null} deleted />;
  if (m.kind === "media") {
    const files = m.attachments.filter((a) => a.kind === "file");
    return (
      <>
        <MediaGrid attachments={m.attachments} />
        {files.map((a) => (
          <FileCard key={a.id} a={a} />
        ))}
        {m.body && <TextBody text={m.body} />}
      </>
    );
  }
  return <TextBody text={m.body} />;
}
