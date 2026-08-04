import { describe, expect, it } from "vitest";
import {
  buildXargsInvocations,
  parseXargsArgv,
  splitXargsItems,
} from "./shellXargs";

describe("shellXargs", () => {
  it("parses options and require allowlisted cmd", () => {
    expect(parseXargsArgv(["grep", "-n", "foo"])).toEqual({
      ok: true,
      cmd: "grep",
      baseArgs: ["-n", "foo"],
      maxArgs: 32,
      nullSep: false,
      noRunIfEmpty: false,
      replace: undefined,
    });
    expect(parseXargsArgv(["-n", "2", "-r", "echo"])).toMatchObject({
      ok: true,
      cmd: "echo",
      maxArgs: 2,
      noRunIfEmpty: true,
    });
    expect(parseXargsArgv(["-I{}", "echo", "hi-{}", "x"])).toMatchObject({
      ok: true,
      cmd: "echo",
      baseArgs: ["hi-{}", "x"],
      replace: "{}",
      maxArgs: 1,
    });
    expect(parseXargsArgv(["bash", "-c", "x"])).toMatchObject({
      ok: false,
      error: expect.stringContaining("允許清單"),
    });
  });

  it("splits stdin items", () => {
    expect(splitXargsItems("a  b\nc", false)).toEqual(["a", "b", "c"]);
    expect(splitXargsItems("a\0b\0", true)).toEqual(["a", "b"]);
  });

  it("batches invocations", () => {
    const parsed = parseXargsArgv(["-n", "2", "echo"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = buildXargsInvocations(parsed, "a b c d");
    expect(r).toEqual({
      invocations: [
        { cmd: "echo", args: ["a", "b"] },
        { cmd: "echo", args: ["c", "d"] },
      ],
    });
  });

  it("supports -I replace and -r empty", () => {
    const parsed = parseXargsArgv(["-I{}", "echo", "file:{}"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(buildXargsInvocations(parsed, "a.md b.md")).toEqual({
      invocations: [
        { cmd: "echo", args: ["file:a.md"] },
        { cmd: "echo", args: ["file:b.md"] },
      ],
    });
    const empty = parseXargsArgv(["-r", "echo"]);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(buildXargsInvocations(empty, "")).toEqual({ invocations: [] });
  });
});
