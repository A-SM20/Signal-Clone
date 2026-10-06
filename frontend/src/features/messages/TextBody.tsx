import { Fragment } from "react";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;

/** Message text with line breaks preserved and links made clickable. */
export function TextBody({ text, deleted }: { text: string | null | undefined; deleted?: boolean }) {
  if (deleted) return <span>This message was deleted</span>;
  if (!text) return null;
  const parts = text.split(URL_RE);
  return (
    <span className="break-words whitespace-pre-wrap">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}
