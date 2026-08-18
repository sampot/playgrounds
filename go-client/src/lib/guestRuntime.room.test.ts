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
});
