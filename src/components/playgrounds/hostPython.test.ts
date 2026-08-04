import { describe, expect, it, beforeEach } from "vitest";
import { HostBridgeError } from "./hostBridge";
import {
  assertHostPythonCode,
  clampHostPythonTimeoutMs,
  HOST_PYTHON_DEFAULT_TIMEOUT_MS,
  HOST_PYTHON_MAX_CODE_CHARS,
  normalizeHostPythonPackages,
  runHostPython,
  setHostPythonRunnerForTests,
} from "./hostPython";

describe("hostPython helpers", () => {
  beforeEach(() => {
    setHostPythonRunnerForTests(null);
  });

  it("normalizes allowlisted packages", () => {
    expect(normalizeHostPythonPackages(["NumPy", "pandas", "numpy"])).toEqual([
      "numpy",
      "pandas",
    ]);
  });

  it("rejects unknown packages", () => {
    expect(() => normalizeHostPythonPackages(["requests"])).toThrow(
      HostBridgeError
    );
  });

  it("clamps timeout", () => {
    expect(clampHostPythonTimeoutMs(undefined)).toBe(
      HOST_PYTHON_DEFAULT_TIMEOUT_MS
    );
    expect(clampHostPythonTimeoutMs(100)).toBe(1_000);
    expect(clampHostPythonTimeoutMs(999_999)).toBe(120_000);
  });

  it("validates code", () => {
    expect(() => assertHostPythonCode("")).toThrow(HostBridgeError);
    expect(() =>
      assertHostPythonCode("x".repeat(HOST_PYTHON_MAX_CODE_CHARS + 1))
    ).toThrow(HostBridgeError);
    expect(assertHostPythonCode("print(1)")).toBe("print(1)");
  });

  it("runHostPython uses injectable runner (no real Pyodide)", async () => {
    setHostPythonRunnerForTests({
      async run(options) {
        return {
          ok: true,
          stdout: `out:${options.code}`,
          stderr: "",
          result: "42",
          packages: options.packages ?? [],
          pyodideVersion: "test",
        };
      },
      async repl(line) {
        return {
          incomplete: false,
          prompt: ">>> ",
          stdout: `repl:${line}`,
          stderr: "",
        };
      },
      async installPackages(packages) {
        return { stdout: `installed:${packages.join(",")}`, stderr: "" };
      },
      async runScript() {
        return {
          incomplete: false,
          prompt: ">>> ",
          stdout: "ran",
          stderr: "",
        };
      },
      async reset() {},
      async cancelRepl() {},
      async ensure() {
        return { pyodideVersion: "test" };
      },
    });
    const result = await runHostPython({
      code: "1+1",
      packages: ["numpy"],
    });
    expect(result.stdout).toBe("out:1+1");
    expect(result.result).toBe("42");
    expect(result.packages).toEqual(["numpy"]);
  });

  it("replHostPython handles %pip via allowlist", async () => {
    const { replHostPython } = await import("./hostPython");
    setHostPythonRunnerForTests({
      async run() {
        throw new Error("unused");
      },
      async repl() {
        throw new Error("should use installPackages");
      },
      async installPackages(packages) {
        return { stdout: `ok:${packages.join("+")}`, stderr: "" };
      },
      async runScript() {
        throw new Error("unused");
      },
      async reset() {},
      async cancelRepl() {},
      async ensure() {
        return { pyodideVersion: "test" };
      },
    });
    const ok = await replHostPython("%pip install numpy");
    expect(ok.error).toBeUndefined();
    expect(ok.stdout).toContain("numpy");
    const bad = await replHostPython("%pip install requests");
    expect(bad.error).toMatch(/不在允許清單/);
  });

  it("replHostPython handles %run against projectFiles", async () => {
    const { replHostPython } = await import("./hostPython");
    setHostPythonRunnerForTests({
      async run() {
        throw new Error("unused");
      },
      async repl() {
        throw new Error("unused");
      },
      async installPackages() {
        throw new Error("unused");
      },
      async runScript(opts) {
        return {
          incomplete: false,
          prompt: ">>> ",
          stdout: `ran:${opts.path}:${opts.code.trim()}`,
          stderr: "",
        };
      },
      async reset() {},
      async cancelRepl() {},
      async ensure() {
        return { pyodideVersion: "test" };
      },
    });
    const ok = await replHostPython("%run hello.py", {
      projectFiles: { "hello.py": "print('hi')\n" },
    });
    expect(ok.error).toBeUndefined();
    expect(ok.stdout).toContain("ran:hello.py");
    const missing = await replHostPython("%run nope.py", {
      projectFiles: { "hello.py": "print(1)\n" },
    });
    expect(missing.error).toMatch(/找不到/);
  });
});
