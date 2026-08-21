import { describe, expect, it, vi } from "vitest";
import { SESSION_MESH_TYPE } from "@pg/roster/rosterSessionMesh";
import { createRoomMeshClient } from "./goRoomMeshClient";

function mockSession(overrides?: { sendBinary?: (b: ArrayBuffer) => void }) {
  const ch = {
    readyState: "open" as const,
    bufferedAmount: 0,
    send: overrides?.sendBinary ?? vi.fn(),
  };
  return {
    send: vi.fn(),
    close: vi.fn(),
    getChannel: () => ch,
    pc: {} as RTCPeerConnection,
    role: "host" as const,
  };
}

describe("createRoomMeshClient", () => {
  it("offers when local agentId is smaller and applies the answer", async () => {
    const toHost: unknown[] = [];
    const session = mockSession();
    const createOffer = vi.fn(
      async (opts: { handlers?: { onChannelOpen?: () => void } }) => {
        opts.handlers?.onChannelOpen?.();
        return { session, wire: "offer-wire" };
      }
    );
    const acceptOffer = vi.fn();
    const applyAnswer = vi.fn(async () => {});
    const opened: string[] = [];
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: (msg) => toHost.push(msg),
      createOffer,
      acceptOffer,
      applyAnswer,
      onDirectOpen: (peerId) => opened.push(peerId),
    });

    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(createOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: "signal",
        media: "ready",
        localPresence: { agentId: "g-a", name: "甲" },
      })
    );
    expect(toHost).toContainEqual({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
      to: "g-b",
      sdp: "offer-wire",
    });

    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "answer",
      from: "g-b",
      to: "g-a",
      sdp: "answer-wire",
    });
    expect(applyAnswer).toHaveBeenCalledWith(session, "answer-wire");
    expect(opened).toEqual(["g-b"]);
  });

  it("answers when local agentId is larger and does not glare-offer", async () => {
    const toHost: unknown[] = [];
    const session = mockSession();
    const createOffer = vi.fn();
    const acceptOffer = vi.fn(async () => ({
      session,
      wire: "answer-wire",
    }));
    const applyAnswer = vi.fn();
    const client = createRoomMeshClient({
      localAgentId: "g-b",
      localName: "乙",
      sendToHost: (msg) => toHost.push(msg),
      createOffer,
      acceptOffer,
      applyAnswer,
    });

    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-a",
    });
    expect(createOffer).not.toHaveBeenCalled();

    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
      to: "g-b",
      sdp: "offer-wire",
    });
    expect(acceptOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        offerWire: "offer-wire",
        transport: "signal",
        media: "ready",
      })
    );
    expect(toHost).toContainEqual({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "answer",
      from: "g-b",
      to: "g-a",
      sdp: "answer-wire",
    });
  });

  it("sends fail and falls back when the offer cannot be built", async () => {
    const toHost: unknown[] = [];
    const createOffer = vi.fn(async () => {
      throw new Error("ICE gathering timeout");
    });
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: (msg) => toHost.push(msg),
      createOffer,
      acceptOffer: vi.fn(),
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(toHost).toContainEqual({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "fail",
      from: "g-a",
      to: "g-b",
    });
    expect(client.hasDirect("g-b")).toBe(false);
  });

  it("does not re-offer the same peer after a failed attempt", async () => {
    const createOffer = vi.fn(async () => {
      throw new Error("ICE gathering timeout");
    });
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: () => {},
      createOffer,
      acceptOffer: vi.fn(),
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(createOffer).toHaveBeenCalledTimes(1);
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(createOffer).toHaveBeenCalledTimes(1);
    expect(client.knownPeerIds()).toEqual(["g-b"]);
    expect(client.hasDirect("g-b")).toBe(false);
  });

  it("ignores a late offer from a peer already marked failed", async () => {
    const createOffer = vi.fn(async () => {
      throw new Error("ICE gathering timeout");
    });
    const acceptOffer = vi.fn();
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: () => {},
      createOffer,
      acceptOffer,
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "offer",
      from: "g-b",
      to: "g-a",
      sdp: "late-wire",
    });
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  it("does not redial after the remote reports fail", async () => {
    const createOffer = vi.fn();
    const acceptOffer = vi.fn();
    const client = createRoomMeshClient({
      localAgentId: "g-b",
      localName: "乙",
      sendToHost: () => {},
      createOffer,
      acceptOffer,
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-a",
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "fail",
      from: "g-a",
      to: "g-b",
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
      to: "g-b",
      sdp: "retry-wire",
    });
    expect(acceptOffer).not.toHaveBeenCalled();
  });

  it("allows a fresh attempt after bye then hello (new presence)", async () => {
    const createOffer = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail once"))
      .mockImplementationOnce(
        async (opts: { handlers?: { onChannelOpen?: () => void } }) => {
          const session = mockSession();
          opts.handlers?.onChannelOpen?.();
          return { session, wire: "offer-2" };
        }
      );
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: () => {},
      createOffer,
      acceptOffer: vi.fn(),
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(createOffer).toHaveBeenCalledTimes(1);
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "bye",
      peerId: "g-b",
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(createOffer).toHaveBeenCalledTimes(2);
    expect(client.hasDirect("g-b")).toBe(true);
  });

  it("does not redial after an open mesh channel closes", async () => {
    let onClose: (() => void) | undefined;
    const createOffer = vi.fn(
      async (opts: {
        handlers?: { onChannelOpen?: () => void; onChannelClose?: () => void };
      }) => {
        onClose = opts.handlers?.onChannelClose;
        opts.handlers?.onChannelOpen?.();
        return { session: mockSession(), wire: "offer-wire" };
      }
    );
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: () => {},
      createOffer,
      acceptOffer: vi.fn(),
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(client.hasDirect("g-b")).toBe(true);
    onClose?.();
    expect(client.hasDirect("g-b")).toBe(false);
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(createOffer).toHaveBeenCalledTimes(1);
  });

  it("does not tear down an open mesh on transient disconnected", async () => {
    let onConn: ((state: RTCPeerConnectionState) => void) | undefined;
    const createOffer = vi.fn(
      async (opts: {
        handlers?: {
          onChannelOpen?: () => void;
          onConnectionState?: (state: RTCPeerConnectionState) => void;
        };
      }) => {
        onConn = opts.handlers?.onConnectionState;
        opts.handlers?.onChannelOpen?.();
        return { session: mockSession(), wire: "offer-wire" };
      }
    );
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: () => {},
      createOffer,
      acceptOffer: vi.fn(),
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(client.hasDirect("g-b")).toBe(true);
    onConn?.("disconnected");
    expect(client.hasDirect("g-b")).toBe(true);
    expect(client.directPeerIds()).toEqual(["g-b"]);
    onConn?.("connected");
    expect(client.hasDirect("g-b")).toBe(true);
    onConn?.("failed");
    expect(client.hasDirect("g-b")).toBe(false);
  });

  it("lists open mesh peer ids for the roster cue", async () => {
    const createOffer = vi.fn(
      async (opts: { handlers?: { onChannelOpen?: () => void } }) => {
        opts.handlers?.onChannelOpen?.();
        return { session: mockSession(), wire: "offer-wire" };
      }
    );
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: () => {},
      createOffer,
      acceptOffer: vi.fn(),
      applyAnswer: vi.fn(),
    });
    expect(client.directPeerIds()).toEqual([]);
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    expect(client.directPeerIds()).toEqual(["g-b"]);
  });

  it("sends binary on an open mesh DataChannel", async () => {
    const bins: ArrayBuffer[] = [];
    const session = mockSession({
      sendBinary: (b) => bins.push(b),
    });
    const createOffer = vi.fn(async (opts: { handlers?: { onChannelOpen?: () => void } }) => {
      opts.handlers?.onChannelOpen?.();
      return { session, wire: "offer-wire" };
    });
    const client = createRoomMeshClient({
      localAgentId: "g-a",
      localName: "甲",
      sendToHost: () => {},
      createOffer,
      acceptOffer: vi.fn(),
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-b",
    });
    const buf = new Uint8Array([1, 2]).buffer;
    expect(client.sendBinary("g-b", buf)).toBe(true);
    expect(bins).toHaveLength(1);
    expect(client.sendBinary("g-missing", buf)).toBe(false);
  });

  it("tracks introduced peers even when the local id does not offer", async () => {
    const client = createRoomMeshClient({
      localAgentId: "g-b",
      localName: "乙",
      sendToHost: () => {},
      createOffer: vi.fn(),
      acceptOffer: vi.fn(),
      applyAnswer: vi.fn(),
    });
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "hello",
      peerId: "g-a",
    });
    expect(client.knownPeerIds()).toEqual(["g-a"]);
    await client.onHostMessage({
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "bye",
      peerId: "g-a",
    });
    expect(client.knownPeerIds()).toEqual([]);
  });
});
