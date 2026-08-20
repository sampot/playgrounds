import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  mint: vi.fn(),
  apiKey: vi.fn(() => "pg_sk_test"),
  revoke: vi.fn(),
  startLoop: vi.fn(() => ({ stop: vi.fn(), inviteId: "inv-room" })),
  chatAttach: vi.fn(),
  chatDetach: vi.fn(),
  chatSetBroadcast: vi.fn(),
  filesAttach: vi.fn(),
  filesDetach: vi.fn(),
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

vi.mock("@pg/platform/platformHostLoop", () => ({
  startPlatformHostAnswerLoop: fixtures.startLoop,
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
  },
}));

vi.mock("./goRoomFiles.svelte", () => ({
  goRoomFiles: {
    attach: fixtures.filesAttach,
    detach: fixtures.filesDetach,
    onControl: vi.fn(),
    onBinary: vi.fn(),
    catalogItems: () => [],
    listingOwner: () => null,
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
  },
}));

function mockSession() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
    pc: { addEventListener: vi.fn() },
  };
}

describe("roomRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.apiKey.mockReturnValue("pg_sk_test");
    fixtures.mint.mockResolvedValue({
      invite_id: "inv-room",
      short_url: "https://go.samkuo.me/i/abc123",
      expires_at: Date.now() + 5 * 60 * 1000,
    });
    fixtures.startLoop.mockImplementation((opts: { inviteId: string }) => ({
      stop: vi.fn(),
      inviteId: opts.inviteId,
    }));
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
    expect(fixtures.startLoop).not.toHaveBeenCalled();
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
    expect(fixtures.startLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteId: "inv-room",
        useRelay: false,
        media: "ready",
        maxAnswers: 0,
        localPresence: expect.objectContaining({ name: "太郎" }),
      })
    );
    expect(rt.getStatus().inviteDoor).toBe("live");
    expect(rt.getStatus().shortUrl).toBe("https://go.samkuo.me/i/abc123");
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
    let loopOpts: {
      prepareHandlers: () => {
        handlers: { onChannelClose?: () => void };
        attachSession: (s: ReturnType<typeof mockSession>) => void;
      };
    } | null = null;
    fixtures.startLoop.mockImplementation((opts: typeof loopOpts) => {
      loopOpts = opts;
      return { stop: vi.fn(), inviteId: "inv-room" };
    });
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    const a = mockSession();
    const b = mockSession();
    loopOpts!.prepareHandlers().attachSession(a);
    loopOpts!.prepareHandlers().attachSession(b);
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
    let loopOpts: {
      prepareHandlers: () => {
        handlers: { onMessage: (data: unknown) => void };
        attachSession: (s: ReturnType<typeof mockSession>) => void;
      };
    } | null = null;
    fixtures.startLoop.mockImplementation((opts: typeof loopOpts) => {
      loopOpts = opts;
      return { stop: vi.fn(), inviteId: "inv-room" };
    });
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    const a = mockSession();
    const b = mockSession();
    const first = loopOpts!.prepareHandlers();
    first.attachSession(a);
    const second = loopOpts!.prepareHandlers();
    second.attachSession(b);
    const float = {
      type: "session_chat_ctl",
      v: 1,
      op: "float",
      from: "g-a",
      id: "flt-1",
      emoji: "🎉",
    };
    a.send.mockClear();
    b.send.mockClear();
    first.handlers.onMessage(float);
    expect(b.send).toHaveBeenCalledWith(float);
    expect(a.send).not.toHaveBeenCalledWith(float);
    b.send.mockClear();
    first.handlers.onMessage({
      type: "session_chat_ctl",
      v: 1,
      op: "delete",
      from: "g-a",
      id: "del-1",
      targetId: "m1",
    });
    expect(b.send).not.toHaveBeenCalled();
  });

  it("does not close the booth when one guest leaves", async () => {
    let loopOpts: {
      prepareHandlers: () => {
        handlers: { onChannelClose: () => void };
        attachSession: (s: ReturnType<typeof mockSession>) => void;
      };
    } | null = null;
    fixtures.startLoop.mockImplementation((opts: typeof loopOpts) => {
      loopOpts = opts;
      return { stop: vi.fn(), inviteId: "inv-room" };
    });
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    const first = loopOpts!.prepareHandlers();
    first.attachSession(mockSession());
    const second = loopOpts!.prepareHandlers();
    second.attachSession(mockSession());
    first.handlers.onChannelClose();
    expect(rt.getStatus().phase).toBe("open");
    expect(rt.getStatus().guestCount).toBe(1);
  });

  it("does not introduce guests over session_mesh; Hub star carries data and media", async () => {
    let loopOpts: {
      prepareHandlers: () => {
        handlers: { onMessage: (data: unknown) => void };
        attachSession: (s: ReturnType<typeof mockSession>) => void;
      };
    } | null = null;
    fixtures.startLoop.mockImplementation((opts: typeof loopOpts) => {
      loopOpts = opts;
      return { stop: vi.fn(), inviteId: "inv-room" };
    });
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    const a = mockSession();
    const b = mockSession();
    const first = loopOpts!.prepareHandlers();
    first.attachSession(a);
    first.handlers.onMessage({
      type: "presence",
      agentId: "g-a",
      name: "甲",
    });
    const second = loopOpts!.prepareHandlers();
    second.attachSession(b);
    second.handlers.onMessage({
      type: "presence",
      agentId: "g-b",
      name: "乙",
    });
    expect(b.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_mesh",
      })
    );
    expect(a.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_mesh",
      })
    );

    first.handlers.onMessage({
      type: "session_mesh",
      v: 1,
      op: "offer",
      from: "spoof",
      to: "g-b",
      sdp: "wire",
    });
    expect(b.send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session_mesh",
      })
    );
  });

  it("fans out occupancy so guests see the third person, not only the Host", async () => {
    let loopOpts: {
      prepareHandlers: () => {
        handlers: {
          onMessage: (data: unknown) => void;
          onChannelClose: () => void;
        };
        attachSession: (s: ReturnType<typeof mockSession>) => void;
      };
    } | null = null;
    fixtures.startLoop.mockImplementation((opts: typeof loopOpts) => {
      loopOpts = opts;
      return { stop: vi.fn(), inviteId: "inv-room" };
    });
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    const a = mockSession();
    const b = mockSession();
    const first = loopOpts!.prepareHandlers();
    first.attachSession(a);
    first.handlers.onMessage({
      type: "presence",
      agentId: "g-a",
      name: "甲",
    });
    const second = loopOpts!.prepareHandlers();
    second.attachSession(b);
    second.handlers.onMessage({
      type: "presence",
      agentId: "g-b",
      name: "乙",
    });
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
    first.handlers.onChannelClose();
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
    let loopOpts: {
      prepareHandlers: () => {
        handlers: {
          onMessage: (data: unknown) => void;
          onChannelClose: () => void;
        };
        attachSession: (s: ReturnType<typeof mockSession>) => void;
      };
    } | null = null;
    fixtures.startLoop.mockImplementation((opts: typeof loopOpts) => {
      loopOpts = opts;
      return { stop: vi.fn(), inviteId: "inv-room" };
    });
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    await rt.mintInviteAndAnswer();
    const a = mockSession();
    const b = mockSession();
    const first = loopOpts!.prepareHandlers();
    first.attachSession(a);
    first.handlers.onMessage({
      type: "presence",
      agentId: "g-a",
      name: "甲",
    });
    const second = loopOpts!.prepareHandlers();
    second.attachSession(b);
    second.handlers.onMessage({
      type: "presence",
      agentId: "g-b",
      name: "乙",
    });
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
      { peerId: "g-b", name: "乙" },
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
    expect(fixtures.startLoop).not.toHaveBeenCalled();
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
      const stop = vi.fn();
      fixtures.startLoop.mockImplementation((opts: { inviteId: string }) => ({
        stop,
        inviteId: opts.inviteId,
      }));
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
      expect(stop).toHaveBeenCalled();
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
      expect(fixtures.startLoop).toHaveBeenCalledTimes(1);

      const second = createRoomRuntime({ inviteSession: store });
      await second.openBooth();
      expect(second.getStatus().inviteDoor).toBe("live");
      expect(second.getStatus().shortUrl).toBe(
        "https://go.samkuo.me/i/abc123"
      );
      expect(second.getStatus().inviteExpiresAt).toBe(expiresAt);
      expect(fixtures.startLoop).toHaveBeenCalledTimes(2);
      expect(fixtures.mint).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_500);
      expect(second.getStatus().inviteDoor).toBe("expired");
      expect(second.getStatus().shortUrl).toBeNull();
      expect(store.getItem("pg_go_room_invite_door")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
