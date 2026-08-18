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
  },
}));

vi.mock("./chromeSession.svelte", () => ({
  chromeSession: { setFlash: vi.fn() },
}));

function mockSession() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    getChannel: () => ({ readyState: "open" as const, send: vi.fn() }),
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

  it("opens the booth UI before anyone joins and keeps answering", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    await rt.openBooth();
    expect(rt.getStatus().phase).toBe("open");
    expect(fixtures.chatAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: "page",
        localRole: "host",
        localName: "太郎",
      })
    );
    expect(fixtures.filesAttach).toHaveBeenCalled();
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
    const first = loopOpts!.prepareHandlers();
    first.attachSession(mockSession());
    const second = loopOpts!.prepareHandlers();
    second.attachSession(mockSession());
    first.handlers.onChannelClose();
    expect(rt.getStatus().phase).toBe("open");
    expect(rt.getStatus().guestCount).toBe(1);
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

  it("does not mint twice when openBooth overlaps", async () => {
    let release: (v: unknown) => void = () => {};
    fixtures.mint.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    const first = rt.openBooth();
    const second = rt.openBooth();
    release({
      invite_id: "inv-room",
      short_url: "https://go.samkuo.me/i/abc123",
      expires_at: Date.now() + 5 * 60 * 1000,
    });
    await Promise.all([first, second]);
    expect(fixtures.mint).toHaveBeenCalledTimes(1);
  });
});
