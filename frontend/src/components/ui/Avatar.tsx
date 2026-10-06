import { mediaUrl, reportBrokenMedia } from "@/lib/useSignedMedia";

const SIZES = { sm: 28, md: 36, lg: 48, xl: 80 } as const;
export type AvatarSize = keyof typeof SIZES;

/** "Alice Chen" -> "AC", "Bob" -> "B"; first and last word, emoji-safe. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "#";
  const first = Array.from(words[0])[0].toUpperCase();
  if (words.length === 1) return first;
  return first + Array.from(words[words.length - 1])[0].toUpperCase();
}

export { mediaUrl };

interface AvatarProps {
  name: string;
  color: string;
  url?: string | null;
  size?: AvatarSize;
  online?: boolean;
  className?: string;
}

export function Avatar({ name, color, url, size = "lg", online, className = "" }: AvatarProps) {
  const px = SIZES[size];
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: px, height: px }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed URLs from our API; no Next image optimizer in static export
        <img
          src={mediaUrl(url)}
          onError={() => reportBrokenMedia(url)}
          alt={name}
          role="img"
          className="h-full w-full rounded-full object-cover"
          draggable={false}
        />
      ) : (
        <span
          role="img"
          aria-label={name}
          className="flex h-full w-full select-none items-center justify-center rounded-full font-semibold text-white"
          style={{ backgroundColor: color, fontSize: Math.round(px * 0.38) }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          aria-hidden
          className="absolute right-0 bottom-0 rounded-full border-2 border-[var(--surface)] bg-online"
          style={{ width: Math.max(10, px * 0.26), height: Math.max(10, px * 0.26) }}
        />
      )}
    </span>
  );
}
