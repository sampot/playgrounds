import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readRemoteAnchorEnabled,
  writeRemoteAnchorEnabled,
  GO_ROOM_REMOTE_ANCHOR_KEY,
  createBoothAnchorBridge,
} from "./boothAnchorBridge";

const hostFixtures = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  publishSnapshot: vi.fn(),
  refreshProgram: vi.fn(),
  capturedHandlers: null as import("./boothPlatform").BoothAnchorHostHandlers | null,
}));

vi.mock("./boothPlatform", () => ({
  createBoothAnchorHost: vi.fn((handlers: import("./boothPlatform").BoothAnchorHostHandlers) => {
    hostFixtures.capturedHandlers = handlers;
    return {
      start: hostFixtures.start,
      stop: hostFixtures.stop,
      publishSnapshot: hostFixtures.publishSnapshot,
      refreshProgram: hostFixtures.refreshProgram,
    };
  }),
}));

describe("boothAnchorBridge prefs", () => {
  it("reads and writes remote anchor toggle", () => {
    const storage = {
      data: {} as Record<string, string>,
      getItem(k: string) {
        return this.data[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.data[k] = v;
      },
    };
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
    });
    try {
      expect(readRemoteAnchorEnabled()).toBe(false);
      writeRemoteAnchorEnabled(true);
      expect(storage.data[GO_ROOM_REMOTE_ANCHOR_KEY]).toBe("1");
      expect(readRemoteAnchorEnabled()).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: original,
        configurable: true,
      });
    }
  });
});

describe("createBoothAnchorBridge anchor lifecycle", () => {
  const storage = {
    data: {} as Record<string, string>,
    getItem(k: string) {
      return this.data[k] ?? null;
    },
    setItem(k: string, v: string) {
      this.data[k] = v;
    },
  };

  beforeEach(() => {
    hostFixtures.start.mockClear();
    hostFixtures.stop.mockClear();
    hostFixtures.capturedHandlers = null;
    storage.data = {};
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
    });
  });

  it("does not register anchor until remote is enabled", async () => {
    const bridge = createBoothAnchorBridge({
      getStatus: () => ({
        phase: "open",
        guestCount: 0,
        inviteDoor: "none",
        shortUrl: null,
        inviteExpiresAt: null,
        occupantPeers: [],
        occupantNames: [],
        peerName: null,
        playCatalogId: null,
        playLoadProgress: null,
        playCanvasUrl: null,
        playCanvasSrcdoc: null,
        playCanvasMode: null,
        playCanvasGeneration: 0,
        localPeerId: "host-1",
        message: "",
        error: null,
      }),
      getOwnerUserId: () => "u1",
      getApiKey: () => "pg_sk_test",
      getHostPeerId: () => "host-1",
      onGuestJoinOffer: vi.fn(),
      onOperatorCastLive: vi.fn(),
      onOperatorCastFile: vi.fn(),
      onOperatorStopTv: vi.fn(),
      onOperatorHaltLive: vi.fn(),
      onOperatorMintInvite: vi.fn(),
      onOperatorRevokeInvite: vi.fn(),
      onOperatorCastState: vi.fn(),
      onOperatorKickPeer: vi.fn(),
      onOperatorEndBooth: vi.fn(),
      onOperatorStartAutoPlay: vi.fn(),
      onOperatorStartManualPlay: vi.fn(),
      onOperatorEndPlay: vi.fn(),
    });

    await bridge.onBoothOpen();
    expect(hostFixtures.start).not.toHaveBeenCalled();

    await bridge.setEnabled(true);
    expect(hostFixtures.start).toHaveBeenCalledTimes(1);
  });

  it("stops anchor when remote is disabled", async () => {
    writeRemoteAnchorEnabled(true);
    const bridge = createBoothAnchorBridge({
      getStatus: () => ({
        phase: "open",
        guestCount: 0,
        inviteDoor: "none",
        shortUrl: null,
        inviteExpiresAt: null,
        occupantPeers: [],
        occupantNames: [],
        peerName: null,
        playCatalogId: null,
        playLoadProgress: null,
        playCanvasUrl: null,
        playCanvasSrcdoc: null,
        playCanvasMode: null,
        playCanvasGeneration: 0,
        localPeerId: "host-1",
        message: "",
        error: null,
      }),
      getOwnerUserId: () => "u1",
      getApiKey: () => "pg_sk_test",
      getHostPeerId: () => "host-1",
      onGuestJoinOffer: vi.fn(),
      onOperatorCastLive: vi.fn(),
      onOperatorCastFile: vi.fn(),
      onOperatorStopTv: vi.fn(),
      onOperatorHaltLive: vi.fn(),
      onOperatorMintInvite: vi.fn(),
      onOperatorRevokeInvite: vi.fn(),
      onOperatorCastState: vi.fn(),
      onOperatorKickPeer: vi.fn(),
      onOperatorEndBooth: vi.fn(),
      onOperatorStartAutoPlay: vi.fn(),
      onOperatorStartManualPlay: vi.fn(),
      onOperatorEndPlay: vi.fn(),
    });

    await bridge.onBoothOpen();
    expect(hostFixtures.start).toHaveBeenCalledTimes(1);

    await bridge.setEnabled(false);
    expect(hostFixtures.stop).toHaveBeenCalledTimes(1);
  });
});

function openStatus(
  partial: Partial<import("./roomRuntime").RoomStatus> = {}
): import("./roomRuntime").RoomStatus {
  return {
    phase: "open",
    guestCount: 0,
    inviteDoor: "none",
    shortUrl: null,
    inviteExpiresAt: null,
    occupantPeers: [],
    occupantNames: [],
    peerName: null,
    playCatalogId: null,
    playLoadProgress: null,
    playCanvasUrl: null,
    playCanvasSrcdoc: null,
    playCanvasMode: null,
    playCanvasGeneration: 0,
    localPeerId: "host-1",
    message: "",
    error: null,
    ...partial,
  };
}

describe("createBoothAnchorBridge snapshot", () => {
  beforeEach(() => {
    hostFixtures.capturedHandlers = null;
    writeRemoteAnchorEnabled(true);
  });

  it("maps operator occupant kind and live state in members", async () => {
    const bridge = createBoothAnchorBridge({
      getStatus: () =>
        openStatus({
          guestCount: 1,
          occupantPeers: [
            { peerId: "op-op-abc", name: "遠端", kind: "operator" },
            { peerId: "g-1", name: "訪客", kind: "guest" },
          ],
        }),
      getOwnerUserId: () => "u1",
      getApiKey: () => "pg_sk_test",
      getHostPeerId: () => "host-1",
      getRemoteLives: () => [
        { peerId: "op-op-abc", camera: true, mic: false },
        { peerId: "g-1", camera: false, mic: true },
      ],
      onGuestJoinOffer: vi.fn(),
      onOperatorCastLive: vi.fn(),
      onOperatorCastFile: vi.fn(),
      onOperatorStopTv: vi.fn(),
      onOperatorHaltLive: vi.fn(),
      onOperatorMintInvite: vi.fn(),
      onOperatorRevokeInvite: vi.fn(),
      onOperatorCastState: vi.fn(),
      onOperatorKickPeer: vi.fn(),
      onOperatorEndBooth: vi.fn(),
      onOperatorStartAutoPlay: vi.fn(),
      onOperatorStartManualPlay: vi.fn(),
      onOperatorEndPlay: vi.fn(),
      getLocalPresence: () => ({ agentId: "host-1", name: "太郎" }),
    });

    await bridge.setEnabled(true);
    const snap = hostFixtures.capturedHandlers?.getSnapshot();
    expect(snap).toBeDefined();
    const operator = snap!.members.find((m) => m.peerId === "op-op-abc");
    expect(operator).toMatchObject({
      kind: "operator",
      displayName: "遠端",
      live: { camera: true, mic: false, display: false },
    });
    const guest = snap!.members.find((m) => m.peerId === "g-1");
    expect(guest).toMatchObject({
      kind: "guest",
      live: { camera: false, mic: true, display: false },
    });
    expect(snap!.guestCount).toBe(1);
  });

  it("passes operator roster hooks to anchor host", async () => {
    const prepareOperatorRoster = vi.fn(() => ({}));
    const onOperatorSession = vi.fn();
    const bridge = createBoothAnchorBridge({
      getStatus: () => openStatus(),
      getOwnerUserId: () => "u1",
      getApiKey: () => "pg_sk_test",
      getHostPeerId: () => "host-1",
      onGuestJoinOffer: vi.fn(),
      onOperatorCastLive: vi.fn(),
      onOperatorCastFile: vi.fn(),
      onOperatorStopTv: vi.fn(),
      onOperatorHaltLive: vi.fn(),
      onOperatorMintInvite: vi.fn(),
      onOperatorRevokeInvite: vi.fn(),
      onOperatorCastState: vi.fn(),
      onOperatorKickPeer: vi.fn(),
      onOperatorEndBooth: vi.fn(),
      onOperatorStartAutoPlay: vi.fn(),
      onOperatorStartManualPlay: vi.fn(),
      onOperatorEndPlay: vi.fn(),
      getLocalPresence: () => ({ agentId: "host-1", name: "太郎" }),
      prepareOperatorRoster,
      onOperatorSession,
    });

    await bridge.setEnabled(true);
    expect(hostFixtures.capturedHandlers?.getLocalPresence()).toEqual({
      agentId: "host-1",
      name: "太郎",
    });
    expect(hostFixtures.capturedHandlers?.prepareOperatorRoster).toBe(
      prepareOperatorRoster
    );
    expect(hostFixtures.capturedHandlers?.onOperatorSession).toBe(
      onOperatorSession
    );
  });
});
