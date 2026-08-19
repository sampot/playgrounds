import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  resolve: vi.fn(),
  preview: vi.fn(),
  createJoin: vi.fn(),
  postOffer: vi.fn(),
  fetchTurn: vi.fn(),
  createOffer: vi.fn(),
  applyAnswer: vi.fn(),
  chatAttach: vi.fn(),
  chatDetach: vi.fn(),
  filesAttach: vi.fn(),
  filesDetach: vi.fn(),
}));

vi.mock("./goSamResolve", () => ({
  resolveGoSamFiles: fixtures.resolve,
}));

vi.mock("@pg/platform/platformClient", () => ({
  previewInvite: fixtures.preview,
  createJoin: fixtures.createJoin,
  fetchGuestTurnIceServers: fixtures.fetchTurn,
  postOfferAndWaitAnswer: fixtures.postOffer,
}));

vi.mock("./goCanvasSupport", () => ({
  isGoCanvasSwUsable: () => false,
}));

vi.mock("./goMemoryCanvas", () => ({
  buildGoMemoryCanvas: vi.fn(),
  installGoMemoryApiListener: vi.fn(() => () => {}),
  publishGoMemoryBroadcast: vi.fn(),
  revokeGoMemoryBlobs: vi.fn(),
}));

vi.mock("./goCanvas", () => ({
  canvasEntryUrl: vi.fn(),
  installGoCanvasApiListener: vi.fn(() => () => {}),
  syncGoCanvasSnapshot: vi.fn(),
}));

vi.mock("@pg/roster/rosterPeer", () => ({
  applyRosterAnswer: fixtures.applyAnswer,
  createRosterOffer: fixtures.createOffer,
  acceptRosterOffer: vi.fn(),
  isAvatarRelayMessage: () => false,
  isPresenceMessage: () => false,
}));

vi.mock("./goSessionChat.svelte", () => ({
  goSessionChat: {
    attach: fixtures.chatAttach,
    detach: fixtures.chatDetach,
    setUiPhase: vi.fn(),
    setHints: vi.fn(),
    onIncoming: vi.fn(),
    setLocalName: vi.fn(),
  },
}));

vi.mock("./goRoomFiles.svelte", () => ({
  goRoomFiles: {
    attach: fixtures.filesAttach,
    detach: fixtures.filesDetach,
    onControl: vi.fn(),
    onBinary: vi.fn(),
  },
}));

vi.mock("./goRoomMedia.svelte", () => ({
  goRoomMedia: {
    attach: vi.fn(),
    detach: vi.fn(),
    refresh: vi.fn(),
    onCastControl: vi.fn(),
    onRemoteTrack: vi.fn(),
  },
}));

vi.mock("./chromeSession.svelte", () => ({
  chromeSession: { setFlash: vi.fn() },
}));

vi.mock("./platformClient", () => ({
  platformApiOrigin: () => "https://api.test",
}));

describe("guestRuntime invite.room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ secret: "inv_secret_room" }, { status: 200 })
      )
    );
    fixtures.preview.mockResolvedValue({
      secret: "inv_secret_room",
      inviteId: "inv-room",
      kind: "invite.room",
      intent: {
        version: 1,
        surface: "room",
        consent: "always_ask",
        transport: { roster: { signal: true } },
      },
      open: true,
      revoked: false,
    });
    fixtures.createJoin.mockResolvedValue({ join_cap: "cap-1" });
    fixtures.createOffer.mockImplementation(async (opts: { handlers?: { onChannelOpen?: () => void } }) => {
      const session = {
        send: vi.fn(),
        close: vi.fn(),
        getChannel: () => ({ readyState: "open", send: vi.fn() }),
        pc: { addEventListener: vi.fn() },
      };
      opts.handlers?.onChannelOpen?.();
      return { session, wire: "offer-wire" };
    });
    fixtures.postOffer.mockResolvedValue({ answer: "answer-wire" });
    fixtures.applyAnswer.mockResolvedValue(undefined);
  });

  it("skips SAM download and opens the 包廂 surface with media-ready SDP", async () => {
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("room1");
    expect(rt.getStatus().phase).toBe("consent");
    await rt.consentAndPlay("訪客甲");

    expect(fixtures.resolve).not.toHaveBeenCalled();
    expect(fixtures.fetchTurn).not.toHaveBeenCalled();
    expect(fixtures.createOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: "signal",
        media: "ready",
      })
    );
    const offerOpts = fixtures.createOffer.mock.calls[0]![0] as {
      iceServers?: unknown;
    };
    expect(offerOpts.iceServers).toBeUndefined();
    expect(rt.getStatus().phase).toBe("ready");
    expect(rt.getStatus().surface).toBe("room");
    expect(rt.getStatus().canvasUrl).toBeNull();
    expect(rt.getStatus().canvasSrcdoc).toBeNull();
    expect(fixtures.chatAttach).toHaveBeenCalledWith(
      expect.objectContaining({ layout: "page", localRole: "guest" })
    );
    expect(fixtures.filesAttach).toHaveBeenCalled();
  });

  it("opens 包廂 when preview kind is not invite.room but intent.surface is room", async () => {
    fixtures.preview.mockResolvedValue({
      secret: "inv_secret_room",
      inviteId: "inv-room",
      kind: "signal.handshake",
      intent: {
        version: 1,
        surface: "room",
        consent: "always_ask",
        transport: { roster: { signal: true } },
      },
      open: true,
      revoked: false,
    });
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("room1");
    await rt.consentAndPlay("訪客甲");
    expect(fixtures.resolve).not.toHaveBeenCalled();
    expect(rt.getStatus().phase).toBe("ready");
    expect(rt.getStatus().surface).toBe("room");
    expect(rt.getStatus().error).toBeNull();
  });

  it("leaveRoom from 包廂 is not host-ended and keeps others' booth", async () => {
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("room1");
    await rt.consentAndPlay("訪客甲");
    rt.leaveRoom();
    expect(rt.getStatus().phase).toBe("left");
    expect(rt.getStatus().message).toBe("已離開這一間");
    expect(rt.getStatus().surface).toBe("room");
    expect(rt.getStatus().error).toBeNull();
  });

  it("applies Host occupancy so a third person appears on the roster", async () => {
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("room1");
    await rt.consentAndPlay("訪客甲");
    const offerOpts = fixtures.createOffer.mock.calls[0]![0] as {
      localPresence?: { agentId: string };
      handlers?: { onMessage?: (data: unknown) => void };
    };
    const localId = offerOpts.localPresence?.agentId;
    expect(localId).toBeTruthy();
    offerOpts.handlers?.onMessage?.({
      type: "session_occupancy",
      v: 1,
      occupants: [
        { peerId: "host-1", name: "太郎" },
        { peerId: localId, name: "訪客甲" },
        { peerId: "g-b", name: "乙" },
      ],
    });
    expect(rt.getStatus().guestCount).toBe(2);
    expect(rt.getStatus().occupantPeers).toEqual([
      { peerId: "host-1", name: "太郎" },
      { peerId: "g-b", name: "乙" },
    ]);
  });

  it("leaves the booth when the Host kicks this seat", async () => {
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("room1");
    await rt.consentAndPlay("訪客甲");
    const offerOpts = fixtures.createOffer.mock.calls[0]![0] as {
      localPresence?: { agentId: string };
      handlers?: { onMessage?: (data: unknown) => void };
    };
    const localId = offerOpts.localPresence?.agentId;
    offerOpts.handlers?.onMessage?.({
      type: "session_booth",
      v: 1,
      op: "kick",
      from: "host-1",
      to: localId,
    });
    expect(rt.getStatus().phase).toBe("ended");
    expect(rt.getStatus().error).toMatch(/請你離開/);
  });

  it("ignores session_mesh hello so Guest↔Guest stays on the Host hub", async () => {
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("room1");
    await rt.consentAndPlay("訪客甲");
    const offerOpts = fixtures.createOffer.mock.calls[0]![0] as {
      handlers?: { onMessage?: (data: unknown) => void };
    };
    fixtures.createOffer.mockClear();
    offerOpts.handlers?.onMessage?.({
      type: "session_mesh",
      v: 1,
      op: "hello",
      peerId: "zz-peer",
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(fixtures.createOffer).not.toHaveBeenCalled();
    expect(fixtures.postOffer).toHaveBeenCalledTimes(1);
  });

  it("ICE failure while connecting is a page error, not host-ended", async () => {
    let handlers: {
      onConnectionState?: (state: RTCPeerConnectionState) => void;
    } = {};
    fixtures.createOffer.mockImplementation(async (opts: { handlers?: typeof handlers }) => {
      handlers = opts.handlers ?? {};
      return {
        session: {
          send: vi.fn(),
          close: vi.fn(),
          getChannel: () => ({ readyState: "connecting", send: vi.fn() }),
          pc: { addEventListener: vi.fn() },
        },
        wire: "offer-wire",
      };
    });
    let finishWait: ((value: { answer: string }) => void) | undefined;
    fixtures.postOffer.mockImplementation(
      () =>
        new Promise<{ answer: string }>((resolve) => {
          finishWait = resolve;
        })
    );
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("room1");
    const play = rt.consentAndPlay("訪客甲");
    await vi.waitFor(() => {
      expect(handlers.onConnectionState).toBeTypeOf("function");
    });
    expect(rt.getStatus().phase).toBe("connecting");
    handlers.onConnectionState?.("failed");
    expect(rt.getStatus().phase).toBe("error");
    expect(rt.getStatus().error).toMatch(/連線失敗/);
    expect(rt.getStatus().error).not.toMatch(/關掉/);
    finishWait?.({ answer: "answer-wire" });
    await play;
    expect(rt.getStatus().phase).toBe("error");
  });

  it("channel close after seating is host-ended", async () => {
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("room1");
    await rt.consentAndPlay("訪客甲");
    expect(rt.getStatus().phase).toBe("ready");
    const offerOpts = fixtures.createOffer.mock.calls[0]![0] as {
      handlers?: { onChannelClose?: () => void };
    };
    offerOpts.handlers?.onChannelClose?.();
    expect(rt.getStatus().phase).toBe("ended");
    expect(rt.getStatus().error).toBe("主持已關掉這一間");
  });
});
