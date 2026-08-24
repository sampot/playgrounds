import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoothControlChannel } from "./boothControlChannel";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 0;
  readonly url: string;
  private listeners = new Map<string, Set<EventListener>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    const frame = JSON.parse(data) as { type?: string; id?: string };
    if (frame.type === "booth.hello") {
      this.receive(
        JSON.stringify({
          type: "booth.state.snapshot",
          v: 1,
          sessionId: "sess-daemon",
          ownerUserId: "user-1",
          engineMode: "daemon",
          members: [],
          inviteGate: "none",
          shareFileCount: 0,
          guestCount: 0,
          anchor: "online",
        })
      );
      return;
    }
    if (frame.type === "booth.intent.invite.mint" && frame.id) {
      this.receive(
        JSON.stringify({
          type: "booth.ack",
          v: 1,
          id: frame.id,
          ok: true,
        })
      );
    }
  }

  close() {
    this.readyState = 3;
    this.emit("close", new Event("close"));
  }

  open() {
    this.readyState = 1;
    this.emit("open", new Event("open"));
  }

  receive(text: string) {
    const event = { data: text } as MessageEvent;
    this.emit("message", event);
    if (typeof (this as { onmessage?: ((ev: MessageEvent) => void) | null }).onmessage === "function") {
      (this as { onmessage?: ((ev: MessageEvent) => void) | null }).onmessage!(event);
    }
  }

  private emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("createBoothControlChannel", () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    (MockWebSocket as unknown as { OPEN: number }).OPEN = 1;
  });

  afterEach(() => {
    vi.stubGlobal("WebSocket", OriginalWebSocket);
  });

  it("hello handshake returns daemon snapshot", async () => {
    const channel = createBoothControlChannel({
      wsUrl: "ws://127.0.0.1:7847/booth/control?token=t",
      shellId: "browser-shell",
      role: "host",
    });
    const pending = channel.connect();
    const sock = MockWebSocket.instances[0];
    sock.open();
    const out = await pending;
    expect(out.sessionId).toBe("sess-daemon");
    expect(out.snapshot.engineMode).toBe("daemon");
  });

  it("dispatch resolves booth.ack", async () => {
    const channel = createBoothControlChannel({
      wsUrl: "ws://127.0.0.1:7847/booth/control?token=t",
      shellId: "browser-shell",
      role: "host",
    });
    const pending = channel.connect();
    MockWebSocket.instances[0].open();
    await pending;
    const ack = await channel.dispatch({ type: "invite.mint" });
    expect(ack).toEqual({ ok: true });
  });
});
