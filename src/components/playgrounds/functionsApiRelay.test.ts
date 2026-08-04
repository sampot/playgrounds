import { afterEach, describe, expect, it } from "vitest";
import {
  FUNCTIONS_API_CHANNEL,
  FUNCTIONS_API_FORWARD,
  FunctionsApiRelay,
  setFunctionsApiChannelFactory,
  type FunctionsApiForwardMessage,
} from "./functionsApiRelay";

type Handler = (ev: { data: unknown }) => void;

function createLinkedBroadcastFactory(): (name: string) => BroadcastChannel {
  const rooms = new Map<
    string,
    Set<{
      postMessage: (d: unknown) => void;
      onmessage: Handler | null;
      close: () => void;
    }>
  >();
  return (name: string) => {
    const peers = rooms.get(name) ?? new Set();
    rooms.set(name, peers);
    const ch = {
      onmessage: null as Handler | null,
      postMessage(data: unknown) {
        for (const p of peers) {
          if (p === ch) continue;
          p.onmessage?.({ data });
        }
      },
      close() {
        peers.delete(ch);
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
      name,
    };
    peers.add(ch);
    return ch as unknown as BroadcastChannel;
  };
}

afterEach(() => {
  setFunctionsApiChannelFactory(null);
});

describe("FunctionsApiRelay", () => {
  it("follower forward → Leader execute → result", async () => {
    setFunctionsApiChannelFactory(createLinkedBroadcastFactory());
    let leaderEpoch = 1;
    const leader = new FunctionsApiRelay({
      peerId: "L",
      getStatus: () => ({
        epoch: leaderEpoch,
        canDrain: true,
        isLeader: true,
      }),
      execute: async (fwd: FunctionsApiForwardMessage) => ({
        response: {
          status: 200,
          statusText: "OK",
          headers: [["content-type", "text/plain"]],
          body: new TextEncoder().encode(`ok:${fwd.sandboxId}`).buffer,
        },
      }),
      timeoutMs: 2000,
    });
    const follower = new FunctionsApiRelay({
      peerId: "F",
      getStatus: () => ({
        epoch: leaderEpoch,
        canDrain: false,
        isLeader: false,
      }),
      execute: async () => {
        throw new Error("follower must not execute");
      },
      timeoutMs: 2000,
    });
    leader.start();
    follower.start();

    const result = await follower.forward({
      requestId: "r1",
      sandboxId: "sb",
      leaderEpoch,
      request: {
        method: "GET",
        url: "http://x/api/ping",
        headers: [],
        body: null,
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.leaderPeerId).toBe("L");
    expect(result.response?.status).toBe(200);
    const text = new TextDecoder().decode(result.response!.body!);
    expect(text).toBe("ok:sb");

    leader.stop();
    follower.stop();
  });

  it("epoch_mismatch when Leader epoch differs", async () => {
    setFunctionsApiChannelFactory(createLinkedBroadcastFactory());
    const leader = new FunctionsApiRelay({
      peerId: "L",
      getStatus: () => ({ epoch: 9, canDrain: true, isLeader: true }),
      execute: async () => {
        throw new Error("should not run");
      },
      timeoutMs: 1000,
    });
    const follower = new FunctionsApiRelay({
      peerId: "F",
      getStatus: () => ({ epoch: 1, canDrain: false, isLeader: false }),
      execute: async () => ({
        error: { code: "functions_error" as const },
      }),
      timeoutMs: 1000,
    });
    leader.start();
    follower.start();

    const result = await follower.forward({
      requestId: "r2",
      sandboxId: "sb",
      leaderEpoch: 1,
      request: {
        method: "GET",
        url: "http://x/api",
        headers: [],
        body: null,
      },
    });
    expect(result.error?.code).toBe("epoch_mismatch");

    leader.stop();
    follower.stop();
  });

  it("follower does not execute when not leader", async () => {
    setFunctionsApiChannelFactory(createLinkedBroadcastFactory());
    let executed = 0;
    const a = new FunctionsApiRelay({
      peerId: "A",
      getStatus: () => ({ epoch: 1, canDrain: false, isLeader: false }),
      execute: async () => {
        executed += 1;
        return {
          response: {
            status: 200,
            statusText: "OK",
            headers: [],
            body: null,
          },
        };
      },
      timeoutMs: 80,
    });
    const b = new FunctionsApiRelay({
      peerId: "B",
      getStatus: () => ({ epoch: 1, canDrain: false, isLeader: false }),
      execute: async () => {
        executed += 1;
        return {
          response: {
            status: 200,
            statusText: "OK",
            headers: [],
            body: null,
          },
        };
      },
      timeoutMs: 80,
    });
    a.start();
    b.start();
    const result = await a.forward({
      requestId: "r3",
      sandboxId: "sb",
      leaderEpoch: 1,
      request: {
        method: "GET",
        url: "http://x/api",
        headers: [],
        body: null,
      },
    });
    expect(executed).toBe(0);
    expect(result.error?.code).toBe("timeout");
    a.stop();
    b.stop();
  });

  it("channel name is stable", () => {
    expect(FUNCTIONS_API_CHANNEL).toBe("playgrounds-agent-functions-api");
    expect(FUNCTIONS_API_FORWARD).toBe("playgrounds-functions-api-forward");
  });
});
