import { describe, expect, it, beforeEach } from "vitest";
import {
  assertNotWritingActiveAgent,
  createHostBinding,
  getHostBridge,
  HostBridgeError,
  HOST_API_VERSION,
  HOST_CAPABILITIES,
  registerHostBridge,
  type HostBridge,
} from "./hostBridge";
import { createFunctionsEnv } from "./functionsEnv";

function stubBridge(partial: Partial<HostBridge> = {}): HostBridge {
  return {
    apiVersion: async () => HOST_API_VERSION,
    capabilities: async () => [...HOST_CAPABILITIES],
    listProjects: async () => [],
    getProject: async () => null,
    createProject: async () => {
      throw new Error("not implemented");
    },
    cloneProject: async () => {
      throw new Error("not implemented");
    },
    setWorkingSet: async () => {
      throw new Error("not implemented");
    },
    deleteProject: async () => {
      throw new Error("not implemented");
    },
    openProject: async () => {
      throw new Error("not implemented");
    },
    getActiveAgent: async () => null,
    setActiveAgent: async () => {},
    getTargetProject: async () => null,
    setTargetProject: async () => {},
    listFiles: async () => [],
    listDir: async () => ({
      entries: [],
      truncated: false,
      prefix: "",
      depth: 1,
    }),
    readFile: async () => ({
      path: "",
      content: "",
      encoding: "utf-8",
      hash: "",
    }),
    writeFile: async () => ({ path: "", hash: "" }),
    mkdir: async () => ({ path: "" }),
    remove: async () => ({ path: "" }),
    reloadCanvas: async () => ({ ok: true as const }),
    getConsole: async () => [],
    clearConsole: async () => ({ ok: true as const }),
    waitConsole: async () => ({ lines: [], timedOut: true }),
    getCanvasStatus: async () => ({
      hasTarget: false,
      sandboxId: null,
      generation: 0,
      consoleSize: 0,
      networkSize: 0,
      recentErrorCount: 0,
      entry: "index.html",
    }),
    getNetworkLog: async () => [],
    clearNetworkLog: async () => ({ ok: true as const }),
    getDomSnapshot: async () => ({ text: "", truncated: false }),
    runPython: async () => ({
      ok: true as const,
      stdout: "",
      stderr: "",
      packages: [],
      pyodideVersion: "test",
    }),
    runCmd: async () => ({
      stdout: "",
      stderr: "",
      exitCode: 0,
    }),
    listCmds: async () => ({ commands: [] }),
    readFileBase64: async () => ({
      path: "",
      base64: "",
      encoding: "base64" as const,
      byteLength: 0,
      hash: "",
    }),
    writeFileBase64: async () => ({ path: "", byteLength: 0, hash: "" }),
    openFile: async () => ({ path: "", sandboxId: "" }),
    openTool: async () => ({
      toolSandboxId: "",
      hostSandboxId: "",
      paths: [],
      mode: "read" as const,
    }),
    closeTool: async () => ({ ok: true as const }),
    getToolSession: async () => null,
    openMainCanvas: async () => ({
      tabId: "editor",
      kind: "editor" as const,
      hasGrant: false,
      label: "編輯器",
    }),
    closeMainTab: async () => ({ ok: true as const }),
    setMainTab: async () => ({
      tabId: "editor",
      kind: "editor" as const,
      hasGrant: false,
      label: "編輯器",
    }),
    listMainTabs: async () => ({
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
    getMainTab: async () => ({
      tabId: "editor",
      kind: "editor" as const,
      hasGrant: false,
      label: "編輯器",
    }),
    openSession: async () => ({
      sessionId: "",
      channelName: "",
      protocolId: "",
      apiVersion: "1",
      roles: [],
    }),
    closeSession: async () => ({ ok: true as const }),
    pauseSession: async () => ({
      ok: true as const,
      status: "paused" as const,
    }),
    resumeSession: async () => ({ ok: true as const, status: "open" as const }),
    getSession: async () => null,
    listSeats: async () => [],
    joinSeat: async () => ({ seatId: "", role: "", sandboxId: "" }),
    leaveSeat: async () => ({ ok: true as const }),
    spawnParticipant: async () => ({
      sandboxId: "",
      seatId: "",
      role: "worker",
      name: "",
    }),
    hostSessionFetch: async () => ({}),
    captureCanvas: async () => ({
      mime: "image/png" as const,
      byteLength: 0,
      base64: "",
    }),
    listSecretNames: async () => ({ names: [] }),
    getSecretStoreStatus: async () => ({ state: "absent" as const }),
    listSecrets: async () => ({ secrets: [] }),
    createPlatformInvite: async () => ({
      invite_id: "",
      kind: "signal.handshake",
      expires_at: 0,
      short_url: "",
      deep_link: "",
      secret: "",
    }),
    revokePlatformInvite: async () => ({ ok: true as const }),
    search: async () => ({ matches: [] }),
    checkpoint: async () => {
      throw new Error("not implemented");
    },
    restore: async () => {
      throw new Error("not implemented");
    },
    listCheckpoints: async () => [],
    listFleetSummary: async () => ({
      leader: { isLeader: true, epoch: 0 },
      counts: {},
      pressure: {
        mailboxDepthTotal: 0,
        nearFullCount: 0,
        poisonTotal: 0,
      },
      attention: [],
      agents: [],
      generatedAt: 0,
    }),
    getAgentUi: async () => null,
    setAgentUi: async () => null,
    ...partial,
  };
}

describe("createFunctionsEnv HOST injection", () => {
  beforeEach(() => {
    registerHostBridge(null);
  });

  it("exposes only KV for non-agent projects", () => {
    registerHostBridge(stubBridge());
    const env = createFunctionsEnv("work-1", {
      activeAgentSandboxId: "agent-1",
    });
    expect(env.KV).toBeDefined();
    expect(env.HOST).toBeUndefined();
  });

  it("exposes HOST for the active agent when bridge is registered", () => {
    registerHostBridge(stubBridge());
    const env = createFunctionsEnv("agent-1", {
      activeAgentSandboxId: "agent-1",
    });
    expect(env.HOST).toBeDefined();
  });

  it("omits HOST when bridge is missing", () => {
    const env = createFunctionsEnv("agent-1", {
      activeAgentSandboxId: "agent-1",
    });
    expect(env.HOST).toBeUndefined();
  });
});

describe("assertNotWritingActiveAgent", () => {
  it("allows writes to other projects", () => {
    expect(() =>
      assertNotWritingActiveAgent("work", "agent", "write")
    ).not.toThrow();
  });

  it("rejects writes to the active agent", () => {
    expect(() =>
      assertNotWritingActiveAgent("agent", "agent", "write")
    ).toThrow(HostBridgeError);
  });
});

describe("createHostBinding", () => {
  beforeEach(() => {
    registerHostBridge(null);
  });

  it("delegates to the registered bridge", async () => {
    registerHostBridge(
      stubBridge({
        getActiveAgent: async () => "agent-x",
      })
    );
    expect(getHostBridge()).not.toBeNull();
    const host = createHostBinding();
    expect(await host.getActiveAgent()).toBe("agent-x");
  });

  it("throws when bridge is missing", async () => {
    const host = createHostBinding();
    await expect(host.listProjects()).rejects.toMatchObject({
      name: "HostBridgeError",
      code: "host_unavailable",
    });
  });

  it("exposes apiVersion and capabilities", async () => {
    registerHostBridge(stubBridge());
    const host = createHostBinding();
    expect(await host.apiVersion()).toBe(HOST_API_VERSION);
    const caps = await host.capabilities();
    expect(caps).toContain("search");
    expect(caps).toContain("waitConsole");
    expect(caps).toContain("checkpoint");
    expect(caps).toContain("getNetworkLog");
    expect(caps).toContain("getDomSnapshot");
    expect(caps).toContain("runPython");
    expect(caps).toContain("runCmd");
    expect(caps).toContain("listCmds");
    expect(caps).toContain("readFileBase64");
    expect(caps).toContain("captureCanvas");
    expect(caps).toContain("listSecretNames");
    expect(caps).toContain("getSecretStoreStatus");
    expect(caps).toContain("listSecrets");
    expect(caps).toContain("createPlatformInvite");
    expect(caps).toContain("revokePlatformInvite");
    expect(caps).toContain("openTool");
    expect(caps).toContain("closeTool");
    expect(caps).toContain("getToolSession");
  });
});
