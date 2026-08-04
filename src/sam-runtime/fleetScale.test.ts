/**
 * Scale check: 100 Controllers attached, scheduled, and ticking via Durable alarms.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryKv } from "./bindings.ts";
import { SamInstance } from "./instance.ts";
import { loadEsmFromFileMap } from "./moduleLoader.ts";
import { AgentRuntime } from "./runtime.ts";
import { createMemoryStorage } from "./storage.ts";

const N = 100;
const TICK_MS = 20;

function stressFiles(tickMs: number) {
  return {
    "index.html": `<head><meta name="sam:needs-controller" content="true" /><title>s</title></head>`,
    "controller.js": `
const TICK_MS = ${tickMs};
export default {
  async onStart(env, ctx) {
    await env.KV.put("controller", "up");
    await env.KV.put("running", "1");
    await env.KV.put("ticks", "0");
    ctx.schedule({ delayMs: TICK_MS });
  },
  async alarm(env, ctx) {
    if ((await env.KV.get("running")) === "1") {
      const n = Number((await env.KV.get("ticks")) || "0") + 1;
      await env.KV.put("ticks", String(n));
    }
    ctx.schedule({ delayMs: TICK_MS });
  },
};
`,
  };
}

describe("fleet scale — 100 background Controllers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`attaches ${N} Controllers and advances ticks under schedule`, async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    const runtime = new AgentRuntime({ storage, autoDrain: true });
    const kvs = new Map<string, ReturnType<typeof createMemoryKv>>();
    const instances: SamInstance[] = [];
    const files = stressFiles(TICK_MS);

    for (let i = 0; i < N; i++) {
      const id = `scale-${String(i).padStart(3, "0")}`;
      const kv = createMemoryKv();
      kvs.set(id, kv);
      const inst = new SamInstance({
        id,
        files,
        loadEsm: loadEsmFromFileMap,
        createEnv: () => ({ KV: kv }),
      });
      await inst.start();
      await runtime.attach(inst);
      instances.push(inst);
    }

    expect(instances.length).toBe(N);
    expect(instances.every(inst => runtime.getLive(inst.id))).toBe(true);
    const registered = await runtime.registry.list();
    expect(registered.filter(a => a.status === "running").length).toBe(N);

    // Let several alarm waves fire.
    for (let wave = 0; wave < 5; wave++) {
      await vi.advanceTimersByTimeAsync(TICK_MS + 5);
      await Promise.resolve();
      await runtime.kickDrain();
    }

    let positive = 0;
    let minTicks = Number.POSITIVE_INFINITY;
    let maxTicks = 0;
    for (const [id, kv] of kvs) {
      const ticks = Number((await kv.get("ticks")) || "0");
      const controller = await kv.get("controller");
      expect(controller).toBe("up");
      if (ticks > 0) positive += 1;
      minTicks = Math.min(minTicks, ticks);
      maxTicks = Math.max(maxTicks, ticks);
      void id;
    }

    expect(positive).toBe(N);
    expect(minTicks).toBeGreaterThanOrEqual(1);
    expect(maxTicks).toBeGreaterThanOrEqual(minTicks);

    for (const inst of instances) {
      await runtime.detach(inst.id);
      await inst.stop();
    }
  }, 30_000);
});
