import { beforeEach, describe, expect, it, vi } from "vitest";

const boothBridgeFixtures = vi.hoisted(() => ({
  onGuestJoinOffer: null as
    | ((
        input: { joinId: string; inviteId: string; offerWire: string }
      ) => Promise<string>)
    | null,
  onBoothOpen: vi.fn().mockResolvedValue(undefined),
  prepareOperatorRoster: null as
    | ((shellId: string) => {
        onMessage?: (data: unknown) => void;
        onChannelClose?: () => void;
      })
    | null,
  onOperatorSession: null as
    | ((input: {
        shellId: string;
        session: ReturnType<typeof mockSession>;
      }) => void)
    | null,
  getLocalPresence: null as (() => { agentId: string; name: string }) | null,
  preparedSlots: [] as Array<{
    handlers: {
      onChannelClose?: () => void;
      onMessage?: (data: unknown) => void;
    };
    session: ReturnType<typeof mockSession>;
  }>,
}));

const fixtures = vi.hoisted(() => ({
  mint: vi.fn(),
  apiKey: vi.fn(() => "pg_sk_test"),
  revoke: vi.fn(),
  chatAttach: vi.fn(),
  chatDetach: vi.fn(),
  chatSetBroadcast: vi.fn(),
  filesAttach: vi.fn(),
  filesDetach: vi.fn(),
}));

vi.mock("./boothAnchorBridge", () => ({
  createBoothAnchorBridge: (ctx: {
    onGuestJoinOffer: NonNullable<typeof boothBridgeFixtures.onGuestJoinOffer>;
    prepareOperatorRoster?: NonNullable<
      typeof boothBridgeFixtures.prepareOperatorRoster
    >;
    onOperatorSession?: NonNullable<
      typeof boothBridgeFixtures.onOperatorSession
    >;
    getLocalPresence?: NonNullable<typeof boothBridgeFixtures.getLocalPresence>;
  }) => {
    boothBridgeFixtures.onGuestJoinOffer = ctx.onGuestJoinOffer;
    boothBridgeFixtures.prepareOperatorRoster = ctx.prepareOperatorRoster;
    boothBridgeFixtures.onOperatorSession = ctx.onOperatorSession;
    boothBridgeFixtures.getLocalPresence = ctx.getLocalPresence;
    return {
      isEnabled: () => false,
      setEnabled: vi.fn(),
      onBoothOpen: boothBridgeFixtures.onBoothOpen,
      publishSnapshot: vi.fn(),
      refreshProgram: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
  },
  readRemoteAnchorEnabled: () => false,
  writeRemoteAnchorEnabled: vi.fn(),
  GO_ROOM_REMOTE_ANCHOR_KEY: "go_room_remote_anchor_v1",
}));

vi.mock("./roomBoothJoinHost", () => ({
  createRoomGuestJoinAcceptor: (opts: {
    prepareHandlers: () => {
      handlers: {
        onChannelClose?: () => void;
        onMessage?: (data: unknown) => void;
      };
      attachSession: (s: ReturnType<typeof mockSession>) => void;
    };
  }) => {
    return async (_offerWire: string) => {
      const prepared = opts.prepareHandlers();
      const session = mockSession();
      prepared.attachSession(session);
      boothBridgeFixtures.preparedSlots.push({
        handlers: prepared.handlers,
        session,
      });
      return "answer-wire";
    };
  },
}));

vi.mock("./goAuth.svelte", () => ({
  goAuth: {
    mintPlatformInvite: fixtures.mint,
    getPlatformApiKeyForHostLoop: fixtures.apiKey,
    revokePlatformInvite: fixtures.revoke,
    wantsTurnRelay: () => true,
    profile: { label: "太郎" },
  },
}));


vi.mock("./goSessionChat.svelte", () => ({
    goSessionChat: {
    attach: fixtures.chatAttach,
    detach: fixtures.chatDetach,
    setUiPhase: vi.fn(),
    setHints: vi.fn(),
    setBroadcast: fixtures.chatSetBroadcast,
    onIncoming: vi.fn(),
    connected: false,
    feed: [],
  },
}));

vi.mock("./goRoomFiles.svelte", () => ({
    goRoomFiles: {
    attach: fixtures.filesAttach,
    detach: fixtures.filesDetach,
    onControl: vi.fn(),
    onBinary: vi.fn(),
    catalogItems: () => [],
    entries: [],
    listingOwner: () => null,
    listingMeta: () => null,
    forgetOwner: () => [],
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
    forwardFrom: vi.fn(),
    stopProgram: vi.fn(async () => {}),
  },
}));

vi.mock("./goRoomPlayBootstrap", () => ({
  loadRoomPlaySam: vi.fn(() => new Promise(() => {})),
  createRoomPlayHostRuntime: vi.fn(),
  mountRoomPlayHostCanvas: vi.fn(),
  listRoomPlayableCatalogIds: () => ["pg-gomoku"],
  roomPlaySamCheckProgress: () => ({
    ratio: null,
    detail: "檢查遊戲版本…",
  }),
}));

function mockSession() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
    pc: { addEventListener: vi.fn() },
  };
}

let joinSeq = 0;

async function joinGuests(count = 1): Promise<void> {
  for (let i = 0; i < count; i++) {
    await boothBridgeFixtures.onGuestJoinOffer!({
      joinId: `j${joinSeq++}`,
      inviteId: "inv-room",
      offerWire: `offer-${joinSeq}`,
    });
  }
}

describe("roomRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boothBridgeFixtures.preparedSlots = [];
    joinSeq = 0;
    boothBridgeFixtures.onBoothOpen.mockResolvedValue(undefined);
    fixtures.apiKey.mockReturnValue("pg_sk_test");
    fixtures.mint.mockResolvedValue({
      invite_id: "inv-room",
      short_url: "https://go.samkuo.me/i/abc123",
      expires_at: Date.now() + 5 * 60 * 1000,
    });
  });

  it("opens the booth UI before anyone joins without minting a door", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    expect(rt.getStatus().phase).toBe("open");
    expect(rt.getStatus().shortUrl).toBeNull();
    expect(rt.getStatus().inviteDoor).toBe("none");
    expect(rt.getStatus().message).toBe("");
    expect(fixtures.chatAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: "page",
        localRole: "host",
        localName: "太郎",
      })
    );
    expect(fixtures.filesAttach).toHaveBeenCalled();
    expect(fixtures.mint).not.toHaveBeenCalled();
    expect(boothBridgeFixtures.onBoothOpen).toHaveBeenCalled();
  });

  it("logout reset lands on idle instead of ended", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.close({ landOn: "idle" });
    expect(rt.getStatus().phase).toBe("idle");
    expect(rt.getStatus().message).toBe("");
  });

  it("mints a live door only when asked to invite", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    expect(fixtures.mint).toHaveBeenCalledWith({
      kind: "invite.room",
      intent: expect.objectContaining({
        surface: "room",
        transport: { roster: { signal: true } },
      }),
    });
    expect(boothBridgeFixtures.onBoothOpen).toHaveBeenCalled();
    expect(rt.getStatus().inviteDoor).toBe("live");
    expect(rt.getStatus().shortUrl).toBe("https://go.samkuo.me/i/abc123");
  });

  it("revokes the live door without minting a new invite", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await rt.revokeInviteAndAnswer();
    expect(rt.getStatus().inviteDoor).toBe("expired");
    expect(rt.getStatus().shortUrl).toBeNull();
    expect(fixtures.revoke).toHaveBeenCalledWith("inv-room");
    expect(fixtures.mint).toHaveBeenCalledTimes(1);
  });

  it("does not remint while the door is still live", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await rt.mintInviteAndAnswer();
    expect(fixtures.mint).toHaveBeenCalledTimes(1);
  });

  it("fans out to a second guest without ending the first connection", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(2);
    const a = boothBridgeFixtures.preparedSlots[0]!.session;
    const b = boothBridgeFixtures.preparedSlots[1]!.session;
    expect(rt.getStatus().phase).toBe("open");
    expect(rt.getStatus().guestCount).toBe(2);

    const broadcast = fixtures.chatAttach.mock.calls[0]![0] as {
      broadcast: (msg: unknown) => number;
    };
    broadcast.broadcast({ type: "session_chat", id: "m1", text: "hi" });
    expect(a.send).toHaveBeenCalled();
    expect(b.send).toHaveBeenCalled();
  });

  it("fans guest float emojis and drops guest delete", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(2);
    const first = boothBridgeFixtures.preparedSlots[0]!;
    const second = boothBridgeFixtures.preparedSlots[1]!;
    const float = {
      type: "session_chat_ctl",
      v: 1,
      op: "float",
      from: "g-a",
      id: "flt-1",
      emoji: "🎉",
    };
    first.session.send.mockClear();
    second.session.send.mockClear();
    first.handlers.onMessage!(float);
    expect(second.session.send).toHaveBeenCalledWith(float);
    expect(first.session.send).not.toHaveBeenCalledWith(float);
    second.session.send.mockClear();
    first.handlers.onMessage!({
      type: "session_chat_ctl",
      v: 1,
      op: "delete",
      from: "g-a",
      id: "del-1",
      targetId: "m1",
    });
    expect(second.session.send).not.toHaveBeenCalled();
  });

  it("does not close the booth when one guest leaves", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(2);
    boothBridgeFixtures.preparedSlots[0]!.handlers.onChannelClose!();
    expect(rt.getStatus().phase).toBe("open");
    expect(rt.getStatus().guestCount).toBe(1);
  });

  it("introduces guests over session_mesh when a second guest joins", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(1);
    const first = boothBridgeFixtures.preparedSlots[0]!;
    first.handlers.onMessage!({
      type: "presence",
      agentId: "g-a",
      name: "甲",
    });
    await joinGuests(1);
    const second = boothBridgeFixtures.preparedSlots[1]!;
    second.handlers.onMessage!({
      type: "presence",
      agentId: "g-b",
      name: "乙",
    });
    const a = first.session;
    const b = second.session;
    expect(b.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_mesh",
        op: "hello",
        peerId: "g-a",
      })
    );
    expect(a.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_mesh",
        op: "hello",
        peerId: "g-b",
      })
    );

    first.handlers.onMessage!({
      type: "session_mesh",
      v: 1,
      op: "offer",
      from: "spoof",
      to: "g-b",
      sdp: "wire",
    });
    expect(b.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_mesh",
        op: "offer",
        from: "g-a",
        to: "g-b",
        sdp: "wire",
      })
    );
  });

  it("fans out occupancy so guests see the third person, not only the Host", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(1);
    const first = boothBridgeFixtures.preparedSlots[0]!;
    first.handlers.onMessage!({
      type: "presence",
      agentId: "g-a",
      name: "甲",
    });
    await joinGuests(1);
    const second = boothBridgeFixtures.preparedSlots[1]!;
    second.handlers.onMessage!({
      type: "presence",
      agentId: "g-b",
      name: "乙",
    });
    const a = first.session;
    const b = second.session;
    const occupancyOf = (sess: ReturnType<typeof mockSession>) =>
      sess.send.mock.calls
        .map((c) => c[0] as { type?: string; occupants?: unknown[] })
        .filter((m) => m?.type === "session_occupancy");
    const lastA = occupancyOf(a).at(-1);
    const lastB = occupancyOf(b).at(-1);
    expect(lastA?.occupants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ peerId: "g-a", name: "甲" }),
        expect.objectContaining({ peerId: "g-b", name: "乙" }),
      ])
    );
    expect(lastA?.occupants).toHaveLength(3);
    expect(lastB?.occupants).toEqual(lastA?.occupants);

    a.send.mockClear();
    first.handlers.onChannelClose!();
    const afterLeave = occupancyOf(b).at(-1);
    expect(afterLeave?.occupants).toHaveLength(2);
    expect(afterLeave?.occupants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ peerId: "g-b", name: "乙" }),
      ])
    );
    expect(afterLeave?.occupants).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ peerId: "g-a" }),
      ])
    );
  });

  it("kicks one guest without ending the booth", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(1);
    const first = boothBridgeFixtures.preparedSlots[0]!;
    first.handlers.onMessage!({
      type: "presence",
      agentId: "g-a",
      name: "甲",
    });
    await joinGuests(1);
    const second = boothBridgeFixtures.preparedSlots[1]!;
    second.handlers.onMessage!({
      type: "presence",
      agentId: "g-b",
      name: "乙",
    });
    const a = first.session;
    const b = second.session;
    expect(rt.kickPeer("g-a")).toBe(true);
    expect(a.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_booth",
        op: "kick",
        to: "g-a",
      })
    );
    expect(a.close).toHaveBeenCalled();
    expect(b.close).not.toHaveBeenCalled();
    expect(rt.getStatus().phase).toBe("open");
    expect(rt.getStatus().occupantPeers).toEqual([
      { peerId: "g-b", name: "乙", kind: "guest" },
    ]);
    expect(rt.kickPeer("local")).toBe(false);
  });

  it("does not mint when the Host is not logged in", async () => {
    fixtures.mint.mockRejectedValue(
      Object.assign(new Error("尚未登入遊樂場通行證，請先登入"), {
        code: "not_provisioned",
      })
    );
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await expect(rt.mintInviteAndAnswer()).rejects.toMatchObject({
      code: "not_provisioned",
    });
    expect(rt.getStatus().phase).not.toBe("open");
  });

  it("does not mint twice when mint overlaps", async () => {
    let release: (v: unknown) => void = () => {};
    fixtures.mint.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    const first = rt.mintInviteAndAnswer();
    const second = rt.mintInviteAndAnswer();
    release({
      invite_id: "inv-room",
      short_url: "https://go.samkuo.me/i/abc123",
      expires_at: Date.now() + 5 * 60 * 1000,
    });
    await Promise.all([first, second]);
    expect(fixtures.mint).toHaveBeenCalledTimes(1);
  });

  it("expires the door without closing the booth or sharing the old URL", async () => {
    vi.useFakeTimers();
    try {
      fixtures.mint.mockResolvedValue({
        invite_id: "inv-room",
        short_url: "https://go.samkuo.me/i/abc123",
        expires_at: Date.now() + 1000,
      });
      const { createRoomRuntime } = await import("./roomRuntime");
      const rt = createRoomRuntime();
      await rt.openBooth();
      await rt.mintInviteAndAnswer();
      await vi.advanceTimersByTimeAsync(1500);
      expect(rt.getStatus().phase).toBe("open");
      expect(rt.getStatus().inviteDoor).toBe("expired");
      expect(rt.getStatus().shortUrl).toBeNull();
      expect(rt.getStatus().message).toBe("");
      expect(fixtures.revoke).toHaveBeenCalledWith("inv-room");
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists the door and re-arms the expiry timer after a refresh", async () => {
    vi.useFakeTimers();
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
    try {
      const expiresAt = Date.now() + 5_000;
      fixtures.mint.mockResolvedValue({
        invite_id: "inv-room",
        short_url: "https://go.samkuo.me/i/abc123",
        expires_at: expiresAt,
      });
      const { createRoomRuntime } = await import("./roomRuntime");
      const first = createRoomRuntime({ inviteSession: store });
      await first.openBooth();
      await first.mintInviteAndAnswer();
      expect(store.getItem("pg_go_room_invite_door")).toContain("inv-room");
      expect(boothBridgeFixtures.onBoothOpen).toHaveBeenCalled();

      const second = createRoomRuntime({ inviteSession: store });
      await second.openBooth();
      expect(second.getStatus().inviteDoor).toBe("live");
      expect(second.getStatus().shortUrl).toBe(
        "https://go.samkuo.me/i/abc123"
      );
      expect(second.getStatus().inviteExpiresAt).toBe(expiresAt);
      expect(boothBridgeFixtures.onBoothOpen.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(fixtures.mint).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_500);
      expect(second.getStatus().inviteDoor).toBe("expired");
      expect(second.getStatus().shortUrl).toBeNull();
      expect(store.getItem("pg_go_room_invite_door")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("offerPlay fans out session_play on existing peers without minting compose", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const { goRoomMedia } = await import("./goRoomMedia.svelte");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(1);
    const first = boothBridgeFixtures.preparedSlots[0]!;
    first.handlers.onChannelOpen!();
    await joinGuests(1);
    const second = boothBridgeFixtures.preparedSlots[1]!;
    second.handlers.onChannelOpen!();
    const a = first.session;
    const b = second.session;

    a.send.mockClear();
    b.send.mockClear();
    const out = await rt.offerPlay({
      catalogId: "pg-gomoku",
      seats: [
        { role: "host", peerId: "local" },
        { role: "player", peerId: "g-a" },
      ],
    });
    expect(out.ok).toBe(true);
    expect(rt.getStatus().playCatalogId).toBe("pg-gomoku");
    expect(rt.getStatus().playLoadProgress?.detail).toMatch(/檢查遊戲版本/);
    expect(goRoomMedia.stopProgram).toHaveBeenCalled();
    expect(fixtures.mint).toHaveBeenCalledTimes(1);
    expect(a.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_play",
        op: "offer",
        catalogId: "pg-gomoku",
      })
    );
    expect(b.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_play",
        op: "offer",
        catalogId: "pg-gomoku",
      })
    );
    expect(rt.getPlayState().phase).toBe("loading");

    await joinGuests(1);
    const third = boothBridgeFixtures.preparedSlots[2]!;
    const late = third.session;
    late.send.mockClear();
    third.handlers.onChannelOpen!();
    expect(late.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_play",
        op: "offer",
        catalogId: "pg-gomoku",
      })
    );

    a.send.mockClear();
    b.send.mockClear();
    expect((await rt.endPlay()).ok).toBe(true);
    expect(rt.getPlayState().phase).toBe("idle");
    expect(a.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "session_play", op: "end" })
    );
  });

  it("startManualPlay offers with Host picks; short seats do not offer", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const { chromeSession } = await import("./chromeSession.svelte");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(1);
    const first = boothBridgeFixtures.preparedSlots[0]!;
    first.handlers.onChannelOpen!();
    first.handlers.onMessage!({
      type: "presence",
      agentId: "g-a",
      name: "甲",
    });
    const a = first.session;
    const hostId = rt.getStatus().localPeerId;

    a.send.mockClear();
    const short = await rt.startManualPlay("pg-gomoku", [
      { role: "host", peerId: hostId },
    ]);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reason).toBe("seats_short");
    expect(rt.getPlayState().phase).toBe("idle");
    expect(a.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "session_play", op: "offer" })
    );
    expect(chromeSession.setFlash).not.toHaveBeenCalled();

    const ok = await rt.startManualPlay("pg-gomoku", [
      { role: "host", peerId: hostId },
      { role: "player", peerId: "g-a" },
    ]);
    expect(ok.ok).toBe(true);
    expect(rt.getStatus().playCatalogId).toBe("pg-gomoku");
    expect(a.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_play",
        op: "offer",
        catalogId: "pg-gomoku",
        seats: [
          { role: "host", peerId: hostId },
          { role: "player", peerId: "g-a" },
        ],
      })
    );
  });

  it("ignores session_play forged by a guest", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    await joinGuests(2);
    const first = boothBridgeFixtures.preparedSlots[0]!;
    const second = boothBridgeFixtures.preparedSlots[1]!;
    const a = first.session;
    const b = second.session;
    a.send.mockClear();
    b.send.mockClear();
    first.handlers.onMessage!({
      type: "session_play",
      v: 1,
      op: "offer",
      from: "g-a",
      catalogId: "pg-gomoku",
      seats: [{ role: "host", peerId: "g-a" }],
    });
    expect(rt.getPlayState().phase).toBe("idle");
    expect(b.send).not.toHaveBeenCalled();
  });

  it("tracks operator roster slot without inflating guest count", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();

    expect(boothBridgeFixtures.getLocalPresence?.()).toEqual(
      expect.objectContaining({
        agentId: expect.stringMatching(/^go-room-/),
        name: "太郎",
      })
    );

    const shellId = "op-abc";
    const handlers = boothBridgeFixtures.prepareOperatorRoster!(shellId);
    const session = mockSession();
    boothBridgeFixtures.onOperatorSession!({ shellId, session });

    expect(rt.getStatus().guestCount).toBe(0);
    expect(rt.getStatus().occupantPeers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          peerId: "op-op-abc",
          kind: "operator",
        }),
      ])
    );

    handlers.onMessage!({
      type: "presence",
      agentId: "op-op-abc",
      name: "遠端使用者",
    });
    expect(
      rt.getStatus().occupantPeers.find((p) => p.peerId === "op-op-abc")?.name
    ).toBe("遠端使用者");

    await joinGuests(1);
    expect(rt.getStatus().guestCount).toBe(1);
    expect(
      rt.getStatus().occupantPeers.filter((p) => p.kind === "operator").length
    ).toBe(1);

    session.send.mockClear();
    expect(rt.kickPeer("op-op-abc")).toBe(true);
    expect(session.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ op: "kick" })
    );
    expect(
      rt.getStatus().occupantPeers.some((p) => p.kind === "operator")
    ).toBe(false);
  });
});
