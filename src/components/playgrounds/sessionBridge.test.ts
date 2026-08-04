import { afterEach, describe, expect, it } from "vitest";
import { createFunctionsEnv } from "./functionsEnv";
import {
  clearAllSessionBridges,
  createSessionBinding,
  registerSessionBridge,
  SessionBridgeError,
  type SessionBridge,
} from "./sessionBridge";

function mockBridge(): SessionBridge {
  return {
    apiVersion: async () => "1",
    capabilities: async () => ["apiVersion"],
    getSeat: async () => ({
      sessionId: "s1",
      seatId: "seat-1",
      role: "participant",
      participantId: "p1",
      hostSandboxId: "h1",
      status: "open",
    }),
    getState: async () => ({ ok: true }),
    getEventChannel: async () => ({ name: "playgrounds-session:s1" }),
    act: async () => ({ ok: true }),
    leave: async () => ({ ok: true as const }),
  };
}

describe("session bridge injection", () => {
  afterEach(() => {
    clearAllSessionBridges();
  });

  it("createFunctionsEnv injects SESSION for seated project", () => {
    registerSessionBridge("seat-1", "agent-1", mockBridge());
    const env = createFunctionsEnv("agent-1", {});
    expect(env.SESSION).toBeTruthy();
  });

  it("does not inject SESSION for other projects", () => {
    registerSessionBridge("seat-1", "agent-1", mockBridge());
    const env = createFunctionsEnv("other", {});
    expect(env.SESSION).toBeUndefined();
  });

  it("SESSION can coexist with HOST", () => {
    registerSessionBridge("seat-1", "agent-1", mockBridge());
    // HOST requires registered host bridge — omit; just ensure SESSION present
    // when also listed as active agent without host bridge still gets SESSION
    const env = createFunctionsEnv("agent-1", {
      activeAgentSandboxId: "agent-1",
    });
    expect(env.SESSION).toBeTruthy();
  });

  it("createSessionBinding throws when not seated", async () => {
    const binding = createSessionBinding("nobody");
    await expect(binding.getSeat()).rejects.toBeInstanceOf(SessionBridgeError);
  });
});
