import { describe, expect, it } from "vitest";
import { createMemoryKv } from "./bindings.ts";
import { SamInstance } from "./instance.ts";
import { loadEsmFromFileMap } from "./moduleLoader.ts";

const CONTROLLER = `
export default {
  async onStart(env, ctx) {
    await env.KV.put("n", "0");
    ctx.schedule({ delayMs: 150 });
  },
  async alarm(env) {
    const n = Number((await env.KV.get("n")) || "0") + 10;
    await env.KV.put("n", String(n));
    await env.KV.put("alarmed", "1");
  },
  async onCommand(command, env) {
    // Controllers use bindings directly — never env.INFRA → functions.
    if (command?.type === "inc") {
      const n = Number((await env.KV.get("n")) || "0") + 1;
      await env.KV.put("n", String(n));
      return { n };
    }
    if (command?.type === "count") {
      const n = Number((await env.KV.get("n")) || "0");
      return { n, label: await env.KV.get("label") };
    }
    return { ok: false };
  }
};
`;

function counterSam(id: string, label: string) {
  return {
    id,
    files: {
      "index.html": `<!doctype html><html><head>
        <title>${label}</title>
        <meta name="sam:needs-controller" content="true" />
      </head><body></body></html>`,
      "functions.js": `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/count")) {
      const n = Number((await env.KV.get("n")) || "0");
      return Response.json({ n, label: ${JSON.stringify(label)} });
    }
    if (url.pathname.endsWith("/inc") && request.method === "POST") {
      const n = Number((await env.KV.get("n")) || "0") + 1;
      await env.KV.put("n", String(n));
      return Response.json({ n });
    }
    return new Response("not found", { status: 404 });
  }
};
`,
      "controller.js": CONTROLLER,
    },
  };
}

describe("SamInstance", () => {
  it("runs two instances with isolated KV and alarm (no INFRA)", async () => {
    const a = new SamInstance({
      ...counterSam("a", "A"),
      loadEsm: loadEsmFromFileMap,
      createEnv: async () => {
        const kv = createMemoryKv();
        await kv.put("label", "A");
        return { KV: kv };
      },
    });
    const b = new SamInstance({
      ...counterSam("b", "B"),
      loadEsm: loadEsmFromFileMap,
      createEnv: async () => {
        const kv = createMemoryKv();
        await kv.put("label", "B");
        return { KV: kv };
      },
    });

    await a.start();
    await b.start();

    await a.command({ type: "inc" });
    await a.command({ type: "inc" });
    const ca = (await a.command({ type: "count" })) as {
      n: number;
      label: string;
    };
    const cb = (await b.command({ type: "count" })) as {
      n: number;
      label: string;
    };
    expect(ca.n).toBe(2);
    expect(cb.n).toBe(0);
    expect(ca.label).toBe("A");
    expect(cb.label).toBe("B");

    const deadline = Date.now() + 1000;
    let afterAlarm = { n: 0 };
    while (Date.now() < deadline) {
      afterAlarm = (await a.command({ type: "count" })) as { n: number };
      if (afterAlarm.n >= 12) break;
      await new Promise(r => setTimeout(r, 40));
    }
    expect(afterAlarm.n).toBe(12);

    // Host may still invoke functions.js without exposing it on Controller env.
    const viaFunctions = await a.functionsFetch(
      new Request("http://sam/count")
    );
    expect(viaFunctions.ok).toBe(true);
    expect(await viaFunctions.json()).toMatchObject({ n: 12, label: "A" });

    await a.stop();
    await b.stop();
  });

  it("does not inject env.INFRA", async () => {
    let seenEnv: Record<string, unknown> | null = null;
    const inst = new SamInstance({
      id: "no-infra",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({ KV: createMemoryKv() }),
      files: {
        "index.html": `<head><title>n</title></head>`,
        "controller.js": `
export default {
  async onStart(env) {
    globalThis.__seenEnv = env;
  }
};
`,
      },
    });
    await inst.start();
    seenEnv =
      (globalThis as { __seenEnv?: Record<string, unknown> }).__seenEnv ?? null;
    expect(seenEnv).toBeTruthy();
    expect(seenEnv).not.toHaveProperty("INFRA");
    await inst.stop();
  });

  it("parses head meta on construct", () => {
    const inst = new SamInstance({
      id: "m",
      loadEsm: loadEsmFromFileMap,
      files: {
        "index.html": `<head><title>X</title><meta name="sam:needs-controller" content="true" /></head>`,
      },
    });
    expect(inst.getMeta().name).toBe("X");
    expect(inst.getMeta().needsController).toBe(true);
    expect(inst.hasController()).toBe(false);
  });
});
