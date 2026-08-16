/**
 * env.HOST factory tests (DEC-053). Verify:
 * - apiVersion / capabilities are stable.
 * - openSession / closeSession / pauseSession / resumeSession / getSession
 *   round-trip through the underlying HostRuntime singleton.
 * - listSeats synthesises a host seat (kind: human) and mirrors guest seats.
 * - hostSessionFetch only allows /api/session/* paths; others throw
 *   `forbidden`.
 * - createPlatformInvite forwards to goAuth.mintPlatformInvite and emits the
 *   `invite.compose` Platform event so the share-sheet flow keeps working.
 * - revokePlatformInvite calls goAuth.revokePlatformInvite.
 * - When the runtime getter returns null, methods that need a runtime throw
 *   `session_inactive`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostBridgeError } from "@pg/hostBridge";
import {
  createGoHostBinding,
  GO_HOST_API_VERSION,
  GO_HOST_CAPABILITIES,
} from "./goHostBinding";
import { goAuth } from "./goAuth.svelte";
import {
  subscribeGoShellPlatformEvents,
  type GoShellPlatformEvent,
} from "./goShellPlatform";
import type { HostRuntime, HostStatus } from "./hostRuntime";

function makeStatus(overrides: Partial<HostStatus> = {}): HostStatus {
  return {
    phase: "idle",
    message: "",
    error: null,
    sessionId: null,
    channelName: null,
    inviteId: null,
    shortUrl: null,
    hostRole: "host",
    guestRoles: ["player"],
    guestTarget: 1,
    seats: [],
    protocolId: "gomoku.v1",
    apiVersion: "1",
    ...overrides,
  };
}

type RuntimeMock = HostRuntime & {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  act: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  hostSessionFetch: ReturnType<typeof vi.fn>;
  mintInviteAndAnswer: ReturnType<typeof vi.fn>;
  adoptSamInvite: ReturnType<typeof vi.fn>;
  stopAnsweringInvite: ReturnType<typeof vi.fn>;
};

function makeRuntime(overrides: Partial<HostStatus> = {}): RuntimeMock {
  let status = makeStatus(overrides);
  const open = vi.fn(async () => {
    status = { ...status, phase: "open", sessionId: "sess-1", channelName: "playgrounds-session:sess-1" };
  });
  const close = vi.fn(async () => {
    status = { ...status, phase: "idle", sessionId: null, channelName: null };
  });
  const act = vi.fn(async () => ({ ok: true, events: [] }));
  const getStatus = vi.fn(() => ({ ...status }));
  const subscribe = vi.fn(() => () => {});
  const dispose = vi.fn();
  const hostSessionFetch = vi.fn(async () => ({ ok: true }));
  const mintInviteAndAnswer = vi.fn(async () => ({
    inviteId: "inv-1",
    shortUrl: "https://go.samkuo.me/i/test",
  }));
  const adoptSamInvite = vi.fn(async () => undefined);
  const stopAnsweringInvite = vi.fn();
  const runtime = {
    open,
    close,
    act,
    getStatus,
    subscribe,
    dispose,
    hostSessionFetch,
    mintInviteAndAnswer,
    adoptSamInvite,
    stopAnsweringInvite,
  };
  return runtime as unknown as RuntimeMock;
}

describe("createGoHostBinding — surface shape", () => {
  it("apiVersion matches the canonical contract version", async () => {
    const binding = createGoHostBinding({ getHostRuntime: () => null });
    expect(await binding.apiVersion()).toBe(GO_HOST_API_VERSION);
  });

  it("capabilities lists the pg-gomoku subset (no extras yet)", async () => {
    const binding = createGoHostBinding({ getHostRuntime: () => null });
    const caps = await binding.capabilities();
    expect(caps).toEqual([...GO_HOST_CAPABILITIES]);
    // Declared capabilities must cover the session host + platform invite
    // surfaces pg-gomoku calls.
    expect(caps).toContain("hostSessionOpen");
    expect(caps).toContain("hostSessionFetch");
    expect(caps).toContain("platformInviteMint");
  });
});

describe("createGoHostBinding — session lifecycle", () => {
  it("openSession opens the runtime and returns the canonical shape", async () => {
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    const opened = await binding.openSession();
    expect(rt.open).toHaveBeenCalledTimes(1);
    expect(opened.sessionId).toBe("sess-1");
    expect(opened.channelName).toBe("playgrounds-session:sess-1");
    expect(opened.protocolId).toBe("gomoku.v1");
    expect(opened.roles).toEqual(["host", "player"]);
  });

  it("closeSession delegates to runtime.close", async () => {
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    await binding.closeSession();
    expect(rt.close).toHaveBeenCalledTimes(1);
  });

  it("pauseSession closes the runtime (no native pause in v1)", async () => {
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    const out = await binding.pauseSession();
    expect(rt.close).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ok: true, status: "closed" });
  });

  it("resumeSession reopens the runtime", async () => {
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    const out = await binding.resumeSession();
    expect(rt.open).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ ok: true, status: "open" });
  });

  it("getSession returns null when no runtime is bound", async () => {
    const binding = createGoHostBinding({ getHostRuntime: () => null });
    expect(await binding.getSession()).toBeNull();
  });

  it("getSession returns null when the runtime is idle/error", async () => {
    const binding = createGoHostBinding({
      getHostRuntime: () => makeRuntime({ phase: "idle" }),
    });
    expect(await binding.getSession()).toBeNull();
  });

  it("getSession returns the canonical shape when open", async () => {
    const rt = makeRuntime({
      phase: "waiting",
      sessionId: "sess-2",
      channelName: "playgrounds-session:sess-2",
    });
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    const out = await binding.getSession();
    expect(out).not.toBeNull();
    expect(out?.sessionId).toBe("sess-2");
    expect(out?.protocolId).toBe("gomoku.v1");
    expect(out?.status).toBe("open");
  });

  it("throws HostBridgeError('session_inactive') when no runtime is available", async () => {
    const binding = createGoHostBinding({ getHostRuntime: () => null });
    await expect(binding.openSession()).rejects.toBeInstanceOf(HostBridgeError);
    await expect(binding.openSession()).rejects.toMatchObject({
      code: "session_inactive",
    });
  });
});

describe("createGoHostBinding — listSeats", () => {
  it("returns just the host seat when no guests are seated", async () => {
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    const seats = await binding.listSeats();
    expect(seats).toEqual([
      {
        seatId: "host",
        role: "host",
        kind: "human",
        sandboxId: null,
        paused: false,
      },
    ]);
  });

  it("appends guest seats with their peerId as sandboxId", async () => {
    const rt = makeRuntime({
      seats: [
        { seatId: "seat-1", role: "player", peerId: "peer-1", inviteId: "inv-1" },
      ],
    });
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    const seats = await binding.listSeats();
    expect(seats).toHaveLength(2);
    expect(seats[0]).toMatchObject({ seatId: "host", kind: "human" });
    expect(seats[1]).toMatchObject({
      seatId: "seat-1",
      role: "player",
      kind: "human",
      sandboxId: "peer-1",
    });
  });

  it("returns [] when no runtime is bound", async () => {
    const binding = createGoHostBinding({ getHostRuntime: () => null });
    expect(await binding.listSeats()).toEqual([]);
  });
});

describe("createGoHostBinding — hostSessionFetch", () => {
  it("forwards /api/session/* paths to runtime.hostSessionFetch", async () => {
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    await binding.hostSessionFetch("/api/session/act", {
      method: "POST",
      body: '{"role":"host"}',
    });
    expect(rt.hostSessionFetch).toHaveBeenCalledWith("/api/session/act", {
      method: "POST",
      body: '{"role":"host"}',
    });
  });

  it("rejects paths outside /api/session/* with forbidden", async () => {
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    await expect(
      binding.hostSessionFetch("/api/scores", { method: "GET" })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(rt.hostSessionFetch).not.toHaveBeenCalled();
  });

  it("normalizes leading-slash-less paths", async () => {
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    await binding.hostSessionFetch("api/session/state", { method: "GET" });
    expect(rt.hostSessionFetch).toHaveBeenCalledWith(
      "/api/session/state",
      expect.objectContaining({ method: "GET" })
    );
  });
});

describe("createGoHostBinding — platform invite", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    goAuth.__setApiKeyForTests(null);
    if (originalFetch) globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forwards createPlatformInvite to goAuth.mintPlatformInvite", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          invite_id: "inv_x",
          kind: "invite.compose",
          expires_at: 1780000000000,
          short_url: "https://go.samkuo.me/i/x",
          deep_link: "https://go.samkuo.me/i/x",
          secret: "sec",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);
    const rt = makeRuntime();
    const binding = createGoHostBinding({
      getHostRuntime: () => rt,
    });
    const out = await binding.createPlatformInvite({
      kind: "invite.compose",
      intent: { version: 1 },
    });
    expect(out.invite_id).toBe("inv_x");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(rt.open).toHaveBeenCalled();
    expect(rt.adoptSamInvite).toHaveBeenCalledWith({
      inviteId: "inv_x",
      shortUrl: "https://go.samkuo.me/i/x",
    });
  });

  it("emits invite.compose event on successful mint", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            invite_id: "inv_y",
            kind: "invite.compose",
            expires_at: 1780000000000,
            short_url: "https://go.samkuo.me/i/y",
            deep_link: "https://go.samkuo.me/i/y",
            secret: "sec",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    const events: GoShellPlatformEvent[] = [];
    const unsub = subscribeGoShellPlatformEvents(ev => events.push(ev));
    try {
      const binding = createGoHostBinding({
        getHostRuntime: () => makeRuntime(),
      });
      await binding.createPlatformInvite();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        kind: "invite.compose",
        inviteId: "inv_y",
        shortUrl: "https://go.samkuo.me/i/y",
      });
    } finally {
      unsub();
    }
  });

  it("emits login_needed event + throws HostBridgeError when not provisioned", async () => {
    goAuth.__setApiKeyForTests(null);
    const events: GoShellPlatformEvent[] = [];
    const unsub = subscribeGoShellPlatformEvents(ev => events.push(ev));
    try {
      const binding = createGoHostBinding({
        getHostRuntime: () => makeRuntime(),
      });
      await expect(binding.createPlatformInvite()).rejects.toBeInstanceOf(
        HostBridgeError
      );
      await expect(binding.createPlatformInvite()).rejects.toMatchObject({
        code: "not_provisioned",
      });
      // Two login_needed events (one per failed mint call).
      expect(events.filter(e => e.kind === "login_needed")).toHaveLength(2);
    } finally {
      unsub();
    }
  });

  it("revokePlatformInvite stops polling and delegates to goAuth", async () => {
    goAuth.__setApiKeyForTests("pg_sk_test");
    const events: GoShellPlatformEvent[] = [];
    const unsub = subscribeGoShellPlatformEvents(ev => events.push(ev));
    const spy = vi
      .spyOn(goAuth, "revokePlatformInvite")
      .mockResolvedValue(undefined);
    const rt = makeRuntime();
    const binding = createGoHostBinding({ getHostRuntime: () => rt });
    try {
      await binding.revokePlatformInvite({ inviteId: "inv_z" });
      expect(rt.stopAnsweringInvite).toHaveBeenCalledWith("inv_z");
      expect(spy).toHaveBeenCalledWith("inv_z");
      expect(events).toContainEqual({
        kind: "invite_revoked",
        inviteId: "inv_z",
      });
    } finally {
      unsub();
    }
  });
});
