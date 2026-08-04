import { describe, expect, it } from "vitest";
import { createDefaultShellEnv } from "./shellEnv";
import {
  SHELL_MAX_PIPELINE_STAGES,
  dispatchShellLine,
  formatShellBanner,
  formatShellPrompt,
  listShellDir,
  resolveShellCwd,
  splitPipelineSegments,
  tokenizeShellLine,
  terminalDisplayWidth,
  visiblePromptLength,
} from "./shellReadline";

const baseEnv = createDefaultShellEnv("");

function ctx(
  partial: {
    cwd?: string;
    files?: Record<string, string>;
    env?: Record<string, string>;
  } = {}
) {
  return {
    cwd: partial.cwd ?? "",
    files: partial.files ?? {},
    env: partial.env ?? { ...baseEnv },
  };
}

describe("shellReadline", () => {
  it("tokenizes quotes", () => {
    expect(tokenizeShellLine(`jq '.a' "my file.json"`)).toEqual([
      "jq",
      ".a",
      "my file.json",
    ]);
  });

  it("splits pipelines outside quotes", () => {
    expect(splitPipelineSegments(`jq . a.json | jq '.[0]'`)).toEqual([
      "jq . a.json",
      "jq '.[0]'",
    ]);
    expect(splitPipelineSegments(`jq '.|length' a.json`)).toEqual([
      "jq '.|length' a.json",
    ]);
  });

  it("resolves cd paths", () => {
    expect(resolveShellCwd("src", "lib")).toEqual({ cwd: "src/lib" });
    expect(resolveShellCwd("src/lib", "..")).toEqual({ cwd: "src" });
    expect(resolveShellCwd("src", "/")).toEqual({ cwd: "" });
  });

  it("lists directory entries", () => {
    const text = listShellDir(
      {
        "a.json": "{}",
        "src/b.json": "{}",
        "src/lib/c.json": "{}",
      },
      "src"
    );
    expect(text.split("\n").sort()).toEqual(["b.json", "lib/"]);
  });

  it("dispatches builtins vs wasi run", () => {
    expect(dispatchShellLine("pwd", ctx({ cwd: "src" }))).toEqual({
      kind: "output",
      text: "/src",
      exitCode: 0,
    });
    expect(dispatchShellLine("jq . data.json", ctx())).toEqual({
      kind: "run",
      cmd: "jq",
      args: [".", "data.json"],
      env: baseEnv,
    });
    expect(dispatchShellLine("wc -l README.md", ctx())).toEqual({
      kind: "run",
      cmd: "wc",
      args: ["-l", "README.md"],
      env: baseEnv,
    });
    expect(dispatchShellLine("ls -la", ctx())).toEqual({
      kind: "run",
      cmd: "ls",
      args: ["-la"],
      env: baseEnv,
    });
  });

  it("export / unset / env manage session environment", () => {
    const exported = dispatchShellLine("export FOO=bar", ctx());
    expect(exported).toMatchObject({
      kind: "output",
      text: "",
      env: expect.objectContaining({ FOO: "bar", HOME: "/" }),
    });
    const envAfter = (exported as { env: Record<string, string> }).env;

    expect(dispatchShellLine("env", ctx({ env: envAfter }))).toMatchObject({
      kind: "output",
      text: expect.stringContaining("FOO=bar"),
    });

    const unset = dispatchShellLine("unset FOO", ctx({ env: envAfter }));
    expect(unset).toMatchObject({ kind: "output", text: "" });
    expect((unset as { env: Record<string, string> }).env.FOO).toBeUndefined();

    expect(dispatchShellLine("export", ctx({ env: envAfter }))).toMatchObject({
      kind: "output",
      text: expect.stringContaining("FOO=bar"),
    });
  });

  it("expands $VAR and supports one-shot assignments", () => {
    const env = { ...baseEnv, FOO: "hello" };
    expect(dispatchShellLine("echo $FOO", ctx({ env }))).toEqual({
      kind: "run",
      cmd: "echo",
      args: ["hello"],
      env,
    });
    expect(dispatchShellLine("FOO=x printenv FOO", ctx({ env }))).toEqual({
      kind: "run",
      cmd: "printenv",
      args: ["FOO"],
      env: { ...env, FOO: "x" },
    });
    expect(dispatchShellLine("BAR=1", ctx({ env }))).toEqual({
      kind: "output",
      text: "",
      env: { ...env, BAR: "1" },
      exitCode: 0,
    });
  });

  it("cd updates PWD in env", () => {
    const r = dispatchShellLine("cd src", ctx());
    expect(r).toMatchObject({
      kind: "output",
      cwd: "src",
      env: expect.objectContaining({ PWD: "/src" }),
      exitCode: 0,
    });
  });

  it("expands $? from lastExit", () => {
    expect(
      dispatchShellLine("echo $?", ctx({ env: { ...baseEnv } }))
    ).toMatchObject({
      kind: "run",
      cmd: "echo",
      args: ["0"],
    });
    expect(
      dispatchShellLine("echo $?", {
        ...ctx(),
        lastExit: 2,
      })
    ).toMatchObject({
      kind: "run",
      cmd: "echo",
      args: ["2"],
    });
  });

  it("formats user@project prompt with colors and ~", () => {
    const plain = formatShellPrompt({
      cwd: "",
      projectName: "Demo App",
      color: false,
    });
    expect(plain).toBe("playground@Demo-App:~$ ");
    const colored = formatShellPrompt({
      cwd: "src",
      projectName: "x",
      lastExit: 1,
      color: true,
    });
    expect(colored).toContain("playground@x");
    expect(colored).toContain("/src");
    expect(colored).toContain("\x1b[31m");
    expect(visiblePromptLength(colored)).toBe(
      visiblePromptLength(
        formatShellPrompt({ cwd: "src", projectName: "x", color: false })
      )
    );
  });

  it("counts CJK project names as double-width for cursor columns", () => {
    const plain = formatShellPrompt({
      cwd: "",
      projectName: "五子棋-coder",
      color: false,
    });
    expect(plain).toBe("playground@五子棋-coder:~$ ");
    // 3 CJK chars → +3 cells vs String.length
    expect(terminalDisplayWidth(plain)).toBe(plain.length + 3);
    const colored = formatShellPrompt({
      cwd: "",
      projectName: "五子棋-coder",
      color: true,
    });
    expect(visiblePromptLength(colored)).toBe(terminalDisplayWidth(plain));
  });

  it("banner is short and points to help", () => {
    const text = formatShellBanner();
    expect(text).toContain("Playgrounds Shell");
    expect(text).toContain("help");
    expect(text).not.toContain("\n");
    expect(text.length).toBeLessThan(120);
  });

  it("help describes each allowlisted cmd with its own summary", () => {
    const r = dispatchShellLine("help", ctx());
    expect(r).toMatchObject({ kind: "output", exitCode: 0 });
    if (r.kind !== "output") return;
    expect(r.text).toContain("cat  — Concatenate and print files");
    expect(r.text).toContain("wc  — Print newline, word, and byte counts");
    expect(r.text).toContain("grep  — Search PATTERNS in files");
    expect(r.text).not.toMatch(/uutils/i);
  });

  it("dispatches human pipelines and rejects builtins in them", () => {
    expect(dispatchShellLine("jq . a.json | jq .[0]", ctx())).toMatchObject({
      kind: "pipeline",
      stages: [
        { cmd: "jq", args: [".", "a.json"] },
        { cmd: "jq", args: [".[0]"] },
      ],
      env: baseEnv,
    });
    expect(dispatchShellLine("ls | wc -l", ctx())).toMatchObject({
      kind: "pipeline",
      stages: [
        { cmd: "ls", args: [] },
        { cmd: "wc", args: ["-l"] },
      ],
      env: baseEnv,
    });
    expect(dispatchShellLine("FOO=1 ls | wc -l", ctx())).toMatchObject({
      kind: "pipeline",
      stages: [
        { cmd: "ls", args: [] },
        { cmd: "wc", args: ["-l"] },
      ],
      env: { ...baseEnv, FOO: "1" },
    });
    expect(dispatchShellLine("cd / | jq .", ctx())).toMatchObject({
      kind: "output",
      text: expect.stringContaining("內建"),
    });
    const tooLong = Array.from(
      { length: SHELL_MAX_PIPELINE_STAGES + 1 },
      () => "jq ."
    ).join(" | ");
    expect(dispatchShellLine(tooLong, ctx())).toMatchObject({
      kind: "output",
      text: expect.stringContaining("管線過長"),
    });
  });

  it("dispatches && / || / ; chains (not as pipelines)", () => {
    expect(dispatchShellLine("false || echo ok", ctx())).toEqual({
      kind: "chain",
      segments: ["false", "echo ok"],
      ops: ["||"],
    });
    expect(dispatchShellLine("cd src && ls", ctx())).toEqual({
      kind: "chain",
      segments: ["cd src", "ls"],
      ops: ["&&"],
    });
    expect(dispatchShellLine("echo a ; echo b", ctx())).toEqual({
      kind: "chain",
      segments: ["echo a", "echo b"],
      ops: [";"],
    });
  });

  it("expands unquoted globs into argv", () => {
    const files = {
      "a.md": "",
      "b.md": "",
      "src/x.ts": "",
    };
    expect(dispatchShellLine("cat *.md", ctx({ files }))).toMatchObject({
      kind: "run",
      cmd: "cat",
      args: ["a.md", "b.md"],
    });
    expect(dispatchShellLine("cat '*.md'", ctx({ files }))).toMatchObject({
      kind: "run",
      cmd: "cat",
      args: ["*.md"],
    });
    expect(dispatchShellLine("ls src/*.ts", ctx({ files }))).toMatchObject({
      kind: "run",
      cmd: "ls",
      args: ["src/x.ts"],
    });
    // Assignment values are not glob-expanded
    expect(dispatchShellLine("FOO=*.md", ctx({ files }))).toMatchObject({
      kind: "output",
      env: expect.objectContaining({ FOO: "*.md" }),
    });
    // No match → literal
    expect(dispatchShellLine("cat *.nope", ctx({ files }))).toMatchObject({
      kind: "run",
      cmd: "cat",
      args: ["*.nope"],
    });
    expect(dispatchShellLine("cat < *.md", ctx({ files }))).toMatchObject({
      kind: "output",
      text: expect.stringContaining("ambiguous redirect"),
      exitCode: 1,
    });
    expect(
      dispatchShellLine("cat < a.md", ctx({ files: { "a.md": "x" } }))
    ).toMatchObject({
      kind: "run",
      cmd: "cat",
      redirects: { stdinPath: "a.md" },
    });
  });

  it("parses > / >> / < redirects on run and pipeline", () => {
    expect(dispatchShellLine("echo hi > out.txt", ctx())).toMatchObject({
      kind: "run",
      cmd: "echo",
      args: ["hi"],
      redirects: { stdoutPath: "out.txt", stdoutAppend: false },
    });
    expect(dispatchShellLine("cat < in.txt >> out.txt", ctx())).toMatchObject({
      kind: "run",
      cmd: "cat",
      args: [],
      redirects: {
        stdinPath: "in.txt",
        stdoutPath: "out.txt",
        stdoutAppend: true,
      },
    });
    expect(dispatchShellLine("ls | wc -l > count.txt", ctx())).toMatchObject({
      kind: "pipeline",
      stages: [
        { cmd: "ls", args: [] },
        { cmd: "wc", args: ["-l"] },
      ],
      redirects: { stdoutPath: "count.txt", stdoutAppend: false },
    });
    expect(dispatchShellLine("pwd > where.txt", ctx())).toMatchObject({
      kind: "output",
      text: "/",
      redirects: { stdoutPath: "where.txt", stdoutAppend: false },
    });
  });
});
