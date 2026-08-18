import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  resolve: vi.fn(),
  preview: vi.fn(),
  composeSource: vi.fn(() => "sampot/pg-gomoku"),
  composeProtocol: vi.fn(() => ({ protocolId: "gomoku.v1" })),
  composeRelay: vi.fn(() => false),
  wantsSignal: vi.fn(() => true),
  buildMemory: vi.fn(() => ({
    srcdoc: "<html></html>",
    blobUrls: [] as string[],
    generation: 1,
  })),
}));

vi.mock("./goSamResolve", () => ({
  resolveGoSamFiles: fixtures.resolve,
}));

vi.mock("@pg/platform/platformClient", () => ({
  previewInvite: fixtures.preview,
  createJoin: vi.fn(),
  fetchGuestTurnIceServers: vi.fn(),
  postOfferAndWaitAnswer: vi.fn(),
}));

vi.mock("@pg/platform/platformCompose", () => ({
  composeSamSource: fixtures.composeSource,
  composeSessionProtocol: fixtures.composeProtocol,
  composeWantsRelay: fixtures.composeRelay,
  wantsRosterSignal: fixtures.wantsSignal,
  isInviteRoomKind: (kind: string) => kind === "invite.room",
  isRoomInvite: (kind: string) => kind === "invite.room",
}));

vi.mock("./goCanvasSupport", () => ({
  isGoCanvasSwUsable: () => false,
}));

vi.mock("./goMemoryCanvas", () => ({
  buildGoMemoryCanvas: (...args: unknown[]) =>
    fixtures.buildMemory(...(args as Parameters<typeof fixtures.buildMemory>)),
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
  applyRosterAnswer: vi.fn(),
  createRosterOffer: vi.fn(),
  acceptRosterOffer: vi.fn(),
  isAvatarRelayMessage: () => false,
  isPresenceMessage: () => false,
}));

vi.mock("./goSessionChat.svelte", () => ({
  goSessionChat: {
    attach: vi.fn(),
    detach: vi.fn(),
    setUiPhase: vi.fn(),
    noteInbound: vi.fn(),
  },
}));

vi.mock("./chromeSession.svelte", () => ({
  chromeSession: { setFlash: vi.fn() },
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

vi.mock("./platformClient", () => ({
  platformApiOrigin: () => "https://api.test",
}));

describe("guestRuntime local-first SAM resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ secret: "inv_secret_test" }, { status: 200 })
      )
    );
    fixtures.preview.mockResolvedValue({
      secret: "inv_secret_test",
      inviteId: "inv-1",
      kind: "invite.compose",
      intent: { version: 1 },
      open: true,
      revoked: false,
    });
    fixtures.resolve.mockResolvedValue({
      files: { "index.html": "<html></html>" },
      origin: "cache",
      catalogId: "pg-gomoku",
    });
  });

  it("reuses the offline pack instead of downloading on every join", async () => {
    fixtures.wantsSignal.mockReturnValue(false);
    const { createGuestRuntime } = await import("./guestRuntime");
    const rt = createGuestRuntime();
    await rt.bootFromShortId("abc");
    expect(rt.getStatus().phase).toBe("consent");
    await rt.consentAndPlay("測試");

    expect(fixtures.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "sampot/pg-gomoku",
        updatePolicy: "check-tip",
      })
    );
    expect(fixtures.resolve).toHaveBeenCalledTimes(1);
    expect(rt.getStatus().phase).toBe("ready");
  });
});
