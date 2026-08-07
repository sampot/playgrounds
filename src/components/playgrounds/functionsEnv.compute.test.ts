import { afterEach, describe, expect, it, vi } from "vitest";
import { setAdmittedCapabilities } from "./admittedCapabilities";
import { createFunctionsEnv } from "./functionsEnv";

vi.mock("./hostPython", () => ({
  runHostPython: vi.fn(async () => ({
    stdout: "ok",
    stderr: "",
    resultRepr: "None",
  })),
}));

describe("createFunctionsEnv COMPUTE (DEC-036)", () => {
  afterEach(() => {
    setAdmittedCapabilities("compute-p", []);
  });

  it("does not inject COMPUTE without admission", () => {
    const env = createFunctionsEnv("compute-p", {
      admittedCapabilities: [],
    });
    expect(env.COMPUTE).toBeUndefined();
  });

  it("injects COMPUTE with runPython when admitted via options", async () => {
    const env = createFunctionsEnv("compute-p", {
      admittedCapabilities: ["runPython"],
    });
    expect(env.COMPUTE).toBeDefined();
    const compute = env.COMPUTE as {
      capabilities: () => Promise<string[]>;
      runPython: (o: { code: string }) => Promise<unknown>;
      runCmd?: unknown;
    };
    expect(await compute.capabilities()).toEqual(["compute:python"]);
    expect(compute.runCmd).toBeUndefined();
    await expect(compute.runPython({ code: "1+1" })).resolves.toMatchObject({
      stdout: "ok",
    });
  });

  it("reads admission from in-memory registry", () => {
    setAdmittedCapabilities("compute-p", ["runCmd"]);
    const env = createFunctionsEnv("compute-p");
    const compute = env.COMPUTE as {
      capabilities: () => Promise<string[]>;
      runCmd: unknown;
      runPython?: unknown;
    };
    expect(compute).toBeDefined();
    expect(compute.runPython).toBeUndefined();
    expect(typeof compute.runCmd).toBe("function");
  });

  it("can coexist with HOST for steward", async () => {
    const { registerHostBridge } = await import("./hostBridge");
    registerHostBridge({
      apiVersion: async () => "1",
      capabilities: async () => [],
    } as never);
    try {
      const env = createFunctionsEnv("compute-p", {
        activeAgentSandboxId: "compute-p",
        admittedCapabilities: ["runPython"],
      });
      expect(env.HOST).toBeDefined();
      expect(env.COMPUTE).toBeDefined();
    } finally {
      registerHostBridge(null);
    }
  });

  it("injects subset HOST for non-steward with scopes", async () => {
    const { registerHostBridge } = await import("./hostBridge");
    registerHostBridge({
      apiVersion: async () => "1",
      capabilities: async () => ["runPython", "createProject"],
      runPython: async () => ({ stdout: "ok" }),
      createProject: async () => ({ id: "x" }),
    } as never);
    try {
      const env = createFunctionsEnv("scoped-p", {
        activeAgentSandboxId: "other-steward",
        admittedCapabilities: ["compute:python", "sandbox:create"],
      });
      expect(env.HOST).toBeDefined();
      const host = env.HOST as {
        runPython?: unknown;
        createProject?: unknown;
        deleteProject?: unknown;
        capabilities: () => Promise<string[]>;
      };
      expect(typeof host.runPython).toBe("function");
      expect(typeof host.createProject).toBe("function");
      expect(host.deleteProject).toBeUndefined();
      expect(env.COMPUTE).toBeDefined();
    } finally {
      registerHostBridge(null);
    }
  });

  it("gates env.secrets on secrets:get", async () => {
    const { registerHostBridge } = await import("./hostBridge");
    registerHostBridge({
      apiVersion: async () => "1",
      capabilities: async () => [],
    } as never);
    try {
      const noSecret = createFunctionsEnv("sec-p", {
        admittedCapabilities: ["compute:python"],
      });
      expect(Object.keys(noSecret.secrets as object)).toHaveLength(0);

      const withSecret = createFunctionsEnv("sec-p", {
        admittedCapabilities: ["secrets:get"],
      });
      // Bindings may be empty if store locked, but namespace is injected.
      expect(withSecret.secrets).toBeDefined();
    } finally {
      registerHostBridge(null);
    }
  });
});
