import { describe, expect, it } from "vitest";
import {
  appendReplLine,
  formatReplBanner,
  isBlankPrimaryLine,
  isPythonScriptPath,
  parsePipMagic,
  parseRunMagic,
  resolveProjectScript,
  REPL_CONTINUATION_PROMPT,
  REPL_PRIMARY_PROMPT,
} from "./hostPythonRepl";

describe("hostPythonRepl helpers", () => {
  it("detects blank primary Enter", () => {
    expect(isBlankPrimaryLine("", "")).toBe(true);
    expect(isBlankPrimaryLine("", "   ")).toBe(true);
    expect(isBlankPrimaryLine("", "x")).toBe(false);
    expect(isBlankPrimaryLine("def f():\n", "")).toBe(false);
  });

  it("appends lines with newline", () => {
    expect(appendReplLine("", "x = 1")).toBe("x = 1\n");
    expect(appendReplLine("x = 1\n", "x")).toBe("x = 1\nx\n");
  });

  it("formats banner with pip and run hints", () => {
    const banner = formatReplBanner("0.27.0", ["numpy", "pandas"]);
    expect(banner).toContain("Pyodide 0.27.0");
    expect(banner).toContain("numpy, pandas");
    expect(banner).toContain("%pip");
    expect(banner).toContain("%run");
    expect(banner).toContain("非 Linux shell");
  });

  it("exports prompts", () => {
    expect(REPL_PRIMARY_PROMPT).toBe(">>> ");
    expect(REPL_CONTINUATION_PROMPT).toBe("... ");
  });

  it("parses %pip magic", () => {
    expect(parsePipMagic("print(1)")).toEqual({ kind: "none" });
    expect(parsePipMagic("%pip")).toEqual({ kind: "usage" });
    expect(parsePipMagic("%pip install")).toEqual({ kind: "usage" });
    expect(parsePipMagic("%pip numpy")).toEqual({
      kind: "packages",
      names: ["numpy"],
    });
    expect(parsePipMagic("%pip install numpy pandas")).toEqual({
      kind: "packages",
      names: ["numpy", "pandas"],
    });
    expect(parsePipMagic("%pip install foo==1")).toMatchObject({
      kind: "error",
    });
  });

  it("parses %run magic and resolves scripts", () => {
    expect(parseRunMagic("x=1")).toEqual({ kind: "none" });
    expect(parseRunMagic("%run")).toEqual({ kind: "usage" });
    expect(parseRunMagic("%run scripts/demo.py")).toEqual({
      kind: "path",
      path: "scripts/demo.py",
    });
    expect(parseRunMagic('%run "a/b.py"')).toEqual({
      kind: "path",
      path: "a/b.py",
    });
    expect(isPythonScriptPath("a.py")).toBe(true);
    expect(isPythonScriptPath("a.js")).toBe(false);

    const files = {
      "scripts/demo.py": "print(1)\n",
      "lib/util.py": "X = 1\n",
    };
    expect(resolveProjectScript(files, "./scripts/demo.py")).toEqual({
      ok: true,
      path: "scripts/demo.py",
      code: "print(1)\n",
    });
    expect(resolveProjectScript(files, "missing.py").ok).toBe(false);
    expect(resolveProjectScript(files, "readme.md").ok).toBe(false);
  });
});
