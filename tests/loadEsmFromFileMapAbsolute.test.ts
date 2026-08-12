// Phase 5 (c) acceptance test: a SAM `functions.js` imports the host helper
// from `/playgrounds/functions-runtime.js` and the Node ESM loader must
// resolve it (inlining the helper source into the temp dir so the rewrite
// doesn't leave an absolute path that Vite's import-analysis rejects).
// The browser path (samBrowserLoader.rewriteJsImports →
// `new URL(spec, import.meta.url).href`) is covered separately in
// tests/samBrowserLoaderAbsolute.test.ts.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { loadEsmFromFileMap } from "../src/sam-runtime/moduleLoader";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../src/sam-host/fixtures");

describe("loadEsmFromFileMap — absolute /playgrounds/* imports", () => {
  it("loads hello-sdk-functions and runs the intrinsic + custom chain", async () => {
    const files = await loadSamDirLike(join(fixtures, "hello-sdk-functions"));
    const loaded = await loadEsmFromFileMap<{
      default: {
        fetch: (req: Request, env: unknown) => Promise<Response>;
      };
    }>(files, "functions.js");
    expect(loaded).not.toBeNull();
    const handler = loaded!.exports.default;

    const env = makeEnv();
    const ping = await handler.fetch(
      new Request("https://sam.local/api/ping", { method: "GET" }),
      env,
    );
    expect(ping.status).toBe(200);
    const pingBody = await ping.json();
    expect(pingBody.id).toBe("hello-sdk-functions");
    expect(typeof pingBody.ts).toBe("number");

    // Intrinsic route: /api/vars (varsAll) — should hit the helper.
    const vars = await handler.fetch(
      new Request("https://sam.local/api/vars", { method: "GET" }),
      env,
    );
    expect(vars.status).toBe(200);
    expect(await vars.json()).toEqual({ GREETING: "hi" });

    // Intrinsic route: /api/kv/hits — should hit the helper.
    await env.KV.put("hits", "7");
    const kv = await handler.fetch(
      new Request("https://sam.local/api/kv/hits", { method: "GET" }),
      env,
    );
    expect(kv.status).toBe(200);
    expect(await kv.text()).toBe("7");

    // 404 outside both — neither route matches.
    const miss = await handler.fetch(
      new Request("https://sam.local/api/who-knows", { method: "GET" }),
      env,
    );
    expect(miss.status).toBe(404);

    await loaded!.dispose();
  });
});

async function loadSamDirLike(dir: string) {
  const fs = await import("node:fs/promises");
  const out: Record<string, string> = {};
  async function walk(d: string) {
    const ents = await fs.readdir(d, { withFileTypes: true });
    for (const e of ents) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const a = join(d, e.name);
      if (e.isDirectory()) {
        await walk(a);
        continue;
      }
      if (!e.isFile()) continue;
      const rel = a.slice(dir.length + 1).replace(/\\/gu, "/");
      if (!/\.(?:html?|m?js|cjs|json|txt)$/iu.test(rel)) continue;
      out[rel] = await fs.readFile(a, "utf8");
    }
  }
  await walk(dir);
  return out;
}

function makeEnv() {
  const memKv = createMemoryKv();
  return {
    KV: memKv,
    vars: { GREETING: "hi" },
  };
}

function createMemoryKv() {
  const map = new Map<string, string>();
  return {
    async get(key: string) {
      return map.get(key) ?? null;
    },
    async put(key: string, value: string | ArrayBuffer) {
      map.set(
        key,
        typeof value === "string"
          ? value
          : new TextDecoder().decode(value as ArrayBuffer),
      );
    },
    async delete(key: string) {
      map.delete(key);
    },
  };
}
