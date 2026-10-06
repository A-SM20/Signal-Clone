import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/stores/auth";
import { useSocket } from "@/stores/socket";
import { SocketClient } from "./socket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

describe("SocketClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    useAuth.getState().setSession("tok", null);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sends auth as the first frame", () => {
    const client = new SocketClient(() => 1);
    client.connect("tok");
    FakeWebSocket.instances[0].open();
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0])).toEqual({ type: "auth", token: "tok" });
    client.close();
  });

  it("marks open on ready and delivers events", () => {
    const client = new SocketClient(() => 1);
    const seen: string[] = [];
    client.onEvent((e) => seen.push(e.type));
    client.connect("tok");
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.receive({ type: "ready", data: { user_id: 1, device_id: 2 }, ts: "" });
    expect(useSocket.getState().status).toBe("open");
    expect(seen).toEqual(["ready"]);
    client.close();
  });

  it("pings every 25 seconds", () => {
    const client = new SocketClient(() => 1);
    client.connect("tok");
    const ws = FakeWebSocket.instances[0];
    ws.open();
    vi.advanceTimersByTime(25_000);
    expect(ws.sent.map((s) => JSON.parse(s).type)).toEqual(["auth", "ping"]);
    client.close();
  });

  it("reconnects after an abnormal close", () => {
    const client = new SocketClient(() => 1);
    client.connect("tok");
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].serverClose(1006);
    expect(useSocket.getState().status).toBe("connecting");
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    client.close();
  });

  it("does not reconnect after 4401 and signs out", () => {
    const client = new SocketClient(() => 1);
    client.connect("tok");
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].serverClose(4401);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(useAuth.getState().token).toBeNull();
  });

  it("does not reconnect after an intentional close", () => {
    const client = new SocketClient(() => 1);
    client.connect("tok");
    FakeWebSocket.instances[0].open();
    client.close();
    FakeWebSocket.instances[0].serverClose(1000);
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(useSocket.getState().status).toBe("closed");
  });
});
