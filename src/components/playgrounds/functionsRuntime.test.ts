import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createFunctionsExecutionContext,
  functionsSourceFingerprint,
  invokeFunctionsFetch,
  type LoadedFunctionsModule,
} from "./functionsRuntime";

const here = dirname(fileURLToPath(import.meta.url));

describe("functionsRuntime (DEC-038 no iframe)", () => {
  it("does not create playgrounds-functions-host iframe", () => {
    const src = readFileSync(join(here, "functionsRuntime.ts"), "utf8");
    expect(src).not.toMatch(/playgrounds-functions-host/);
    expect(src).not.toMatch(/createElement\(\s*["']iframe["']/);
    expect(src).toMatch(/loadBrowserEsmDefault/);
  });

  it("fingerprints js sources", () => {
    const a = functionsSourceFingerprint({
      "functions.js": "export default { fetch() {} }",
      "index.html": "<html></html>",
    });
    const b = functionsSourceFingerprint({
      "functions.js":
        "export default { fetch() { return new Response('x'); } }",
      "index.html": "<html></html>",
    });
    expect(a).not.toBe(b);
  });

  it("invokes a mock Workers-shaped handler", async () => {
    const mod: LoadedFunctionsModule = {
      fetch: async (request, _env, ctx) => {
        ctx.waitUntil(Promise.resolve());
        ctx.passThroughOnException();
        return new Response(`hello:${new URL(request.url).pathname}`, {
          status: 200,
        });
      },
      dispose() {},
    };
    const res = await invokeFunctionsFetch(
      mod,
      new Request("https://example.com/api/hi")
    );
    expect(await res.text()).toBe("hello:/api/hi");
  });

  it("createFunctionsExecutionContext is usable", () => {
    const ctx = createFunctionsExecutionContext();
    expect(() => ctx.passThroughOnException()).not.toThrow();
  });
});
