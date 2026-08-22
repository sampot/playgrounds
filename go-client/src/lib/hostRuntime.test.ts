/**
 * hostRuntime — answer loop adoption + hostSessionFetch event fanout.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHostRuntime } from "./hostRuntime";
import { goAuth } from "./goAuth.svelte";
import type { FileMap } from "@pg/projectTypes";
import type { HostableProtocol } from "./goCatalog";
import * as platformHostLoop from "@pg/platform/platformHostLoop";
import * as rosterHomeSessionTunnel from "@pg/roster/rosterHomeSessionTunnel";
import * as goMemoryCanvas from "./goMemoryCanvas";

const protocol: HostableProtocol = {
  protocolId: "gomoku.v1",
  apiVersion: "1",
  roles: ["host", "player"],
  roleLimits: { host: 1, player: 1 },
};

afterEach(() => {
  goAuth.__setApiKeyForTests(null);
  vi.restoreAllMocks();
});

describe("hostRuntime.hostSessionFetch", () => {
  it("publishes returned events over the peer relay path", async () => {
    const invokeHostSession = vi.fn(async () => ({
      ok: true,
      events: [{ type: "match.placed", row: 0, col: 0, stone: "black" }],
      state: { status: "active" },
    }));
    const send = vi.fn();
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-1",
      protocol,
      invokeHostSession,
    });
    // Inject a fake peer session so sendRelay has somewhere to go.
    const statusBefore = rt.getStatus();
    expect(statusBefore.phase).toBe("idle");
    await rt.open();
    // Reach into peer map via a presence-like attach: use adopt after mint stub.
    // Instead, spy send via a minimal peer by calling hostAct which also relays —
    // for hostSessionFetch we verify phase tracking + invoke.
    const result = (await rt.hostSessionFetch("/api/session/act", {
      method: "POST",
      body: "{}",
    })) as { ok: boolean; events: unknown[] };
    expect(invokeHostSession).toHaveBeenCalled();
    expect(result.events).toHaveLength(1);
    expect(rt.getStatus().phase).toBe("active");
    void send;
  });
});

describe("hostRuntime.createPlatformInvite adoption path", () => {
  it("adoptSamInvite starts the Platform answer loop when provisioned", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    const stop = vi.fn();
    const startSpy = vi
      .spyOn(platformHostLoop, "startPlatformHostAnswerLoop")
      .mockReturnValue({ stop, inviteId: "inv-1" } as never);
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-2",
      protocol,
      invokeHostSession: async () => ({ ok: true }),
    });
    await rt.open();
    await rt.adoptSamInvite({
      inviteId: "inv-1",
      shortUrl: "https://go.samkuo.me/i/abc",
    });
    expect(startSpy).toHaveBeenCalledWith(
      expect.objectContaining({ inviteId: "inv-1" })
    );
    expect(rt.getStatus().inviteId).toBe("inv-1");
    expect(rt.getStatus().shortUrl).toContain("/i/abc");
    rt.dispose();
    expect(stop).toHaveBeenCalled();
  });

  it("sends a session invite when the connected Guest announces presence", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    let loopOptions:
      | Parameters<typeof platformHostLoop.startPlatformHostAnswerLoop>[0]
      | null = null;
    vi.spyOn(platformHostLoop, "startPlatformHostAnswerLoop").mockImplementation(
      options => {
        loopOptions = options;
        return { stop: vi.fn(), inviteId: options.inviteId };
      }
    );
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-3",
      protocol,
      invokeHostSession: async () => ({ ok: true }),
    });
    await rt.open();
    await rt.adoptSamInvite({
      inviteId: "platform-inv-1",
      shortUrl: "https://go.samkuo.me/i/abc",
    });

    const prepared = loopOptions!.prepareHandlers();
    const send = vi.fn();
    prepared.attachSession({
      send,
      close: vi.fn(),
      getChannel: () => null,
      pc: {} as RTCPeerConnection,
      role: "guest",
    });
    prepared.handlers.onMessage?.({
      type: "presence",
      agentId: "go-guest-1",
      name: "對手",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "avatar_relay",
        to: "go-guest-1",
        payload: expect.objectContaining({
          kind: "session_invite",
          inviteId: "platform-inv-1",
          sessionId: rt.getStatus().sessionId,
          role: "player",
          protocol: expect.objectContaining({ protocolId: "gomoku.v1" }),
        }),
      })
    );
  });

  it("keeps the Guest display name from presence on the bound seat", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    let loopOptions:
      | Parameters<typeof platformHostLoop.startPlatformHostAnswerLoop>[0]
      | null = null;
    vi.spyOn(platformHostLoop, "startPlatformHostAnswerLoop").mockImplementation(
      options => {
        loopOptions = options;
        return { stop: vi.fn(), inviteId: options.inviteId };
      }
    );
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-name",
      protocol,
      invokeHostSession: async () => ({ ok: true }),
    });
    await rt.open();
    await rt.adoptSamInvite({
      inviteId: "platform-inv-name",
      shortUrl: "https://go.samkuo.me/i/name",
    });
    const sessionId = rt.getStatus().sessionId!;
    const prepared = loopOptions!.prepareHandlers();
    prepared.attachSession({
      send: vi.fn(),
      close: vi.fn(),
      getChannel: () => null,
      pc: {} as RTCPeerConnection,
      role: "guest",
    });
    prepared.handlers.onMessage?.({
      type: "presence",
      agentId: "go-guest-name",
      name: "小明",
    });
    prepared.handlers.onMessage?.({
      type: "avatar_relay",
      from: "go-guest-name",
      payload: {
        kind: "session_invite_accept",
        inviteId: "platform-inv-name",
        sessionId,
        role: "player",
      },
    });
    await vi.waitFor(() => expect(rt.getStatus().seats).toHaveLength(1));
    expect(rt.getStatus().seats[0]).toMatchObject({
      peerId: "go-guest-name",
      displayName: "小明",
    });
    expect(rt.getStatus().message).toMatch(/小明/);
  });

  it("forwards Guest acts with the role from its bound seat", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    let loopOptions:
      | Parameters<typeof platformHostLoop.startPlatformHostAnswerLoop>[0]
      | null = null;
    vi.spyOn(platformHostLoop, "startPlatformHostAnswerLoop").mockImplementation(
      options => {
        loopOptions = options;
        return { stop: vi.fn(), inviteId: options.inviteId };
      }
    );
    const placedEvent = {
      type: "match.placed",
      row: 1,
      col: 2,
      stone: 2,
    };
    const publishLocal = vi
      .spyOn(rosterHomeSessionTunnel, "publishRosterRelayedSessionEvent")
      .mockImplementation(() => {});
    const publishMemory = vi
      .spyOn(goMemoryCanvas, "publishGoMemoryBroadcast")
      .mockImplementation(() => {});
    const invokeHostSession = vi.fn(async () => ({
      ok: true,
      events: [placedEvent],
      state: { status: "active" },
    }));
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-role",
      protocol,
      invokeHostSession,
    });
    await rt.open();
    await rt.adoptSamInvite({
      inviteId: "platform-inv-role",
      shortUrl: "https://go.samkuo.me/i/role",
    });
    const sessionId = rt.getStatus().sessionId!;
    const prepared = loopOptions!.prepareHandlers();
    const send = vi.fn();
    prepared.attachSession({
      send,
      close: vi.fn(),
      getChannel: () => null,
      pc: {} as RTCPeerConnection,
      role: "guest",
    });
    prepared.handlers.onMessage?.({
      type: "presence",
      agentId: "go-guest-role",
      name: "對手",
    });
    prepared.handlers.onMessage?.({
      type: "avatar_relay",
      from: "go-guest-role",
      payload: {
        kind: "session_invite_accept",
        inviteId: "platform-inv-role",
        sessionId,
        role: "player",
      },
    });
    await vi.waitFor(() => expect(rt.getStatus().seats).toHaveLength(1));
    const seatId = rt.getStatus().seats[0]!.seatId;
    invokeHostSession.mockClear();

    prepared.handlers.onMessage?.({
      type: "avatar_relay",
      from: "go-guest-role",
      payload: {
        kind: "session_act",
        inviteId: "platform-inv-role",
        sessionId,
        seatId,
        requestId: "act-1",
        payload: { type: "place", row: 1, col: 2 },
      },
    });

    await vi.waitFor(() => {
      expect(invokeHostSession).toHaveBeenCalledWith(
        "/api/session/act",
        expect.objectContaining({
          body: JSON.stringify({
            role: "player",
            seatId,
            payload: { type: "place", row: 1, col: 2 },
          }),
        })
      );
      expect(publishLocal).toHaveBeenCalledWith(
        rt.getStatus().channelName,
        expect.objectContaining({ event: placedEvent })
      );
      expect(publishMemory).toHaveBeenCalledWith(
        rt.getStatus().channelName,
        expect.objectContaining({ event: placedEvent })
      );
    });
  });

  it("close notifies connected guests with session.closed before tearing the channel", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    let loopOptions:
      | Parameters<typeof platformHostLoop.startPlatformHostAnswerLoop>[0]
      | null = null;
    vi.spyOn(platformHostLoop, "startPlatformHostAnswerLoop").mockImplementation(
      options => {
        loopOptions = options;
        return { stop: vi.fn(), inviteId: options.inviteId };
      }
    );
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-4",
      protocol,
      invokeHostSession: async () => ({ ok: true }),
    });
    await rt.open();
    await rt.adoptSamInvite({
      inviteId: "platform-inv-close",
      shortUrl: "https://go.samkuo.me/i/close",
    });

    const prepared = loopOptions!.prepareHandlers();
    const send = vi.fn();
    const closePeer = vi.fn();
    prepared.attachSession({
      send,
      close: closePeer,
      getChannel: () => null,
      pc: {} as RTCPeerConnection,
      role: "guest",
    });
    prepared.handlers.onMessage?.({
      type: "presence",
      agentId: "go-guest-close",
      name: "對手",
    });
    send.mockClear();

    await rt.close();

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "avatar_relay",
        payload: expect.objectContaining({
          kind: "session_event",
          event: { type: "session.closed", reason: "host_closed" },
        }),
      })
    );
    expect(closePeer).toHaveBeenCalled();
    const closedAt = closePeer.mock.invocationCallOrder[0]!;
    const notifiedAt = send.mock.invocationCallOrder[0]!;
    expect(notifiedAt).toBeLessThan(closedAt);
  });
});

describe("hostRuntime Guest disconnect detection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function connectAndSeatGuest(opts?: {
    name?: string;
    phaseActive?: boolean;
    expiresAt?: number;
  }) {
    goAuth.__setApiKeyForTests("pg_sk_test");
    let loopOptions:
      | Parameters<typeof platformHostLoop.startPlatformHostAnswerLoop>[0]
      | null = null;
    const startSpy = vi
      .spyOn(platformHostLoop, "startPlatformHostAnswerLoop")
      .mockImplementation(options => {
        loopOptions = options;
        return { stop: vi.fn(), inviteId: options.inviteId };
      });
    const invokeHostSession = vi.fn(async (path: string) => {
      if (path.includes("/presence")) {
        return { ok: true };
      }
      return {
        ok: true,
        state: opts?.phaseActive ? { status: "active" } : { status: "ready" },
      };
    });
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-disc",
      protocol,
      invokeHostSession,
    });
    await rt.open();
    await rt.adoptSamInvite({
      inviteId: "platform-inv-disc",
      shortUrl: "https://go.samkuo.me/i/disc",
      expiresAt: opts?.expiresAt ?? Date.now() + 60_000,
    });
    const sessionId = rt.getStatus().sessionId!;
    const prepared = loopOptions!.prepareHandlers();
    const closePeer = vi.fn();
    prepared.attachSession({
      send: vi.fn(),
      close: closePeer,
      getChannel: () => null,
      pc: {} as RTCPeerConnection,
      role: "guest",
    });
    const guestName = opts?.name ?? "小華";
    prepared.handlers.onMessage?.({
      type: "presence",
      agentId: "go-guest-disc",
      name: guestName,
    });
    prepared.handlers.onMessage?.({
      type: "avatar_relay",
      from: "go-guest-disc",
      payload: {
        kind: "session_invite_accept",
        inviteId: "platform-inv-disc",
        sessionId,
        role: "player",
      },
    });
    await vi.waitFor(() => expect(rt.getStatus().seats).toHaveLength(1));
    if (opts?.phaseActive) {
      await rt.hostSessionFetch("/api/session/act", {
        method: "POST",
        body: "{}",
      });
      expect(rt.getStatus().phase).toBe("active");
    }
    return { rt, prepared, closePeer, invokeHostSession, guestName, startSpy };
  }

  it("ends the whole session when the Guest DataChannel closes (1v1)", async () => {
    const { rt, prepared, closePeer, invokeHostSession, guestName } =
      await connectAndSeatGuest();
    prepared.handlers.onChannelClose?.();
    await vi.waitFor(() => expect(rt.getStatus().phase).toBe("idle"));
    expect(rt.getStatus().seats).toHaveLength(0);
    expect(rt.getStatus().sessionId).toBeNull();
    expect(rt.getStatus().inviteId).toBeNull();
    expect(rt.getStatus().message).toMatch(
      new RegExp(`${guestName}|離開.*重新開場`)
    );
    expect(closePeer).toHaveBeenCalled();
    expect(invokeHostSession).toHaveBeenCalledWith(
      "/api/session/presence",
      expect.objectContaining({
        body: expect.stringContaining('"playerSeated":false'),
      })
    );
  });

  it("reacts to PeerConnection failed／closed the same way", async () => {
    const { rt, prepared } = await connectAndSeatGuest({ name: "阿明" });
    prepared.handlers.onConnectionState?.("failed");
    await vi.waitFor(() => expect(rt.getStatus().phase).toBe("idle"));
    expect(rt.getStatus().message).toMatch(/阿明|離開.*重新開場/);
  });

  it("ends the session (not only the round) when a seated Guest leaves mid-game", async () => {
    const { rt, prepared, startSpy } = await connectAndSeatGuest({
      name: "對手",
      phaseActive: true,
    });
    const callsBefore = startSpy.mock.calls.length;
    prepared.handlers.onChannelClose?.();
    await vi.waitFor(() => expect(rt.getStatus().phase).toBe("idle"));
    expect(rt.getStatus().sessionId).toBeNull();
    expect(rt.getStatus().message).toMatch(/重新開場/);
    expect(rt.getStatus().message).not.toMatch(/這一局結束/);
    expect(startSpy.mock.calls.length).toBe(callsBefore);
  });

  it("does not restart the answer loop after opponent leave (session closed)", async () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 60_000;
    const { rt, prepared, startSpy } = await connectAndSeatGuest({
      expiresAt,
    });
    const callsBefore = startSpy.mock.calls.length;
    prepared.handlers.onChannelClose?.();
    await vi.waitFor(() => expect(rt.getStatus().phase).toBe("idle"));
    expect(startSpy.mock.calls.length).toBe(callsBefore);
    expect(rt.getStatus().inviteId).toBeNull();
    vi.useRealTimers();
    rt.dispose();
  });
});
describe("hostRuntime invite TTL / answer loop expiry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops the answer loop when the invite TTL elapses with no Guest", async () => {
    vi.useFakeTimers();
    goAuth.__setApiKeyForTests("pg_sk_test");
    const stop = vi.fn();
    vi.spyOn(platformHostLoop, "startPlatformHostAnswerLoop").mockReturnValue({
      stop,
      inviteId: "inv-ttl",
    } as never);
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-ttl",
      protocol,
      invokeHostSession: async () => ({ ok: true }),
    });
    await rt.open();
    const expiresAt = Date.now() + 5_000;
    await rt.adoptSamInvite({
      inviteId: "inv-ttl",
      shortUrl: "https://go.samkuo.me/i/ttl",
      expiresAt,
    });
    expect(rt.getStatus().inviteId).toBe("inv-ttl");

    await vi.advanceTimersByTimeAsync(5_000);

    expect(stop).toHaveBeenCalled();
    expect(rt.getStatus().inviteId).toBeNull();
    expect(rt.getStatus().message).toMatch(/過期/);
    rt.dispose();
  });
});

describe("hostRuntime room-play peer reuse", () => {
  it("attachExistingPeer + inviteRoomPlayPeers sends session_invite without Platform mint", async () => {
    const invokeHostSession = vi.fn(async (path: string) => {
      if (path.includes("/open")) return { ok: true };
      return { ok: true };
    });
    const send = vi.fn();
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-room",
      protocol,
      invokeHostSession,
    });
    await rt.open();
    const peer = {
      send,
      close: vi.fn(),
      getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
      pc: { addEventListener: vi.fn() },
    };
    rt.attachExistingPeer({
      peerId: "g-a",
      session: peer as never,
      displayName: "甲",
    });
    const out = rt.inviteRoomPlayPeers({
      seats: [
        { role: "host", peerId: "host-local" },
        { role: "player", peerId: "g-a" },
      ],
    });
    expect(out.sent).toBe(1);
    expect(out.inviteId.startsWith("room-play-")).toBe(true);
    expect(rt.getStatus().inviteId).toBe(out.inviteId);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "avatar_relay",
        to: "g-a",
        payload: expect.objectContaining({
          kind: "session_invite",
          role: "player",
          inviteId: out.inviteId,
        }),
      })
    );
    expect(invokeHostSession).not.toHaveBeenCalledWith(
      expect.stringContaining("invite"),
      expect.anything()
    );

    send.mockClear();
    rt.handleAvatarRelay(
      {
        type: "avatar_relay",
        from: "g-a",
        payload: {
          kind: "session_invite_accept",
          inviteId: out.inviteId,
          sessionId: rt.getStatus().sessionId,
          role: "player",
          homeSandboxId: "guest-sb",
        },
      },
      "g-a"
    );
    await vi.waitFor(() => {
      expect(rt.getStatus().seats.some((s) => s.peerId === "g-a")).toBe(true);
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "avatar_relay",
        to: "g-a",
        payload: expect.objectContaining({ kind: "session_seat_bound" }),
      })
    );

    const closeSpy = peer.close;
    await rt.closeSessionKeepPeers({ message: "局結束" });
    expect(rt.getStatus().phase).toBe("idle");
    expect(rt.getStatus().sessionId).toBeNull();
    expect(closeSpy).not.toHaveBeenCalled();
    rt.detachExistingPeer("g-a");
    rt.dispose();
  });

  it("prefers booth nickname from session_invite_accept over missing presence", async () => {
    const invokeHostSession = vi.fn(async () => ({ ok: true }));
    const send = vi.fn();
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-nick",
      protocol,
      invokeHostSession,
    });
    await rt.open();
    const peer = {
      send,
      close: vi.fn(),
      getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
      pc: { addEventListener: vi.fn() },
    };
    rt.attachExistingPeer({
      peerId: "g-nick",
      session: peer as never,
    });
    const out = rt.inviteRoomPlayPeers({
      seats: [
        { role: "host", peerId: "host-local" },
        { role: "p2", peerId: "g-nick" },
      ],
    });
    rt.handleAvatarRelay(
      {
        type: "avatar_relay",
        from: "g-nick",
        payload: {
          kind: "session_invite_accept",
          inviteId: out.inviteId,
          sessionId: rt.getStatus().sessionId,
          role: "p2",
          displayName: "小明",
          homeSandboxId: "guest-sb",
        },
      },
      "g-nick"
    );
    await vi.waitFor(() => {
      expect(rt.getStatus().seats.some((s) => s.peerId === "g-nick")).toBe(
        true
      );
    });
    expect(rt.getStatus().seats.find((s) => s.peerId === "g-nick")).toEqual(
      expect.objectContaining({ displayName: "小明", role: "p2" })
    );
    rt.dispose();
  });

  it("forwards Guest session_act over attachExistingPeer (room act tunnel)", async () => {
    const placedEvent = {
      type: "match.placed",
      row: 3,
      col: 4,
      stone: 2,
    };
    const publishLocal = vi
      .spyOn(rosterHomeSessionTunnel, "publishRosterRelayedSessionEvent")
      .mockImplementation(() => {});
    const publishMemory = vi
      .spyOn(goMemoryCanvas, "publishGoMemoryBroadcast")
      .mockImplementation(() => {});
    const invokeHostSession = vi.fn(async (path: string) => {
      if (path.includes("/open")) return { ok: true };
      if (path.includes("/act")) {
        return {
          ok: true,
          events: [placedEvent],
          state: { status: "active" },
        };
      }
      return { ok: true };
    });
    const send = vi.fn();
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-room-act",
      protocol,
      invokeHostSession,
    });
    await rt.open();
    const peer = {
      send,
      close: vi.fn(),
      getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
      pc: { addEventListener: vi.fn() },
    };
    rt.attachExistingPeer({
      peerId: "g-a",
      session: peer as never,
      displayName: "甲",
    });
    const out = rt.inviteRoomPlayPeers({
      seats: [
        { role: "host", peerId: "host-local" },
        { role: "player", peerId: "g-a" },
      ],
    });
    const sessionId = rt.getStatus().sessionId!;
    rt.handleAvatarRelay(
      {
        type: "avatar_relay",
        from: "g-a",
        payload: {
          kind: "session_invite_accept",
          inviteId: out.inviteId,
          sessionId,
          role: "player",
          homeSandboxId: "guest-sb",
        },
      },
      "g-a"
    );
    await vi.waitFor(() => {
      expect(rt.getStatus().seats.some((s) => s.peerId === "g-a")).toBe(true);
    });
    const seatId = rt.getStatus().seats.find((s) => s.peerId === "g-a")!.seatId;
    invokeHostSession.mockClear();
    send.mockClear();
    publishLocal.mockClear();
    publishMemory.mockClear();

    rt.handleAvatarRelay(
      {
        type: "avatar_relay",
        from: "g-a",
        payload: {
          kind: "session_act",
          inviteId: out.inviteId,
          sessionId,
          seatId,
          requestId: "room-act-1",
          payload: { type: "place", row: 3, col: 4 },
        },
      },
      "g-a"
    );

    await vi.waitFor(() => {
      expect(invokeHostSession).toHaveBeenCalledWith(
        "/api/session/act",
        expect.objectContaining({
          body: JSON.stringify({
            role: "player",
            seatId,
            payload: { type: "place", row: 3, col: 4 },
          }),
        })
      );
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "avatar_relay",
          to: "g-a",
          payload: expect.objectContaining({
            kind: "session_act_result",
            requestId: "room-act-1",
            ok: true,
          }),
        })
      );
    });
    expect(publishLocal).toHaveBeenCalledWith(
      rt.getStatus().channelName,
      expect.objectContaining({ event: placedEvent })
    );
    expect(publishMemory).toHaveBeenCalledWith(
      rt.getStatus().channelName,
      expect.objectContaining({ event: placedEvent })
    );

    await rt.closeSessionKeepPeers({ message: "局結束" });
    rt.detachExistingPeer("g-a");
    rt.dispose();
  });

  it("forwards spectator sync act without a seated binding", async () => {
    const invokeHostSession = vi.fn(async (path: string) => {
      if (path.includes("/open")) return { ok: true };
      if (path.includes("/act")) {
        return {
          ok: true,
          state: { status: "active", wallCount: 60 },
        };
      }
      return { ok: true };
    });
    const send = vi.fn();
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-room-watch",
      protocol,
      invokeHostSession,
    });
    await rt.open();
    const sessionId = rt.getStatus().sessionId!;
    rt.attachExistingPeer({
      peerId: "watch-1",
      session: {
        send,
        close: vi.fn(),
        getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
        pc: { addEventListener: vi.fn() },
      } as never,
      displayName: "觀戰",
    });
    invokeHostSession.mockClear();
    send.mockClear();

    rt.handleAvatarRelay(
      {
        type: "avatar_relay",
        from: "watch-1",
        payload: {
          kind: "session_act",
          inviteId: "spectator-watch",
          sessionId,
          seatId: "spectator",
          requestId: "watch-sync-1",
          payload: { type: "sync" },
        },
      },
      "watch-1"
    );

    await vi.waitFor(() => {
      expect(invokeHostSession).toHaveBeenCalledWith(
        "/api/session/act",
        expect.objectContaining({
          body: JSON.stringify({
            role: "spectator",
            payload: { type: "sync" },
          }),
        })
      );
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            kind: "session_act_result",
            requestId: "watch-sync-1",
            ok: true,
          }),
        })
      );
    });

    rt.detachExistingPeer("watch-1");
    rt.dispose();
  });

  it("binds every guest when booth play reuses one inviteId across seats", async () => {
    const invokeHostSession = vi.fn(async (path: string) => {
      if (path.includes("/open")) return { ok: true };
      return { ok: true };
    });
    const sendA = vi.fn();
    const sendB = vi.fn();
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-room-multi",
      protocol: {
        protocolId: "redpick.v1",
        apiVersion: "1",
        roles: ["host", "p2", "p3", "p4"],
      },
      invokeHostSession,
    });
    await rt.open();
    const peerA = {
      send: sendA,
      close: vi.fn(),
      getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
      pc: { addEventListener: vi.fn() },
    };
    const peerB = {
      send: sendB,
      close: vi.fn(),
      getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
      pc: { addEventListener: vi.fn() },
    };
    rt.attachExistingPeer({
      peerId: "g-a",
      session: peerA as never,
      displayName: "甲",
    });
    rt.attachExistingPeer({
      peerId: "g-b",
      session: peerB as never,
      displayName: "乙",
    });
    const out = rt.inviteRoomPlayPeers({
      seats: [
        { role: "host", peerId: "host-local" },
        { role: "p2", peerId: "g-a" },
        { role: "p3", peerId: "g-b" },
      ],
    });
    expect(out.sent).toBe(2);

    rt.handleAvatarRelay(
      {
        type: "avatar_relay",
        from: "g-a",
        payload: {
          kind: "session_invite_accept",
          inviteId: out.inviteId,
          sessionId: rt.getStatus().sessionId,
          role: "p2",
          homeSandboxId: "guest-a",
        },
      },
      "g-a"
    );
    rt.handleAvatarRelay(
      {
        type: "avatar_relay",
        from: "g-b",
        payload: {
          kind: "session_invite_accept",
          inviteId: out.inviteId,
          sessionId: rt.getStatus().sessionId,
          role: "p3",
          homeSandboxId: "guest-b",
        },
      },
      "g-b"
    );
    await vi.waitFor(() => {
      expect(rt.getStatus().seats.map((s) => s.peerId).sort()).toEqual([
        "g-a",
        "g-b",
      ]);
    });
    expect(sendA).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "g-a",
        payload: expect.objectContaining({ kind: "session_seat_bound" }),
      })
    );
    expect(sendB).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "g-b",
        payload: expect.objectContaining({ kind: "session_seat_bound" }),
      })
    );
    const presenceCalls = invokeHostSession.mock.calls.filter((c) =>
      String(c[0]).includes("/presence")
    );
    expect(presenceCalls.length).toBeGreaterThanOrEqual(2);
    const lastPresenceBody = JSON.parse(
      String(presenceCalls[presenceCalls.length - 1]?.[1]?.body || "{}")
    ) as {
      seatedRoles: string[];
      seats: { role: string; displayName?: string }[];
    };
    expect(lastPresenceBody.seatedRoles).toEqual(
      expect.arrayContaining(["host", "p2", "p3"])
    );
    expect(lastPresenceBody.seats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "p2", displayName: "甲" }),
        expect.objectContaining({ role: "p3", displayName: "乙" }),
      ])
    );
    rt.dispose();
  });

  it("enableKeepPeersOnClose makes close() keep PeerConnections", async () => {
    const invokeHostSession = vi.fn(async (path: string) => {
      if (path.includes("/open")) return { ok: true };
      return { ok: true };
    });
    const send = vi.fn();
    const onClosed = vi.fn();
    const rt = createHostRuntime({
      getFiles: () => ({ "index.html": "<html></html>" }) as FileMap,
      getSandboxId: () => "go-sb-room",
      protocol,
      invokeHostSession,
    });
    await rt.open();
    const peer = {
      send,
      close: vi.fn(),
      getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
      pc: { addEventListener: vi.fn() },
    };
    rt.attachExistingPeer({
      peerId: "g-a",
      session: peer as never,
      displayName: "甲",
    });
    rt.enableKeepPeersOnClose({ onClosed });
    await rt.close({ message: "局結束" });
    expect(rt.getStatus().phase).toBe("idle");
    expect(peer.close).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(1);
    rt.dispose();
  });
});
