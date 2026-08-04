import { beforeEach, describe, expect, it } from "vitest";
import { createFunctionsEnv } from "./functionsEnv";
import { clearAllSessionBridges, registerSessionBridge } from "./sessionBridge";
import {
  initializeSecretStore,
  lockSecretStore,
  resetSecretStoreForTests,
  setSecret,
} from "./secretStore";
import {
  registerToolBridge,
  TOOL_API_VERSION,
  TOOL_CAPABILITIES,
  type ToolBridge,
} from "./toolBridge";

function stubToolBridge(): ToolBridge {
  return {
    apiVersion: async () => TOOL_API_VERSION,
    capabilities: async () => [...TOOL_CAPABILITIES],
    getGrant: async () => ({
      hostSandboxId: "host",
      paths: ["*"],
      mode: "read" as const,
    }),
    readFile: async () => ({
      path: "a",
      content: "",
      encoding: "utf-8" as const,
      hash: "",
    }),
    writeFile: async () => ({ path: "a", hash: "" }),
    readFileBase64: async () => ({
      path: "a",
      base64: "",
      encoding: "base64" as const,
      byteLength: 0,
      hash: "",
    }),
    writeFileBase64: async () => ({ path: "a", byteLength: 0, hash: "" }),
    close: async () => ({ ok: true as const }),
  };
}

describe("createFunctionsEnv secret bindings (DEC-029／035)", () => {
  beforeEach(async () => {
    await resetSecretStoreForTests();
    clearAllSessionBridges();
    registerToolBridge(null);
  });

  it("exposes DB and env.secrets.* bindings, not SECRETS bag or top-level", async () => {
    await initializeSecretStore("pw");
    await setSecret("TOKEN", "abc");
    const env = createFunctionsEnv("env-p");
    expect(env.DB).toBeDefined();
    expect(env.SECRETS).toBeUndefined();
    expect(env.TOKEN).toBeUndefined();
    expect(env.vars).toEqual({});
    const secrets = env.secrets as Record<
      string,
      { get: () => Promise<string> }
    >;
    expect(await secrets.TOKEN!.get()).toBe("abc");
  });

  it("omits secret entries when locked but keeps secrets namespace", async () => {
    await initializeSecretStore("pw");
    await setSecret("TOKEN", "abc");
    lockSecretStore();
    const env = createFunctionsEnv("env-p");
    expect(env.TOKEN).toBeUndefined();
    expect(env.secrets).toEqual({});
  });

  it("injects env.vars from dotenvText / files", () => {
    const fromText = createFunctionsEnv("p", {
      dotenvText: "API_BASE=https://x.test\nFLAG=1",
    });
    expect(fromText.vars).toEqual({
      API_BASE: "https://x.test",
      FLAG: "1",
    });
    expect(Object.isFrozen(fromText.vars)).toBe(true);

    const fromFiles = createFunctionsEnv("p", {
      files: { ".env": "FROM_FILE=yes" },
    });
    expect(fromFiles.vars).toEqual({ FROM_FILE: "yes" });
  });

  it("gives seated participants SecretStore bindings (DEC-033 BYOK)", async () => {
    await initializeSecretStore("pw");
    await setSecret("LLM_KEY", "sk-test");
    registerSessionBridge("seat-w", "worker-1", {
      apiVersion: async () => "1",
      capabilities: async () => [],
      getSeat: async () => ({
        sessionId: "s",
        seatId: "seat-w",
        role: "worker",
        participantId: "worker-1",
        hostSandboxId: "host",
        status: "open",
      }),
      getState: async () => ({}),
      getEventChannel: async () => ({ name: "ch" }),
      act: async () => ({}),
      leave: async () => ({ ok: true as const }),
    });
    const env = createFunctionsEnv("worker-1");
    expect(env.SESSION).toBeDefined();
    expect(env.HOST).toBeUndefined();
    const secrets = env.secrets as Record<
      string,
      { get: () => Promise<string> }
    >;
    expect(await secrets.LLM_KEY!.get()).toBe("sk-test");
  });

  it("Tool／delegate SAM gets DELEGATE＋legacy TOOL, vars, empty secrets", async () => {
    await initializeSecretStore("pw");
    await setSecret("TOKEN", "abc");
    registerToolBridge(stubToolBridge());
    const env = createFunctionsEnv("tool-1", {
      activeToolSandboxId: "tool-1",
      dotenvText: "TOOL_FLAG=1",
    });
    expect(env.DELEGATE).toBeDefined();
    expect(env.TOOL).toBe(env.DELEGATE);
    expect(env.vars).toEqual({ TOOL_FLAG: "1" });
    expect(env.secrets).toEqual({});
    expect(env.TOKEN).toBeUndefined();
  });
});
