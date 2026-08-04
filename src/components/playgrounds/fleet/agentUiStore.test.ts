import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../../../sam-runtime/storage.ts";
import { AgentUiStore, normalizeAgentUi } from "./agentUiStore.ts";

describe("normalizeAgentUi", () => {
  it("trims and drops empty", () => {
    expect(normalizeAgentUi({ roleLabel: "  " })).toBeNull();
    expect(normalizeAgentUi({ roleLabel: " Supervisor " })?.roleLabel).toBe(
      "Supervisor"
    );
  });

  it("accepts health enums only", () => {
    expect(normalizeAgentUi({ health: "error" })?.health).toBe("error");
    expect(normalizeAgentUi({ health: "nope" as never })).toBeNull();
  });
});

describe("AgentUiStore", () => {
  it("merges patches and clears with null", async () => {
    const store = new AgentUiStore(createMemoryStorage());
    await store.set("a1", { roleLabel: "worker", health: "ok" });
    expect(await store.get("a1")).toEqual({
      roleLabel: "worker",
      health: "ok",
    });
    await store.set("a1", { health: "warn", healthDetail: "slow" });
    expect(await store.get("a1")).toEqual({
      roleLabel: "worker",
      health: "warn",
      healthDetail: "slow",
    });
    await store.set("a1", { roleLabel: null, healthDetail: null });
    expect(await store.get("a1")).toEqual({ health: "warn" });
    await store.clear("a1");
    expect(await store.get("a1")).toBeNull();
  });
});
