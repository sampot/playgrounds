import { describe, expect, it } from "vitest";
import { AgentRegistry } from "./registry.ts";
import { createMemoryStorage } from "./storage.ts";

describe("AgentRegistry", () => {
  it("keeps all parallel registers (no lost updates)", async () => {
    const storage = createMemoryStorage();
    const registry = new AgentRegistry(storage);
    const N = 100;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        registry.register({
          agentId: `a-${String(i).padStart(3, "0")}`,
          sandboxId: `s-${i}`,
          status: "running",
          name: `n-${i}`,
        })
      )
    );
    await registry.flush();
    const listed = await registry.list();
    expect(listed).toHaveLength(N);
    expect(listed.filter(a => a.status === "running")).toHaveLength(N);

    // Reload from storage — durable snapshot must also be complete.
    const again = new AgentRegistry(storage);
    expect(await again.list()).toHaveLength(N);
  });
});
