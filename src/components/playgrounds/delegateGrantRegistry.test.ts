import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllDelegateGrants,
  clearDelegateGrant,
  clearDelegateGrantsForTask,
  clearWorkerDelegateGrants,
  getDelegateGrant,
  listDelegateGrants,
  setWorkerDelegateGrant,
} from "./delegateGrantRegistry";
import { createFunctionsEnv } from "./functionsEnv";
import {
  createDelegateBinding,
  registerScopedDelegateHost,
  registerToolBridge,
  type ToolBridge,
} from "./toolBridge";
import { createShellToolBridge } from "./shellToolBridge";
import type { ToolSession } from "./toolGrant";

describe("delegateGrantRegistry", () => {
  beforeEach(() => {
    clearAllDelegateGrants();
  });

  it("sets and clears worker grants", () => {
    setWorkerDelegateGrant({
      sandboxId: "worker-1",
      hostSandboxId: "work",
      paths: ["src/a.js"],
      taskId: "t1",
      seatId: "seat-1",
    });
    expect(getDelegateGrant("worker-1")?.taskId).toBe("t1");
    expect(clearDelegateGrantsForTask("t1")).toBe(1);
    expect(getDelegateGrant("worker-1")).toBeNull();
  });

  it("clearWorkerDelegateGrants keeps non-worker entries out", () => {
    setWorkerDelegateGrant({
      sandboxId: "w1",
      hostSandboxId: "h",
      paths: ["src"],
      taskId: "t1",
    });
    expect(listDelegateGrants()).toHaveLength(1);
    expect(clearWorkerDelegateGrants()).toBe(1);
    expect(listDelegateGrants()).toHaveLength(0);
  });
});

describe("createFunctionsEnv worker DELEGATE", () => {
  let session: ToolSession | null;

  beforeEach(() => {
    clearAllDelegateGrants();
    registerToolBridge(null);
    registerScopedDelegateHost(null);
    session = null;
    const shell = createShellToolBridge({
      getSessionFor: id => {
        if (session?.toolSandboxId === id) return session;
        const g = getDelegateGrant(id);
        if (!g) return null;
        return {
          toolSandboxId: id,
          grant: g.grant,
          focusPath: g.focusPath,
        };
      },
      getSession: () => session,
      getActiveId: () => "work",
      getActiveAgentId: () => "steward",
      getHostFiles: () => ({ "src/a.js": "console.log(1)" }),
      patchHostFile: async () => {},
      closeToolSession: async () => {
        session = null;
      },
    });
    registerToolBridge(shell);
    registerScopedDelegateHost(shell);
  });

  it("injects DELEGATE for worker with registry grant", async () => {
    setWorkerDelegateGrant({
      sandboxId: "worker-1",
      hostSandboxId: "work",
      paths: ["src/a.js"],
      mode: "readwrite",
      taskId: "t1",
    });
    const env = createFunctionsEnv("worker-1", {
      files: { "index.html": "<html></html>" },
    });
    expect(env.DELEGATE).toBeDefined();
    expect(env.HOST).toBeUndefined();
    const del = env.DELEGATE as ToolBridge;
    const read = await del.readFile("src/a.js");
    expect(read.content).toBe("console.log(1)");
    await del.writeFile("src/a.js", "ok");
  });

  it("injects DELEGATE for tool grant in registry without activeToolSandboxId", async () => {
    const { setDelegateGrant } = await import("./delegateGrantRegistry");
    setDelegateGrant({
      sandboxId: "dbtool",
      source: "tool",
      grant: {
        hostSandboxId: "work",
        paths: [".bindings/db"],
        mode: "readwrite",
      },
      focusPath: ".bindings/db",
    });
    // No tool bridge required for injection flag; registry is enough.
    registerToolBridge(null);
    registerScopedDelegateHost(null);
    const env = createFunctionsEnv("dbtool", {
      files: { "index.html": "<html></html>" },
    });
    expect(env.DELEGATE).toBeDefined();
    expect(env.TOOL).toBe(env.DELEGATE);
  });
});
