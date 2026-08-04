import { describe, expect, it } from "vitest";
import {
  formatJsReplBanner,
  isJsScriptPath,
  isJsSourceComplete,
  looksLikeEsModule,
  parseJsRunMagic,
  resolveJsImportPath,
  resolveProjectJsScript,
  rewriteRelativeJsImports,
  JS_REPL_CONTINUATION_PROMPT,
  JS_REPL_PRIMARY_PROMPT,
} from "./hostJsRepl";

describe("hostJsRepl helpers", () => {
  it("formats banner", () => {
    const banner = formatJsReplBanner();
    expect(banner).toContain("%run");
    expect(banner).toContain("load(");
    expect(banner).toContain("無 npm");
  });

  it("classifies js paths and parses %run", () => {
    expect(isJsScriptPath("a.js")).toBe(true);
    expect(isJsScriptPath("a.mjs")).toBe(true);
    expect(isJsScriptPath("a.py")).toBe(false);
    expect(parseJsRunMagic("1+1")).toEqual({ kind: "none" });
    expect(parseJsRunMagic("%run")).toEqual({ kind: "usage" });
    expect(parseJsRunMagic("%run lib/demo.js")).toEqual({
      kind: "path",
      path: "lib/demo.js",
    });
    expect(JS_REPL_PRIMARY_PROMPT).toBe("> ");
    expect(JS_REPL_CONTINUATION_PROMPT).toBe("... ");
  });

  it("resolves project scripts", () => {
    const files = { "scripts/demo.js": "console.log(1)\n" };
    expect(resolveProjectJsScript(files, "./scripts/demo.js")).toEqual({
      ok: true,
      path: "scripts/demo.js",
      code: "console.log(1)\n",
    });
    expect(resolveProjectJsScript(files, "missing.js").ok).toBe(false);
  });

  it("detects incomplete js source", () => {
    expect(isJsSourceComplete("1+1")).toBe(true);
    expect(isJsSourceComplete("const x = {")).toBe(false);
    expect(isJsSourceComplete("const x = {\n  a: 1\n}")).toBe(true);
  });

  it("detects ESM and rewrites relative imports", () => {
    expect(looksLikeEsModule("export default {}\n")).toBe(true);
    expect(looksLikeEsModule("const x = 1\n")).toBe(false);
    const urls: Record<string, string> = {
      "lib/util.js": "blob:util",
    };
    const rewritten = rewriteRelativeJsImports(
      `import { x } from "./util.js";\nexport default 1;\n`,
      "lib/main.js",
      p => urls[p] ?? `missing:${p}`
    );
    expect(rewritten).toContain("blob:util");
    expect(resolveJsImportPath("lib/main.js", "./util.js")).toBe("lib/util.js");
  });
});
