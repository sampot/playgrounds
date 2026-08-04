import { describe, expect, it } from "vitest";
import { HostBridgeError } from "./hostBridge";
import { bytesToBase64, HOST_BINARY_MAX_BYTES } from "./hostBinary";
import {
  createShellHostBridge,
  type ShellHostContext,
} from "./shellHostBridge";
import type { FileMap } from "./projectTypes";

function mockCtx(partial: Partial<ShellHostContext> = {}): ShellHostContext {
  let files: FileMap = {};
  const base: ShellHostContext = {
    getActiveId: () => "work-1",
    getActiveAgentId: () => "agent-1",
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
      base64: bytesToBase64(new Uint8Array([137, 80, 78, 71])),
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
    openMultiAgentSession: async () => ({
      sessionId: "",
      channelName: "",
      protocolId: "",
      apiVersion: "1",
      roles: [],
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

describe("shellHostBridge binary + capture", () => {
  it("writeFileBase64 / readFileBase64 round-trip on work project", async () => {
    const host = createShellHostBridge(mockCtx());
    const payload = new Uint8Array([1, 2, 3, 4]);
    const written = await host.writeFileBase64(
      "assets/a.bin",
      bytesToBase64(payload)
    );
    expect(written.byteLength).toBe(4);
    const read = await host.readFileBase64("assets/a.bin");
    expect(read.byteLength).toBe(4);
    expect([...Buffer.from(read.base64, "base64")]).toEqual([1, 2, 3, 4]);
  });

  it("rejects oversized writes", async () => {
    const host = createShellHostBridge(mockCtx());
    const bytes = new Uint8Array(HOST_BINARY_MAX_BYTES + 1);
    await expect(
      host.writeFileBase64("big.bin", bytesToBase64(bytes))
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("rejects writing active agent", async () => {
    const host = createShellHostBridge(
      mockCtx({
        getActiveId: () => "agent-1",
        getActiveAgentId: () => "agent-1",
      })
    );
    await expect(
      host.writeFileBase64("x.bin", bytesToBase64(new Uint8Array([1])))
    ).rejects.toBeInstanceOf(HostBridgeError);
  });

  it("captureCanvas writes path without returning base64", async () => {
    const patched: Array<{ path: string; reload?: boolean }> = [];
    const host = createShellHostBridge(
      mockCtx({
        patchWorkFile: async (path, _content, options) => {
          patched.push({ path, reload: options?.reloadCanvas });
        },
      })
    );
    const out = await host.captureCanvas({ path: "shots/x.png" });
    expect(out.path).toBe("shots/x.png");
    expect(out.base64).toBeUndefined();
    expect(out.mime).toBe("image/png");
    expect(out.byteLength).toBeGreaterThan(0);
    expect(out.note).toMatch(/Do NOT call reload_canvas/u);
    expect(patched).toEqual([{ path: "shots/x.png", reload: false }]);
  });

  it("openFile selects path in shell editor after write", async () => {
    const opened: string[] = [];
    const projects: string[] = [];
    const host = createShellHostBridge(
      mockCtx({
        openProject: async id => {
          projects.push(id);
        },
        openEditorFile: path => {
          opened.push(path);
        },
      })
    );
    await host.writeFileBase64(
      "charts/plot.png",
      bytesToBase64(new Uint8Array([137, 80, 78, 71]))
    );
    const out = await host.openFile("charts/plot.png");
    expect(out).toEqual({ path: "charts/plot.png", sandboxId: "work-1" });
    expect(opened).toEqual(["charts/plot.png"]);
    expect(projects).toEqual([]);
  });

  it("openFile with content is terminal (no openProject)", async () => {
    const opened: string[] = [];
    const patched: string[] = [];
    const host = createShellHostBridge(
      mockCtx({
        openProject: async () => {
          throw new Error("openProject must not run for terminal openFile");
        },
        openEditorFile: path => {
          opened.push(path);
        },
        patchWorkFile: async (path, content) => {
          patched.push(path);
          expect(content).toBe("hello");
        },
      })
    );
    const out = await host.openFile({ path: "notes.md", content: "hello" });
    expect(out).toEqual({ path: "notes.md", sandboxId: "work-1" });
    expect(opened).toEqual(["notes.md"]);
    expect(patched).toEqual(["notes.md"]);
  });

  it("openFile rejects other sandbox without content (terminal)", async () => {
    const host = createShellHostBridge(mockCtx());
    await expect(host.openFile("x.md", "other-sandbox")).rejects.toMatchObject({
      code: "bad_request",
    });
  });

  it("openFile rejects missing paths", async () => {
    const host = createShellHostBridge(mockCtx());
    await expect(host.openFile("missing.png")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("openTool / getToolSession / closeTool round-trip", async () => {
    let session: {
      toolSandboxId: string;
      hostSandboxId: string;
      paths: string[];
      mode: "read" | "readwrite";
      focusPath?: string;
    } | null = null;
    const host = createShellHostBridge(
      mockCtx({
        openToolSession: async opts => {
          session = {
            toolSandboxId: opts.toolSandboxId,
            hostSandboxId: "work-1",
            paths: opts.paths,
            mode: opts.mode,
            ...(opts.focusPath ? { focusPath: opts.focusPath } : {}),
          };
        },
        closeToolSession: async () => {
          session = null;
        },
        getToolSession: () => session,
      })
    );
    const opened = await host.openTool({
      toolSandboxId: "tool-1",
      paths: ["README.md"],
      mode: "readwrite",
      focusPath: "README.md",
    });
    expect(opened.toolSandboxId).toBe("tool-1");
    expect(opened.hostSandboxId).toBe("work-1");
    expect(await host.getToolSession()).toEqual(opened);
    await host.closeTool();
    expect(await host.getToolSession()).toBeNull();
  });

  it("openTool requires work project", async () => {
    const host = createShellHostBridge(
      mockCtx({
        getActiveId: () => null,
      })
    );
    await expect(
      host.openTool({ toolSandboxId: "tool-1", paths: ["a.md"] })
    ).rejects.toMatchObject({ code: "no_target" });
  });
});
