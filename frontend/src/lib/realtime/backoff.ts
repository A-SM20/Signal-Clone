const BASE_MS = 1000;
const CAP_MS = 30_000;

/** Exponential reconnect delay (1s, 2s, 4s… capped at 30s) with 50–100% jitter. */
export function backoffDelay(attempt: number, rand: () => number = Math.random): number {
  return Math.min(CAP_MS, BASE_MS * 2 ** attempt) * (0.5 + rand() / 2);
}
