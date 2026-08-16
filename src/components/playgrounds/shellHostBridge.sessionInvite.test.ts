/**
 * shellHostBridge — session Host for work-canvas SAMs + Platform invite mintAndAnswer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostBridgeError } from "./hostBridge";
import { withHostCaller } from "./hostCallerContext";
import {
  createShellHostBridge,
  type ShellHostContext,
} from "./shellHostBridge";
import {
  registerPlatformInviteShell,
  type PlatformInviteMintResult,
} from "./platform/platformInviteShell";
import {
  resetPlatformFieldCredentialForTests,
  setPlatformFieldApiKey,
} from "./platform/platformFieldCredential";
import type { FileMap } from "./projectTypes";

function mockCtx(partial: Partial<ShellHostContext> = {}): ShellHostContext {
  let files: FileMap = {};
  const base: ShellHostContext = {
    getActiveId: () => "work-gomoku",
    getActiveAgentId: () => "agent-steward",
    setActiveAgentId: () => {},
    getTargetOverride: () => null,
    setTargetOverride: () => {},
    openProject: async () => {},
    openEditorFile: () => {},
    afterProjectDeleted: () => {},
    getWorkFiles: () => files,
    patchWorkFile: async (path, content) => {
      files = { ...files, [path]: content };
    },
    removeWorkPath: async () => {},
    reloadWorkCanvas: () => {},
    refreshProjectList: async () => {},
    getCanvasGeneration: () => 1,
    requestDomSnapshot: async () => ({ text: "", truncated: false }),
    captureWorkCanvas: async () => ({
      base64: "AA==",
      mime: "image/png",
    }),
    openToolSession: async () => {},
    closeToolSession: async () => {},
    getToolSession: () => null,
    openMainCanvas: async ({ sandboxId }) => ({
      tabId: `canvas:${sandboxId}`,
      kind: "canvas" as const,
      sandboxId,
      hasGrant: false,
      label: sandboxId,
    }),
    closeMainTab: async () => {},
    setMainTab: async ({ tabId }) => ({
      tabId,
      kind: tabId === "editor" ? ("editor" as const) : ("canvas" as const),
      hasGrant: false,
      label: tabId,
    }),
    listMainTabs: () => ({
      tabs: [
        {
          tabId: "editor",
          kind: "editor" as const,
          hasGrant: false,
          label: "編輯器",
        },
      ],
      activeTabId: "editor",
    }),
    getMainTab: () => ({
      tabId: "editor",
      kind: "editor" as const,
      hasGrant: false,
      label: "編輯器",
    }),
    openMultiAgentSession: async opts => ({
      sessionId: "sess-x",
      channelName: "playgrounds-session:sess-x",
      protocolId: "gomoku.v1",
      apiVersion: "1",
      roles: ["host", "player"],
      hostSandboxId: opts?.hostSandboxId ?? "work-gomoku",
      targetSandboxId: opts?.targetSandboxId ?? "work-gomoku",
    }),
    closeMultiAgentSession: async () => {},
    pauseMultiAgentSession: async () => {},
    resumeMultiAgentSession: async () => {},
    getMultiAgentSession: () => null,
    listMultiAgentSeats: () => [],
    joinMultiAgentSeat: async () => ({
      seatId: "",
      role: "",
      sandboxId: "",
    }),
    leaveMultiAgentSeat: async () => {},
    spawnMultiAgentParticipant: async () => ({
      sandboxId: "",
      seatId: "",
      role: "worker",
      name: "",
    }),
    hostSessionDomainFetch: async () => ({}),
  };
  return { ...base, ...partial };
}

describe("shellHostBridge openSession for work-canvas Host SAM", () => {
  it("uses caller sandbox as host when caller is not the steward", async () => {
    const openMultiAgentSession = vi.fn(async opts => ({
      sessionId: "sess-g",
      channelName: "playgrounds-session:sess-g",
      protocolId: "gomoku.v1",
      apiVersion: "1",
      roles: ["host", "player"],
      hostSandboxId: opts?.hostSandboxId ?? "",
      targetSandboxId: opts?.targetSandboxId ?? "",
    }));
    const host = createShellHostBridge(
      mockCtx({ openMultiAgentSession })
    );
    await withHostCaller("work-gomoku", () => host.openSession());
    expect(openMultiAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        hostSandboxId: "work-gomoku",
        targetSandboxId: "work-gomoku",
      })
    );
  });

  it("keeps steward coding-orch shape when caller is the active agent", async () => {
    const openMultiAgentSession = vi.fn(async opts => ({
      sessionId: "sess-s",
      channelName: "playgrounds-session:sess-s",
      protocolId: "coding-orchestration.v1",
      apiVersion: "1",
      roles: ["orchestrator", "worker"],
      hostSandboxId: opts?.hostSandboxId ?? "",
      targetSandboxId: opts?.targetSandboxId ?? "",
    }));
    const host = createShellHostBridge(
      mockCtx({ openMultiAgentSession })
    );
    await withHostCaller("agent-steward", () => host.openSession());
    expect(openMultiAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        hostSandboxId: "agent-steward",
        targetSandboxId: "work-gomoku",
      })
    );
  });
});

describe("shellHostBridge createPlatformInvite → mintAndAnswer", () => {
  afterEach(() => {
    registerPlatformInviteShell(null);
    resetPlatformFieldCredentialForTests();
  });

  it("routes through PlatformInviteShell.mintAndAnswer when registered", async () => {
    const minted: PlatformInviteMintResult = {
      invite_id: "inv-shell",
      kind: "invite.compose",
      expires_at: Date.now() + 60_000,
      short_url: "https://go.samkuo.me/i/xyz",
      deep_link: "https://play.samkuo.me/#pg=sec",
      secret: "sec",
    };
    const mintAndAnswer = vi.fn(async () => minted);
    registerPlatformInviteShell({ mintAndAnswer });
    const host = createShellHostBridge(mockCtx());
    const out = await host.createPlatformInvite({
      kind: "invite.compose",
      intent: { version: 1 },
    });
    expect(mintAndAnswer).toHaveBeenCalledWith({
      kind: "invite.compose",
      intent: { version: 1 },
      ttlMs: undefined,
    });
    expect(out.invite_id).toBe("inv-shell");
    expect(out.short_url).toContain("go.samkuo.me/i/");
  });

  it("stops the matching shell answer loop when revoking an invite", async () => {
    setPlatformFieldApiKey("pg_sk_test");
    const stopAnswering = vi.fn();
    registerPlatformInviteShell({
      mintAndAnswer: vi.fn(),
      stopAnswering,
    });
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const host = createShellHostBridge(mockCtx());
      await host.revokePlatformInvite({ inviteId: "inv-shell" });
      expect(stopAnswering).toHaveBeenCalledWith("inv-shell");
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to mint-only proxy when invite shell is not registered", async () => {
    setPlatformFieldApiKey("pg_sk_test");
    registerPlatformInviteShell(null);
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          invite_id: "inv-fallback",
          kind: "invite.compose",
          expires_at: Date.now() + 60_000,
          short_url: "https://go.samkuo.me/i/fb",
          deep_link: "https://play.samkuo.me/#pg=x",
          secret: "x",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const host = createShellHostBridge(mockCtx());
      const out = await host.createPlatformInvite({ kind: "invite.compose" });
      expect(out.invite_id).toBe("inv-fallback");
      expect(fetchSpy).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("surfaces not_provisioned when neither shell nor memory key is available", async () => {
    registerPlatformInviteShell(null);
    resetPlatformFieldCredentialForTests();
    const host = createShellHostBridge(mockCtx());
    await expect(host.createPlatformInvite()).rejects.toBeInstanceOf(
      HostBridgeError
    );
    await expect(host.createPlatformInvite()).rejects.toMatchObject({
      code: "not_provisioned",
    });
  });
});
