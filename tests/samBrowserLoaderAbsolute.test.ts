// @vitest-environment jsdom
/**
 * Cross-module import rewrite in `samBrowserLoader` (PG-UI-SDK-PLAN §5.1c).
 *
 * A SAM's `functions.js` may want to import the host-installed helper at
 * `/playgrounds/functions-runtime.js`. Browser ESM modules loaded via blob
 * URLs cannot directly resolve absolute paths, so `composePreview` rewrites
 * `/playgrounds/*` imports to a top-level await form using
 * `new URL(spec, import.meta.url)`. The module must therefore be async
 * (ESM top-level await), which is supported by the module worker (§DEC-038).
 *
 * We test the rewrite directly because Node cannot load blob URLs at all,
 * so the existing `loadBrowserEsmDefault` is browser-only. The runtime
 * integration is verified by the unit rewrite guarantees here plus the
 * helper parity fixture (tests/functionsRuntime.test.ts).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { rewriteJsImports } from "../src/components/playgrounds/composePreview";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("composePreview.rewriteJsImports — absolute /playgrounds/* path", () => {
  it("rewrites a named import from /playgrounds/functions-runtime.js to top-level await", () => {
    const src = [
      `import { intrinsicRoutes } from "/playgrounds/functions-runtime.js";`,
      `export default {`,
      `  fetch(request, env) { return intrinsicRoutes(env).handle(request); }`,
      `};`,
    ].join("\n");

    const out = rewriteJsImports(src, "functions.js", new Map());

    // The string-literal `/playgrounds/functions-runtime.js` must be replaced
    // with a runtime-resolved URL expression. We assert the result references
    // `import.meta.url` and the original path, and that the form is now
    // dynamic (await import) so the module becomes async.
    expect(out).toMatch(/import\(/u);
    expect(out).toMatch(/import\.meta\.url/u);
    expect(out).toMatch(/\/playgrounds\/functions-runtime\.js/u);
    expect(out).not.toMatch(
      /from\s+["']\/playgrounds\/functions-runtime\.js["']/u,
    );
  });

  it("rewrites a default import the same way", () => {
    const src = [
      `import helper from "/playgrounds/functions-runtime.js";`,
      `export default { fetch() { return helper(env).handle(request); } };`,
    ].join("\n");

    const out = rewriteJsImports(src, "functions.js", new Map());

    expect(out).toMatch(/import\(/u);
    expect(out).toMatch(/import\.meta\.url/u);
    expect(out).toMatch(/\/playgrounds\/functions-runtime\.js/u);
  });

  it("rewrites a dynamic import() of an absolute path", () => {
    const src = [
      `const promise = import("/playgrounds/functions-runtime.js");`,
      `export default { fetch() { return promise; } };`,
    ].join("\n");

    const out = rewriteJsImports(src, "functions.js", new Map());

    expect(out).toMatch(/import\(/u);
    expect(out).toMatch(/import\.meta\.url/u);
    expect(out).toMatch(/\/playgrounds\/functions-runtime\.js/u);
  });

  it("rewrites all four common import forms (named, default, namespace, side-effect)", () => {
    const cases: Array<{ src: string; expectMod: boolean }> = [
      {
        src: `import { X } from "/playgrounds/foo.js";`,
        expectMod: true,
      },
      {
        src: `import X from "/playgrounds/foo.js";`,
        expectMod: true,
      },
      { src: `import * as X from "/playgrounds/foo.js";`, expectMod: true },
      { src: `import "/playgrounds/foo.js";`, expectMod: true },
    ];
    for (const c of cases) {
      const out = rewriteJsImports(c.src, "f.js", new Map());
      // Side-effect imports keep the form `import "..."` but the literal is
      // rewritten to a URL expression that the runtime can resolve.
      expect(out).toMatch(/import\.meta\.url/u);
      expect(out).toMatch(/\/playgrounds\/foo\.js/u);
    }
  });

  it("does not rewrite imports outside /playgrounds/* (no false positives)", () => {
    const src = [
      `import { X } from "./lib/util.js";`,
      `import { Y } from "/not/playgrounds/foo.js";`,
      `export default {};`,
    ].join("\n");

    const pathToUrl = new Map<string, string>([["lib/util.js", "blob:util"]]);
    const out = rewriteJsImports(src, "functions.js", pathToUrl);

    // Relative path was rewritten to the blob URL.
    expect(out).toContain("blob:util");
    // Out-of-scope absolute path is left untouched (the worker will fail at
    // resolution time, which is the right failure mode).
    expect(out).toContain('"/not/playgrounds/foo.js"');
  });
});
