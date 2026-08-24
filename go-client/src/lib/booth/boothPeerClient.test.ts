import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createBoothPeerClient } from "./boothPeerClient";
import { registerEmbeddedPeerSignalHost } from "./boothPeerSignal";

vi.mock("@pg/roster/rosterPeer", () => ({
  createRosterOffer: vi.fn(async () => ({
    wire: "mock-offer-wire",
    session: {
      pc: { close: vi.fn() },
      getChannel: () => null,
      role: "host",
      close: vi.fn(),
      send: vi.fn(),
    },
  })),
  applyRosterAnswer: vi.fn(async () => {}),
}));

describe("boothPeerClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "BroadcastChannel",
      class MockBroadcastChannel {
        static channels = new Map<string, Set<MockBroadcastChannel>>();
        name: string;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        closed = false;

        constructor(name: string) {
          this.name = name;
          if (!MockBroadcastChannel.channels.has(name)) {
            MockBroadcastChannel.channels.set(name, new Set());
          }
          MockBroadcastChannel.channels.get(name)!.add(this);
        }

        postMessage(data: unknown) {
          const peers = MockBroadcastChannel.channels.get(this.name);
          if (!peers) return;
          for (const peer of peers) {
            if (peer === this || peer.closed) continue;
            peer.onmessage?.({ data } as MessageEvent);
          }
        }

        addEventListener(_type: string, listener: (ev: MessageEvent) => void) {
          this.onmessage = listener;
        }

        removeEventListener() {
          this.onmessage = null;
        }

        close() {
          this.closed = true;
          MockBroadcastChannel.channels.get(this.name)?.delete(this);
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("joins embedded hub via BroadcastChannel", async () => {
    registerEmbeddedPeerSignalHost({
      getHubSessionId: () => "sess-1",
      validatePeerCap: (cap) => cap === "pg_peer_ok",
      acceptPeerOffer: async () => ({
        answerWire: "mock-answer",
        peerId: "peer-1",
      }),
    });

    const client = createBoothPeerClient({
      peerCap: "pg_peer_ok",
      embeddedHubSessionId: "sess-1",
      localPresence: { agentId: "agent-1", name: "Cam" },
      handlers: {},
    });

    const out = await client.join();
    expect(out.peerId).toBe("peer-1");
  });

  it("requires embedded hub session id", () => {
    expect(() =>
      createBoothPeerClient({
        peerCap: "pg_peer_ok",
        embeddedHubSessionId: "  ",
        localPresence: { agentId: "a", name: "n" },
        handlers: {},
      })
    ).toThrow("embedded_hub_required");
  });

  it("surfaces embedded signal rejection", async () => {
    registerEmbeddedPeerSignalHost({
      getHubSessionId: () => "sess-1",
      validatePeerCap: () => false,
      acceptPeerOffer: async () => ({
        answerWire: "mock-answer",
        peerId: "peer-1",
      }),
    });

    const client = createBoothPeerClient({
      peerCap: "pg_peer_bad",
      embeddedHubSessionId: "sess-1",
      localPresence: { agentId: "a", name: "n" },
      handlers: {},
    });

    await expect(client.join()).rejects.toThrow("peer_gone");
  });
});
