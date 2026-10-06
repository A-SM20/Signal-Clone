import { API_URL } from "./config";

export interface WaitForApiOptions {
  fetchFn?: typeof fetch;
  intervalMs?: number;
  onAttempt?: (attempt: number) => void;
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

/**
 * Polls /api/health until the backend answers 2xx. Render's free tier sleeps
 * after 15 idle minutes and returns 502s or drops connections while it wakes,
 * so every failure is treated as "not ready yet" rather than fatal.
 */
export async function waitForApi({
  fetchFn = fetch,
  intervalMs = 2000,
  onAttempt,
  signal,
}: WaitForApiOptions = {}): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw abortError();
    onAttempt?.(attempt);
    try {
      const res = await fetchFn(`${API_URL}/api/health`, { signal, cache: "no-store" });
      if (res.ok) return;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
    }
    await sleep(intervalMs, signal);
  }
}
