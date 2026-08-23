import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoothOperatorClient } from "./boothPlatform";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 0;
  readonly url: string;
  private listeners = new Map<string, Set<EventListener>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    this.url = url;
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
    this.readyState = 3;
    this.emit("close", new Event("close"));
  }

  open() {
    this.readyState = 1;
    this.emit("open", new Event("open"));
  }

  receive(text: string) {
    this.emit("message", { data: text } as MessageEvent);
  }

  private emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("createBoothOperatorClient", () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.stubGlobal("WebSocket", OriginalWebSocket);
  });

  it("waits for booth.hello.ok before connect resolves", async () => {
    let helloOk = false;
    const client = createBoothOperatorClient({
      operatorCap: "pg_op_test_cap",
      shellId: "op-test",
      onSnapshot: vi.fn(),
      onHelloOk: () => {
        helloOk = true;
      },
    });

    const pending = client.connect();
    const sock = MockWebSocket.instances[0];
    expect(sock.url).toContain("role=operator");
    expect(sock.url).toContain("cap=pg_op_test_cap");

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    sock.open();
    await Promise.resolve();
    expect(settled).toBe(false);

    sock.receive(
      JSON.stringify({
        type: "booth.hello.ok",
        v: 1,
        sessionId: "sess-1",
        director: { shellId: "op-test", role: "operator" },
      })
    );
    await pending;
    expect(helloOk).toBe(true);
    expect(settled).toBe(true);
  });

  it("rejects when engine is offline", async () => {
    const client = createBoothOperatorClient({
      operatorCap: "pg_op_test_cap",
      shellId: "op-test",
      onSnapshot: vi.fn(),
      onEngineOffline: vi.fn(),
    });

    const pending = client.connect();
    const sock = MockWebSocket.instances[0];
    sock.open();
    sock.receive(JSON.stringify({ type: "booth.event.engine.offline", v: 1 }));
    await expect(pending).rejects.toThrow("engine_offline");
  });
});
