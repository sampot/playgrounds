import { describe, expect, it } from "vitest";
import { createMemoryKv } from "./bindings.ts";
import { AgentRuntimeError } from "./errors.ts";
import { SamInstance } from "./instance.ts";
import { loadEsmFromFileMap } from "./moduleLoader.ts";
import { AgentRuntime } from "./runtime.ts";
import { createMemoryStorage } from "./storage.ts";

function pingSam(id: string) {
  return {
    id,
    files: {
      "index.html": `<!doctype html><html><head><title>${id}</title>
        <meta name="sam:needs-controller" content="true" /></head><body></body></html>`,
      "controller.js": `
export default {
  async onStart(env) {
    await env.KV.put("inbox", "[]");
    await env.KV.put("paused", "0");
    await env.KV.put("resumed", "0");
  },
  async onPause(env) {
    await env.KV.put("paused", "1");
  },
  async onResume(env) {
    const n = Number((await env.KV.get("resumed")) || "0") + 1;
    await env.KV.put("resumed", String(n));
  },
  async onMessage(msg, env, ctx) {
    const raw = (await env.KV.get("inbox")) || "[]";
    const list = JSON.parse(raw);
    list.push({ id: msg.id, type: msg.type, from: msg.from, payload: msg.payload });
    await env.KV.put("inbox", JSON.stringify(list));
    if (msg.type === "app.ping" && msg.payload?.replyTo) {
      await ctx.send({
        to: msg.payload.replyTo,
        type: "app.pong",
        payload: { echo: msg.payload.n ?? null },
      });
    }
    if (msg.type === "app.fail") {
      throw new Error("intentional");
    }
  },
  async alarm(env) {
    const n = Number((await env.KV.get("alarms")) || "0") + 1;
    await env.KV.put("alarms", String(n));
  },
  async onCommand(command, env) {
    if (command?.type === "inbox") {
      return JSON.parse((await env.KV.get("inbox")) || "[]");
    }
    if (command?.type === "meta") {
      return {
        paused: await env.KV.get("paused"),
        resumed: await env.KV.get("resumed"),
        alarms: await env.KV.get("alarms"),
      };
    }
    return { ok: false };
  }
};
`,
    },
  };
}

async function makePair() {
  const runtime = new AgentRuntime({ storage: createMemoryStorage() });
  const a = new SamInstance({
    ...pingSam("a"),
    loadEsm: loadEsmFromFileMap,
    createEnv: () => ({ KV: createMemoryKv() }),
  });
  const b = new SamInstance({
    ...pingSam("b"),
    loadEsm: loadEsmFromFileMap,
    createEnv: () => ({ KV: createMemoryKv() }),
  });
  await a.start();
  await b.start();
  await runtime.attach(a);
  await runtime.attach(b);
  return { runtime, a, b };
}

describe("AgentRuntime", () => {
  it("registry lookup / agent_not_found", async () => {
    const runtime = new AgentRuntime();
    await expect(
      runtime.send({ to: "missing", type: "t" })
    ).rejects.toMatchObject({ code: "agent_not_found" });
    expect(await runtime.registry.list()).toEqual([]);
  });

  it("two instances exchange messages via send", async () => {
    const { runtime, a, b } = await makePair();
    await runtime.send({
      to: "b",
      from: "a",
      type: "app.ping",
      payload: { n: 7, replyTo: "a" },
    });
    await runtime.kickDrain();

    const inboxA = (await a.command({ type: "inbox" })) as unknown[];
    const inboxB = (await b.command({ type: "inbox" })) as unknown[];
    expect(inboxB).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "app.ping", from: "a" }),
      ])
    );
    expect(inboxA).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "app.pong",
          payload: { echo: 7 },
        }),
      ])
    );

    await a.stop();
    await b.stop();
  });

  it("pause / resume: enqueue while hibernated, resume on drain", async () => {
    const { runtime, a } = await makePair();
    await runtime.pauseAgent("a");
    expect(a.isPaused()).toBe(true);
    const meta1 = (await a.command({ type: "meta" }).catch(() => null)) as null;
    expect(meta1).toBeNull(); // paused blocks command

    await runtime.send({ to: "a", type: "app.hello", payload: { x: 1 } });
    await runtime.kickDrain();
    expect(a.isPaused()).toBe(false);
    const inbox = (await a.command({ type: "inbox" })) as unknown[];
    expect(inbox).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "app.hello" })])
    );
    const meta = (await a.command({ type: "meta" })) as {
      paused: string;
      resumed: string;
    };
    expect(meta.paused).toBe("1");
    expect(Number(meta.resumed)).toBeGreaterThanOrEqual(1);
  });

  it("durable alarm enqueues system.alarm into serial drain", async () => {
    const { runtime, a } = await makePair();
    runtime.schedule("a", { delayMs: 30 });
    await new Promise(r => setTimeout(r, 50));
    await runtime.kickDrain();
    const meta = (await a.command({ type: "meta" })) as { alarms: string };
    expect(Number(meta.alarms)).toBeGreaterThanOrEqual(1);
  });

  it("spawn registers child and delivers initialMessage", async () => {
    const runtime = new AgentRuntime();
    const parent = new SamInstance({
      ...pingSam("parent"),
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({ KV: createMemoryKv() }),
    });
    await parent.start();
    await runtime.attach(parent);

    const child = await runtime.spawn({
      sandboxId: "child",
      initialMessage: { type: "app.hello", payload: { hi: true } },
      createInstance: id =>
        new SamInstance({
          ...pingSam(id),
          loadEsm: loadEsmFromFileMap,
          createEnv: () => ({ KV: createMemoryKv() }),
        }),
    });
    expect(child.sandboxId).toBe("child");
    expect(child.agentId).toBe("child");
    const listed = await runtime.registry.list();
    expect(listed.map(e => e.agentId).sort()).toEqual(["child", "parent"]);

    await runtime.kickDrain();
    const childInst = runtime.getLive("child")!;
    const inbox = (await childInst.command({ type: "inbox" })) as unknown[];
    expect(inbox).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "app.hello" })])
    );
  });

  it("does not drain when not leader", async () => {
    const { runtime, a } = await makePair();
    runtime.setLeader(false);
    await runtime.send({ to: "a", type: "app.hello" });
    await runtime.kickDrain();
    expect(await runtime.mailbox.pendingCount("a")).toBe(1);
    runtime.setLeader(true);
    await runtime.kickDrain();
    const inbox = (await a.command({ type: "inbox" })) as unknown[];
    expect(inbox.length).toBe(1);
  });

  it("sendSelf works from onMessage", async () => {
    const runtime = new AgentRuntime();
    const inst = new SamInstance({
      id: "s",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({ KV: createMemoryKv() }),
      files: {
        "index.html": `<head><title>s</title></head>`,
        "controller.js": `
export default {
  async onStart(env) { await env.KV.put("n", "0"); },
  async onMessage(msg, env, ctx) {
    if (msg.type === "tick") {
      const n = Number(await env.KV.get("n")) + 1;
      await env.KV.put("n", String(n));
      if (n < 3) await ctx.sendSelf({ type: "tick" });
    }
  },
  async onCommand(_, env) {
    return { n: Number(await env.KV.get("n")) };
  }
};
`,
      },
    });
    await inst.start();
    await runtime.attach(inst);
    await runtime.send({ to: "s", type: "tick" });
    await runtime.kickDrain();
    const { n } = (await inst.command({})) as { n: number };
    expect(n).toBe(3);
  });
});

describe("AgentRuntimeError", () => {
  it("exposes code", () => {
    const e = new AgentRuntimeError("mailbox_full");
    expect(e.code).toBe("mailbox_full");
  });
});
