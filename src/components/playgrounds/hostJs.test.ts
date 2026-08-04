import { describe, expect, it, beforeEach } from "vitest";
import {
  assertHostJsCode,
  clampHostJsTimeoutMs,
  HOST_JS_DEFAULT_TIMEOUT_MS,
  replHostJs,
  setHostJsRunnerForTests,
} from "./hostJs";
import { HostBridgeError } from "./hostBridge";

describe("hostJs helpers", () => {
  beforeEach(() => {
    setHostJsRunnerForTests(null);
  });

  it("clamps timeout and validates code", () => {
    expect(clampHostJsTimeoutMs(undefined)).toBe(HOST_JS_DEFAULT_TIMEOUT_MS);
    expect(clampHostJsTimeoutMs(100)).toBe(1_000);
    expect(() => assertHostJsCode("")).toThrow(HostBridgeError);
    expect(assertHostJsCode("1+1")).toBe("1+1");
  });

  it("replHostJs handles %run against projectFiles", async () => {
    setHostJsRunnerForTests({
      async repl() {
        throw new Error("unused");
      },
      async runScript(opts) {
        return {
          incomplete: false,
          prompt: "> ",
          stdout: `ran:${opts.path}`,
          stderr: "",
        };
      },
      async reset() {},
      async cancelRepl() {},
      async ensure() {},
    });
    const ok = await replHostJs("%run hello.js", {
      projectFiles: { "hello.js": "console.log(1)\n" },
    });
    expect(ok.error).toBeUndefined();
    expect(ok.stdout).toContain("ran:hello.js");
    const missing = await replHostJs("%run nope.js", {
      projectFiles: { "hello.js": "1\n" },
    });
    expect(missing.error).toMatch(/找不到/);
  });
});
