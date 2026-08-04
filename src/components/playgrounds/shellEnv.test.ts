import { describe, expect, it } from "vitest";
import {
  createDefaultShellEnv,
  expandShellVars,
  formatShellEnv,
  normalizeShellEnv,
  peelEnvAssignments,
  pwdFromCwd,
  resolveRunEnv,
  shellEnvToWasi,
  syncShellEnvPwd,
} from "./shellEnv";

describe("shellEnv", () => {
  it("builds defaults and syncs PWD", () => {
    expect(pwdFromCwd("")).toBe("/");
    expect(pwdFromCwd("src/lib")).toBe("/src/lib");
    expect(createDefaultShellEnv("src")).toMatchObject({
      HOME: "/",
      USER: "playground",
      PATH: "/bin",
      PWD: "/src",
      TERM: "xterm-256color",
    });
    expect(syncShellEnvPwd({ FOO: "1", PWD: "/old" }, "a")).toEqual({
      FOO: "1",
      PWD: "/a",
    });
  });

  it("formats and converts to WASI env strings", () => {
    expect(formatShellEnv({ B: "2", A: "1" })).toBe("A=1\nB=2");
    expect(shellEnvToWasi({ B: "2", A: "1" })).toEqual(["A=1", "B=2"]);
  });

  it("resolveRunEnv: omit → defaults; provide → authoritative + PWD", () => {
    expect(resolveRunEnv({ cwd: "x" }).PWD).toBe("/x");
    expect(
      resolveRunEnv({ cwd: "x", env: { FOO: "bar", PWD: "/ignored" } })
    ).toEqual({ FOO: "bar", PWD: "/x" });
  });

  it("normalizes invalid names and truncates values", () => {
    expect(
      normalizeShellEnv({ "bad-name": "1", OK: "y".repeat(5000) }).OK?.length
    ).toBe(4096);
    expect(normalizeShellEnv({ "bad-name": "1", OK: "1" })).toEqual({
      OK: "1",
    });
  });

  it("expands $VAR / ${VAR} / $? outside single quotes", () => {
    const env = { HOME: "/", FOO: "bar", EMPTY: "" };
    expect(expandShellVars("echo $FOO", env)).toBe("echo bar");
    expect(expandShellVars("echo ${FOO}/x", env)).toBe("echo bar/x");
    expect(expandShellVars("echo '$FOO'", env)).toBe("echo '$FOO'");
    expect(expandShellVars('echo "$FOO"', env)).toBe('echo "bar"');
    expect(expandShellVars("echo $MISSING", env)).toBe("echo ");
    expect(expandShellVars("echo $?", env, { lastExit: 42 })).toBe("echo 42");
    expect(expandShellVars("echo ${?}", env, { lastExit: 7 })).toBe("echo 7");
  });

  it("peels leading assignments", () => {
    expect(peelEnvAssignments(["FOO=1", "BAR=2", "jq", "."])).toEqual({
      assigns: { FOO: "1", BAR: "2" },
      rest: ["jq", "."],
    });
    expect(peelEnvAssignments(["jq", "FOO=1"])).toEqual({
      assigns: {},
      rest: ["jq", "FOO=1"],
    });
  });
});
