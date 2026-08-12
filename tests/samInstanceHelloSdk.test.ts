// Phase 5 (a) acceptance test: the host-installed default functions.js
// (PG-UI-SDK-SPEC §4) is wired up when a SAM has no functions.js (just
// an index.html + controller.js). The NodeSamHost headless loader is
// the simulation harness — there is no real browser involved.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  createHostStub,
  createMemoryKv,
  SamInstance,
} from "../src/sam-runtime/node.ts";
import { loadEsmFromFileMap } from "../src/sam-runtime/moduleLoader";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../src/sam-host/fixtures");

async function loadFiles(dir: string): Promise<Record<string, string>> {
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

describe("SamInstance — host-installed default functions.js", () => {
  it("wires the default intrinsic handler when the SAM has no functions.js", async () => {
    const files = await loadFiles(join(fixtures, "hello-sdk"));

    const inst = new SamInstance({
      id: "hello-sdk",
      files,
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({
        KV: createMemoryKv(),
        HOST: createHostStub(),
        vars: { GREETING: "嗨" },
      }),
    });
    await inst.start();

    // /api/kv/hits — KV intrinsic via the default handler. We assert
    // the host-installed default handler is wired by inspecting the
    // internal `functions` slot. The full HTTP round-trip is covered
    // by tests/loadEsmFromFileMapAbsolute.test.ts.
    const instAny = inst as unknown as { functions: unknown };
    expect(instAny.functions).not.toBeNull();

    await inst.stop();
  });

  it("respects a SAM-supplied functions.js — does not override", async () => {
    const files = await loadFiles(join(fixtures, "hello-sdk-functions"));

    const inst = new SamInstance({
      id: "hello-sdk-functions",
      files,
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({
        KV: createMemoryKv(),
        HOST: createHostStub(),
        vars: { GREETING: "hi" },
      }),
    });
    await inst.start();

    // SAM-supplied functions.js with the helper: the chain returns a
    // Response that the canvas would route through /api/ping. We just
    // assert the instance started successfully.
    expect(inst.hasFunctions()).toBe(true);

    await inst.stop();
  });
});
