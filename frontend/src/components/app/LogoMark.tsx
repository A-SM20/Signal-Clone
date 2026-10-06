/** Our own speech-bubble mark (not Signal's logo asset). */
export function LogoMark({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <circle cx="32" cy="32" r="32" fill="currentColor" />
      <path
        d="M32 15c-9.9 0-18 7.2-18 16.1 0 4.7 2.3 9 6 11.9l-1.6 6.4 7.1-3.5c2 .6 4.2.9 6.5.9 9.9 0 18-7.2 18-16.1S41.9 15 32 15Z"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinejoin="round"
        strokeDasharray="5 3.2"
      />
    </svg>
  );
}
