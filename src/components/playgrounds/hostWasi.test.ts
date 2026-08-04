import { afterEach, describe, expect, it } from "vitest";
import { HostBridgeError } from "./hostBridge";
import {
  HOST_WASI_MAX_ARGS,
  HOST_WASI_MAX_OUTPUT_CHARS,
  listHostCmds,
  runHostCmd,
  setHostWasiRunnerForTests,
  type HostWasiRunner,
} from "./hostWasi";
import {
  diffFileMaps,
  joinFilesWithCwd,
  normalizeWasiCwd,
  sliceFilesForCwd,
  truncateUtf8,
} from "./hostWasiFs";

afterEach(() => {
  setHostWasiRunnerForTests(null);
});

describe("hostWasiFs", () => {
  it("normalizes cwd and slices/joins file trees", () => {
    expect(normalizeWasiCwd(".")).toBe("");
    expect(normalizeWasiCwd("src/lib")).toBe("src/lib");
    const files = {
      "src/a.json": '{"x":1}',
      "src/lib/b.json": "{}",
      "root.txt": "hi",
    };
    expect(sliceFilesForCwd(files, "src")).toEqual({
      "a.json": '{"x":1}',
      "lib/b.json": "{}",
    });
    expect(joinFilesWithCwd({ "a.json": "1" }, "src")).toEqual({
      "src/a.json": "1",
    });
  });

  it("diffs changed files", () => {
    const before = { a: "1", b: "2" };
    const after = { a: "1", b: "3", c: "4" };
    expect(diffFileMaps(before, after)).toEqual({ b: "3", c: "4" });
  });

  it("truncates long output", () => {
    const r = truncateUtf8("abcdefghij", 4);
    expect(r).toEqual({ text: "abcd", truncated: true });
  });
});

describe("runHostCmd (mock runner)", () => {
  it("lists allowlisted commands", () => {
    const { commands } = listHostCmds();
    expect(commands.some(c => c.name === "jq")).toBe(true);
    expect(commands.some(c => c.name === "grep")).toBe(true);
    expect(commands.some(c => c.name === "sed")).toBe(true);
    expect(commands.some(c => c.name === "find")).toBe(true);
    expect(commands.some(c => c.name === "awk")).toBe(true);
    expect(
      commands.some(c => c.name === "diff" && c.family === "diffutils")
    ).toBe(true);
    expect(
      commands.some(c => c.name === "cowsay" && c.family === "cowsay")
    ).toBe(true);
    expect(
      commands.some(c => c.name === "cowthink" && c.family === "cowsay")
    ).toBe(true);
    expect(commands.some(c => c.name === "wc" && c.family === "uutils")).toBe(
      true
    );
    expect(commands.some(c => c.name === "yes")).toBe(false);
    expect(commands.some(c => c.name === "dd")).toBe(false);
  });

  it("rejects unknown commands", async () => {
    await expect(runHostCmd({ cmd: "bash", files: {} })).rejects.toMatchObject({
      code: "not_supported",
    });
  });

  it("returns stdout and maps filesOut through cwd (memory mode)", async () => {
    const runner: HostWasiRunner = {
      async run({ entries }) {
        return {
          stdout: "1\n",
          stderr: "",
          exitCode: 0,
          entriesOut: [
            ...(entries ?? []),
            {
              path: "out.json",
              bytes: new TextEncoder().encode("true"),
            },
          ],
        };
      },
    };
    setHostWasiRunnerForTests(runner);
    const r = await runHostCmd({
      cmd: "jq",
      args: [".", "data.json"],
      cwd: "src",
      files: { "src/data.json": "{}" },
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("1\n");
    expect(r.filesOut["src/out.json"]).toBe("true");
  });

  it("passes projectId to OPFS runner and surfaces changedPaths", async () => {
    let seen: { projectId?: string; cwd?: string } = {};
    setHostWasiRunnerForTests({
      async run(opts) {
        seen = { projectId: opts.projectId, cwd: opts.cwd };
        return {
          stdout: "",
          stderr: "",
          exitCode: 0,
          changedPaths: ["src/a.txt"],
          deletedPaths: ["gone.txt"],
        };
      },
    });
    const r = await runHostCmd({
      cmd: "jq",
      cwd: "src",
      projectId: "proj-1",
    });
    expect(seen).toEqual({ projectId: "proj-1", cwd: "src" });
    expect(r.filesOut).toEqual({});
    expect(r.changedPaths).toEqual(["src/a.txt"]);
    expect(r.deletedPaths).toEqual(["gone.txt"]);
  });

  it("passes default and custom env to the runner", async () => {
    let seenEnv: string[] = [];
    setHostWasiRunnerForTests({
      async run({ env }) {
        seenEnv = env;
        return { stdout: "", stderr: "", exitCode: 0, entriesOut: [] };
      },
    });
    await runHostCmd({ cmd: "jq", cwd: "src", files: {} });
    expect(seenEnv).toContain("PWD=/src");
    expect(seenEnv).toContain("HOME=/");
    expect(seenEnv).toContain("USER=playground");

    await runHostCmd({
      cmd: "jq",
      cwd: ".",
      env: { FOO: "bar", PWD: "/ignored" },
      files: {},
    });
    expect(seenEnv).toContain("FOO=bar");
    expect(seenEnv).toContain("PWD=/");
    expect(seenEnv.some(e => e.startsWith("HOME="))).toBe(false);
  });

  it("maps bad cwd to bad_path", async () => {
    try {
      await runHostCmd({ cmd: "jq", cwd: "../escape", files: {} });
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(HostBridgeError);
      expect((e as HostBridgeError).code).toBe("bad_path");
    }
  });

  it("truncates oversized stdout", async () => {
    const huge = "x".repeat(HOST_WASI_MAX_OUTPUT_CHARS + 10);
    setHostWasiRunnerForTests({
      async run() {
        return {
          stdout: huge,
          stderr: "",
          exitCode: 0,
          entriesOut: [],
        };
      },
    });
    const r = await runHostCmd({ cmd: "jq", files: {} });
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBe(HOST_WASI_MAX_OUTPUT_CHARS);
  });

  it("rejects oversized args; does not reject large file maps (DEC-039)", async () => {
    setHostWasiRunnerForTests({
      async run() {
        return { stdout: "", stderr: "", exitCode: 0, entriesOut: [] };
      },
    });
    await expect(
      runHostCmd({
        cmd: "jq",
        args: Array.from({ length: HOST_WASI_MAX_ARGS + 1 }, () => "x"),
        files: {},
      })
    ).rejects.toMatchObject({ code: "too_large" });

    const fat = "y".repeat(20 * 1024 * 1024);
    await expect(
      runHostCmd({ cmd: "jq", files: { "big.txt": fat } })
    ).resolves.toMatchObject({ exitCode: 0 });
  });

  it("serializes concurrent runHostCmd calls", async () => {
    const order: number[] = [];
    setHostWasiRunnerForTests({
      async run({ stdin }) {
        const n = Number(stdin);
        order.push(n);
        await new Promise(r => setTimeout(r, 20));
        order.push(n + 10);
        return { stdout: String(n), stderr: "", exitCode: 0, entriesOut: [] };
      },
    });
    const [a, b] = await Promise.all([
      runHostCmd({ cmd: "jq", stdin: "1", files: {} }),
      runHostCmd({ cmd: "jq", stdin: "2", files: {} }),
    ]);
    expect(a.stdout).toBe("1");
    expect(b.stdout).toBe("2");
    expect(order).toEqual([1, 11, 2, 12]);
  });
});
