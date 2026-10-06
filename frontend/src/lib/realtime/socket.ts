import { WS_URL } from "@/lib/config";
import { useAuth } from "@/stores/auth";
import { useSocket } from "@/stores/socket";
import { backoffDelay } from "./backoff";
import type { ClientFrame, ServerEvent } from "./events";

const PING_MS = 25_000;
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_REVOKED = 4403;

/** One WebSocket per device: authenticates first, heartbeats, and reconnects with backoff. */
export class SocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private attempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(e: ServerEvent) => void>();
  private stopped = true;

  constructor(private rand: () => number = Math.random) {}

  connect(token: string): void {
    this.token = token;
    this.stopped = false;
    this.open();
  }

  send(frame: ClientFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  onEvent(cb: (e: ServerEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  close(): void {
    this.stopped = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    useSocket.getState().setStatus("closed");
  }

  private open(): void {
    if (!this.token) return;
    useSocket.getState().setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: this.token }));
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_MS);
    };
    ws.onmessage = (msg) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (event.type === "ready") {
        this.attempt = 0;
        useSocket.getState().setStatus("open");
      }
      this.listeners.forEach((cb) => cb(event));
    };
    ws.onclose = (e) => {
      this.clearTimers();
      if (this.ws !== ws || this.stopped) return;
      this.ws = null;
      if (e.code === CLOSE_UNAUTHORIZED || e.code === CLOSE_REVOKED) {
        this.stopped = true;
        useSocket.getState().setStatus("closed");
        useAuth.getState().signOut();
        return;
      }
      useSocket.getState().setStatus("connecting");
      this.retryTimer = setTimeout(() => this.open(), backoffDelay(this.attempt++, this.rand));
    };
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pingTimer = this.retryTimer = null;
  }
}
