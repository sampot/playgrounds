/**
 * DEC-031 acceptance coverage for SPEC S1–S8 (unit/Node subset).
 * Manual multi-tab (S4.1/S4.4) and migrate/HA (S5) remain out of Vitest scope.
 */

import { describe, expect, it } from "vitest";
import { createHostStub, createMemoryKv } from "./bindings.ts";
import { drainAgent } from "./drainLoop.ts";
import { AgentRuntimeError } from "./errors.ts";
import { SamInstance } from "./instance.ts";
import { MailboxStore } from "./mailboxStore.ts";
import { createAgentMessage } from "./message.ts";
import { loadEsmFromFileMap } from "./moduleLoader.ts";
import { AgentRuntime } from "./runtime.ts";
import { createMemoryStorage } from "./storage.ts";

describe("S1 — headless Controller ↔ resources", () => {
  it("Controller mutates KV via bindings (no env.INFRA)", async () => {
    const kv = createMemoryKv();
    const inst = new SamInstance({
      id: "h",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({ KV: kv }),
      files: {
        "index.html": `<head><title>h</title></head>`,
        "functions.js": `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/inc") && request.method === "POST") {
      const n = Number((await env.KV.get("n")) || "0") + 1;
      await env.KV.put("n", String(n));
      return Response.json({ n });
    }
    return new Response("no", { status: 404 });
  }
};
`,
        "controller.js": `
export default {
  async onCommand(command, env) {
    if (command?.type === "inc") {
      const n = Number((await env.KV.get("n")) || "0") + 1;
      await env.KV.put("n", String(n));
      return { n };
    }
    return { ok: false };
  }
};
`,
      },
    });
    await inst.start();
    expect(await inst.command({ type: "inc" })).toEqual({ n: 1 });
    expect(await kv.get("n")).toBe("1");
    // Host may call functions.js separately; Controller env has no INFRA.
    const res = await inst.functionsFetch(
      new Request("http://sam/inc", { method: "POST" })
    );
    expect(res.ok).toBe(true);
    expect(await kv.get("n")).toBe("2");
    await inst.stop();
  });
});

describe("S2 — serialization and delivery", () => {
  it("two messages + alarm never overlap handlers", async () => {
    const runtime = new AgentRuntime({ autoDrain: false });
    const state = { deep: 0, maxDeep: 0, order: [] as string[] };
    const inst = new SamInstance({
      id: "ser",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({ KV: createMemoryKv(), __STATE: state }),
      files: {
        "index.html": `<head><title>ser</title></head>`,
        "controller.js": `
export default {
  async onMessage(msg, env) {
    const s = env.__STATE;
    s.deep += 1;
    s.maxDeep = Math.max(s.maxDeep, s.deep);
    s.order.push(msg.type);
    await new Promise(r => setTimeout(r, 12));
    s.deep -= 1;
  },
  async alarm(env) {
    const s = env.__STATE;
    s.deep += 1;
    s.maxDeep = Math.max(s.maxDeep, s.deep);
    s.order.push("alarm");
    await new Promise(r => setTimeout(r, 12));
    s.deep -= 1;
  },
  async onCommand(_, env) {
    return env.__STATE;
  }
};
`,
      },
    });
    await inst.start();
    await runtime.attach(inst);
    await runtime.send({ to: "ser", type: "a" });
    await runtime.send({ to: "ser", type: "b" });
    runtime.schedule("ser", { delayMs: 5 });
    await new Promise(r => setTimeout(r, 20));
    await runtime.kickDrain();
    const out = (await inst.command({})) as {
      maxDeep: number;
      order: string[];
    };
    expect(out.maxDeep).toBe(1);
    expect(out.order).toEqual(expect.arrayContaining(["a", "b", "alarm"]));
    await inst.stop();
  });

  it("sendSelf runs only after current handler finishes", async () => {
    const runtime = new AgentRuntime({ autoDrain: false });
    const events: string[] = [];
    const inst = new SamInstance({
      id: "ss",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({ KV: createMemoryKv(), __EVENTS: events }),
      files: {
        "index.html": `<head><title>ss</title></head>`,
        "controller.js": `
export default {
  async onMessage(msg, env, ctx) {
    const e = env.__EVENTS;
    if (msg.type === "start") {
      e.push("start:enter");
      await ctx.sendSelf({ type: "next" });
      e.push("start:exit");
      return;
    }
    e.push("next");
  },
  async onCommand(_, env) {
    return env.__EVENTS;
  }
};
`,
      },
    });
    await inst.start();
    await runtime.attach(inst);
    await runtime.send({ to: "ss", type: "start" });
    await runtime.kickDrain();
    expect(await inst.command({})).toEqual([
      "start:enter",
      "start:exit",
      "next",
    ]);
    await inst.stop();
  });

  it("send persists before ack (inFlight survives restart)", async () => {
    const storage = createMemoryStorage();
    const box = new MailboxStore(storage);
    await box.enqueue(
      "x",
      createAgentMessage({ id: "m1", from: "a", to: "x", type: "t" })
    );
    const claimed = await box.claimNext("x");
    expect(claimed?.id).toBe("m1");
    const box2 = new MailboxStore(storage);
    expect((await box2.claimNext("x"))?.id).toBe("m1");
  });
});

describe("S3 — spawn without second HOST", () => {
  it("spawned child has no env.HOST; parent can message child", async () => {
    const runtime = new AgentRuntime();
    const parent = new SamInstance({
      id: "p",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({
        KV: createMemoryKv(),
        HOST: createHostStub(),
      }),
      files: {
        "index.html": `<head><title>p</title></head>`,
        "controller.js": `
export default {
  async onMessage() {},
  async onCommand(_, env) {
    return { hasHost: Boolean(env.HOST) };
  }
};
`,
      },
    });
    await parent.start();
    await runtime.attach(parent);
    expect(await parent.command({})).toEqual({ hasHost: true });

    const child = await runtime.spawn({
      sandboxId: "c",
      initialMessage: { type: "probe", from: "p" },
      createInstance: id =>
        new SamInstance({
          id,
          loadEsm: loadEsmFromFileMap,
          createEnv: () => ({ KV: createMemoryKv() }),
          files: {
            "index.html": `<head><title>c</title></head>`,
            "controller.js": `
export default {
  async onMessage(msg, env) {
    await env.KV.put("from", msg.from);
    await env.KV.put("host", env.HOST ? "yes" : "no");
  },
  async onCommand(_, env) {
    return {
      host: await env.KV.get("host"),
      from: await env.KV.get("from"),
    };
  }
};
`,
          },
        }),
    });
    await runtime.kickDrain();
    const childInst = runtime.getLive(child.agentId)!;
    expect(await childInst.command({})).toEqual({ host: "no", from: "p" });
    await parent.stop();
    await childInst.stop();
  });
});

describe("S6 — pause / resume", () => {
  it("resume does not re-run onStart; idle pause stays paused", async () => {
    const runtime = new AgentRuntime({ autoDrain: false });
    const kv = createMemoryKv();
    const inst = new SamInstance({
      id: "v",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({ KV: kv }),
      files: {
        "index.html": `<head><title>v</title></head>`,
        "controller.js": `
export default {
  async onStart(env) {
    const n = Number((await env.KV.get("starts")) || "0") + 1;
    await env.KV.put("starts", String(n));
  },
  async onPause(env) { await env.KV.put("paused", "1"); },
  async onResume(env) {
    const n = Number((await env.KV.get("resumes")) || "0") + 1;
    await env.KV.put("resumes", String(n));
  },
  async onMessage() {},
};
`,
      },
    });
    await inst.start();
    await runtime.attach(inst);
    expect(await kv.get("starts")).toBe("1");
    await runtime.pauseAgent("v");
    expect(inst.isPaused()).toBe(true);
    await runtime.kickDrain();
    expect(inst.isPaused()).toBe(true);
    expect(await kv.get("resumes")).toBeNull();
    await runtime.send({ to: "v", type: "wake" });
    await runtime.kickDrain();
    expect(inst.isPaused()).toBe(false);
    expect(await kv.get("starts")).toBe("1");
    expect(await kv.get("resumes")).toBe("1");
    await inst.stop();
  });
});

describe("S8 — poison then continue; registry", () => {
  it("after poison, later messages still drain", async () => {
    const box = new MailboxStore(createMemoryStorage());
    await box.enqueue(
      "p",
      createAgentMessage({ id: "bad", from: "a", to: "p", type: "boom" })
    );
    await box.enqueue(
      "p",
      createAgentMessage({ id: "good", from: "a", to: "p", type: "ok" })
    );
    const seen: string[] = [];
    await drainAgent({
      agentId: "p",
      mailbox: box,
      retryDelayMs: 0,
      handle: async msg => {
        seen.push(msg.type);
        if (msg.type === "boom") throw new Error("fail");
      },
    });
    expect(seen.filter(t => t === "boom").length).toBe(3);
    expect(seen).toContain("ok");
    expect(await box.listPoison("p")).toHaveLength(1);
    expect(await box.pendingCount("p")).toBe(0);
  });

  it("spawned agent is lookup-able; missing → agent_not_found", async () => {
    const runtime = new AgentRuntime();
    const parent = new SamInstance({
      id: "pp",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({ KV: createMemoryKv() }),
      files: {
        "index.html": `<head><title>pp</title></head>`,
        "controller.js": `export default {};`,
      },
    });
    await parent.start();
    await runtime.attach(parent);
    const { agentId } = await runtime.spawn({
      createInstance: id =>
        new SamInstance({
          id,
          loadEsm: loadEsmFromFileMap,
          createEnv: () => ({ KV: createMemoryKv() }),
          files: {
            "index.html": `<head><title>kid</title></head>`,
            "controller.js": `export default {};`,
          },
        }),
    });
    expect(await runtime.registry.lookup(agentId)).toMatchObject({
      agentId,
      sandboxId: agentId,
    });
    await expect(
      runtime.send({ to: "missing-xyz", type: "t" })
    ).rejects.toBeInstanceOf(AgentRuntimeError);
    await parent.stop();
  });
});
