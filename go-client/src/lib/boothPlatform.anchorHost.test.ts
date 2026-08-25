import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoothAnchorHost } from "./boothPlatform";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = MockWebSocket.CONNECTING;
  readonly url: string;
  private listeners = new Map<string, Set<EventListener>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener, _opts?: unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(_data: string) {
    /* noop */
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", new Event("close"));
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", new Event("open"));
  }

  private emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const handlers = {
  getSnapshot: () => ({
    sessionId: "sess-1",
    ownerUserId: "u1",
    engineMode: "embedded" as const,
    hostPeerId: "host-1",
    hostDisplayName: "Host",
    members: [],
    inviteGate: "none" as const,
    guestCount: 0,
    anchor: "online" as const,
  }),
  localHostClaimsDirector: () => true,
  getLocalPresence: () => ({ agentId: "host-1", name: "Host" }),
  onOperatorIntent: vi.fn(),
  onGuestJoinOffer: vi.fn(),
};

async function waitForSocket(): Promise<MockWebSocket> {
  for (let i = 0; i < 20; i += 1) {
    if (MockWebSocket.instances.length > 0) {
      return MockWebSocket.instances.at(-1)!;
    }
    await Promise.resolve();
  }
  throw new Error("socket_not_created");
}

describe("createBoothAnchorHost reconnect", () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          boothSessionId: "sess-1",
          anchorSecret: "pg_ba_secret",
          wsUrl: "https://api.test/v1/booth/ws?role=engine",
        }),
      })
    );
  });

  afterEach(() => {
    vi.stubGlobal("WebSocket", OriginalWebSocket);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reconnects websocket after unexpected close", async () => {
    vi.useFakeTimers();
    const host = createBoothAnchorHost(handlers, {
      apiKey: "pg_sk_test",
      boothSessionId: "sess-1",
    });

    const pending = host.start();
    const first = await waitForSocket();
    first.open();
    await pending;
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(first.url).toContain("anchor_secret=pg_ba_secret");

    first.close();
    await vi.advanceTimersByTimeAsync(1000);
    const second = await waitForSocket();
    second.open();

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(second.url).toContain("anchor_secret=pg_ba_secret");

    await host.stop();
  });

  it("ensureConnected opens a socket when the previous one closed", async () => {
    const host = createBoothAnchorHost(handlers, {
      apiKey: "pg_sk_test",
      boothSessionId: "sess-1",
    });

    const pending = host.start();
    const first = await waitForSocket();
    first.open();
    await pending;
    first.close();
    expect(MockWebSocket.instances).toHaveLength(1);

    const reconnecting = host.ensureConnected();
    const second = await waitForSocket();
    expect(second).not.toBe(first);
    second.open();
    await reconnecting;
    expect(MockWebSocket.instances).toHaveLength(2);

    await host.stop();
  });
});
