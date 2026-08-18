import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  mint: vi.fn(),
  apiKey: vi.fn(() => "pg_sk_test"),
  revoke: vi.fn(),
  startLoop: vi.fn(() => ({ stop: vi.fn(), inviteId: "inv-room" })),
  chatAttach: vi.fn(),
  chatDetach: vi.fn(),
  filesAttach: vi.fn(),
  filesDetach: vi.fn(),
}));

vi.mock("./goAuth.svelte", () => ({
  goAuth: {
    mintPlatformInvite: fixtures.mint,
    getPlatformApiKeyForHostLoop: fixtures.apiKey,
    revokePlatformInvite: fixtures.revoke,
    wantsTurnRelay: () => true,
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
    setBroadcast: vi.fn(),
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

describe("roomRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.apiKey.mockReturnValue("pg_sk_test");
    fixtures.mint.mockResolvedValue({
      invite_id: "inv-room",
      short_url: "https://go.samkuo.me/i/abc123",
      expires_at: Date.now() + 5 * 60 * 1000,
    });
  });

  it("mints invite.room without TURN relay and reserves A/V m-lines", async () => {
    const { createRoomRuntime } = await import("./roomRuntime");
    const rt = createRoomRuntime();
    const created = await rt.mintInviteAndAnswer();
    expect(created?.shortUrl).toContain("/i/");
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
        maxAnswers: 1,
      })
    );
    expect(rt.getStatus().phase).toBe("waiting");
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
    expect(rt.getStatus().phase).toBe("error");
  });
});
