import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  BOOTH_PEER_SIGNAL_CHANNEL,
  joinEmbeddedHubViaSignal,
  registerEmbeddedPeerSignalHost,
} from "./boothPeerSignal";

describe("boothPeerSignal", () => {
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
          if (this.closed) return;
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
  });

  it("relays offer to host and returns answer", async () => {
    const dispose = registerEmbeddedPeerSignalHost({
      getHubSessionId: () => "hub-1",
      validatePeerCap: (cap) => cap === "pg_peer_test",
      acceptPeerOffer: async (wire, label) => ({
        answerWire: `answer:${wire}:${label ?? ""}`,
        peerId: "peer-abc",
      }),
    });

    const out = await joinEmbeddedHubViaSignal({
      peerCap: "pg_peer_test",
      hubSessionId: "hub-1",
      offerWire: "offer-wire",
      label: "cam-a",
    });

    expect(out.answerWire).toBe("answer:offer-wire:cam-a");
    expect(out.peerId).toBe("peer-abc");
    dispose();
  });

  it("rejects invalid peerCap", async () => {
    registerEmbeddedPeerSignalHost({
      getHubSessionId: () => "hub-1",
      validatePeerCap: () => false,
      acceptPeerOffer: async () => ({
        answerWire: "x",
        peerId: "y",
      }),
    });

    await expect(
      joinEmbeddedHubViaSignal({
        peerCap: "bad",
        hubSessionId: "hub-1",
        offerWire: "offer",
      })
    ).rejects.toThrow("peer_gone");
  });

  it("ignores offers for other hub sessions", async () => {
    registerEmbeddedPeerSignalHost({
      getHubSessionId: () => "hub-host",
      validatePeerCap: () => true,
      acceptPeerOffer: async () => ({
        answerWire: "answer",
        peerId: "peer",
      }),
    });

    await expect(
      joinEmbeddedHubViaSignal({
        peerCap: "pg_peer_test",
        hubSessionId: "other-hub",
        offerWire: "offer",
        timeoutMs: 200,
      })
    ).rejects.toThrow("embedded_signal_timeout");
  });

  it("uses shared channel name", () => {
    expect(BOOTH_PEER_SIGNAL_CHANNEL).toMatch(/pg-booth-peer/);
  });
});
