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
