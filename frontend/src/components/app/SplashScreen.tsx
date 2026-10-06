import { LogoMark } from "./LogoMark";

const SLOW_AFTER_ATTEMPTS = 5;

export function SplashScreen({ attempts }: { attempts: number }) {
  const slow = attempts >= SLOW_AFTER_ATTEMPTS;
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-[var(--bg,#fff)] text-[var(--text,#1b1b1b)]">
      <LogoMark className="text-[var(--primary,#3a76f0)]" />
      <div className="h-1 w-40 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div className="h-full w-1/3 animate-[splash_1.2s_ease-in-out_infinite] rounded-full bg-[var(--primary,#3a76f0)]" />
      </div>
      <p className="text-sm text-[var(--text-secondary,#5e5e5e)]" role="status">
        {slow ? "Waking up the server — this can take up to a minute" : "Connecting…"}
      </p>
    </div>
  );
}
