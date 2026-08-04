import { beforeEach, describe, expect, it } from "vitest";
import { createFunctionsEnv } from "./functionsEnv";
import { registerHostBridge } from "./hostBridge";
import type { FileContent } from "./fileContent";
import { createShellToolBridge } from "./shellToolBridge";
import {
  createToolBinding,
  getToolBridge,
  registerToolBridge,
  TOOL_API_VERSION,
  TOOL_CAPABILITIES,
  ToolBridgeError,
  type ToolBridge,
} from "./toolBridge";
import { normalizeToolSession, type ToolSession } from "./toolGrant";

function stubToolBridge(partial: Partial<ToolBridge> = {}): ToolBridge {
  return {
    apiVersion: async () => TOOL_API_VERSION,
    capabilities: async () => [...TOOL_CAPABILITIES],
    getGrant: async () => ({
      hostSandboxId: "host",
      paths: ["a.md"],
      mode: "readwrite" as const,
    }),
    readFile: async () => ({
      path: "a.md",
      content: "",
      encoding: "utf-8" as const,
      hash: "",
    }),
    writeFile: async () => ({ path: "a.md", hash: "" }),
    readFileBase64: async () => ({
      path: "a.md",
      base64: "",
      encoding: "base64" as const,
      byteLength: 0,
      hash: "",
    }),
    writeFileBase64: async () => ({
      path: "a.md",
      byteLength: 0,
      hash: "",
    }),
    close: async () => ({ ok: true as const }),
    ...partial,
  };
}

describe("createFunctionsEnv TOOL injection", () => {
  beforeEach(() => {
    registerHostBridge(null);
    registerToolBridge(null);
  });

  it("exposes TOOL for the mounted tool project", () => {
    registerToolBridge(stubToolBridge());
    const env = createFunctionsEnv("tool-1", {
      activeToolSandboxId: "tool-1",
      activeAgentSandboxId: "agent-1",
    });
    expect(env.TOOL).toBeDefined();
    expect(env.HOST).toBeUndefined();
  });

  it("prefers TOOL over HOST when ids collide", () => {
    registerToolBridge(stubToolBridge());
    const env = createFunctionsEnv("same", {
      activeToolSandboxId: "same",
      activeAgentSandboxId: "same",
    });
    expect(env.TOOL).toBeDefined();
    expect(env.HOST).toBeUndefined();
  });

  it("omits TOOL when bridge missing", () => {
    const env = createFunctionsEnv("tool-1", {
      activeToolSandboxId: "tool-1",
    });
    expect(env.TOOL).toBeUndefined();
  });
});

describe("createToolBinding", () => {
  beforeEach(() => {
    registerToolBridge(null);
  });

  it("delegates to registered bridge", async () => {
    registerToolBridge(
      stubToolBridge({
        getGrant: async () => ({
          hostSandboxId: "h",
          paths: ["x.md"],
          mode: "read",
        }),
      })
    );
    expect(getToolBridge()).not.toBeNull();
    const tool = createToolBinding();
    expect(await tool.apiVersion()).toBe(TOOL_API_VERSION);
    expect((await tool.getGrant()).paths).toEqual(["x.md"]);
  });

  it("throws grant_inactive when bridge missing", async () => {
    const tool = createToolBinding();
    await expect(tool.getGrant()).rejects.toMatchObject({
      name: "ToolBridgeError",
      code: "grant_inactive",
    });
  });
});

describe("createShellToolBridge grant FS", () => {
  let session: ToolSession | null;
  let hostFiles: Record<string, FileContent>;
  let closed: boolean;

  beforeEach(() => {
    hostFiles = {
      "docs/a.md": "hello",
      "data/x.csv": "1,2",
      "secret.env": "nope",
    };
    closed = false;
    session = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "host-1",
      paths: ["docs/a.md", "data"],
      mode: "readwrite",
      focusPath: "docs/a.md",
    });
  });

  function makeBridge(mode: "read" | "readwrite" = "readwrite") {
    session = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "host-1",
      paths: ["docs/a.md", "data"],
      mode,
      focusPath: "docs/a.md",
    });
    return createShellToolBridge({
      getSessionFor: () => session,
      getSession: () => session,
      getActiveId: () => "host-1",
      getActiveAgentId: () => "agent-1",
      getHostFiles: () => hostFiles,
      patchHostFile: async (path, content) => {
        hostFiles = { ...hostFiles, [path]: content };
      },
      closeToolSession: () => {
        closed = true;
        session = null;
      },
    });
  }

  it("reads and writes granted paths", async () => {
    const b = makeBridge();
    const read = await b.readFile("docs/a.md");
    expect(read.content).toBe("hello");
    await b.writeFile("docs/a.md", "world");
    expect(hostFiles["docs/a.md"]).toBe("world");
    await b.writeFile("data/y.csv", "a,b");
    expect(hostFiles["data/y.csv"]).toBe("a,b");
  });

  it("forbids path outside grant", async () => {
    const b = makeBridge();
    await expect(b.readFile("secret.env")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects write when read-only", async () => {
    const b = makeBridge("read");
    await expect(b.writeFile("docs/a.md", "x")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects write to active agent host", async () => {
    session = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "agent-1",
      paths: ["a.md"],
      mode: "readwrite",
    });
    const b = createShellToolBridge({
      getSessionFor: () => session,
      getSession: () => session,
      getActiveId: () => "work",
      getActiveAgentId: () => "agent-1",
      getHostFiles: () => ({ "a.md": "x" }),
      patchHostFile: async () => {},
      closeToolSession: async () => {},
    });
    await expect(b.writeFile("a.md", "x")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("close clears session via callback", async () => {
    const b = makeBridge();
    await b.close();
    expect(closed).toBe(true);
  });

  it("getGrant returns focusPath", async () => {
    const b = makeBridge();
    const g = await b.getGrant();
    expect(g.focusPath).toBe("docs/a.md");
    expect(g.mode).toBe("readwrite");
  });

  it("tool_inactive without session", async () => {
    const b = makeBridge();
    session = null;
    await expect(b.readFile("docs/a.md")).rejects.toBeInstanceOf(
      ToolBridgeError
    );
  });
});
