import { describe, expect, it } from "vitest";
import {
  peelRedirects,
  splitChainSegments,
  splitPipelineSegments,
} from "./shellSyntax";

describe("shellSyntax", () => {
  it("splits && / || / ; outside quotes", () => {
    expect(splitChainSegments("false || echo ok")).toEqual({
      segments: ["false", "echo ok"],
      ops: ["||"],
    });
    expect(splitChainSegments("cd src && ls && pwd")).toEqual({
      segments: ["cd src", "ls", "pwd"],
      ops: ["&&", "&&"],
    });
    expect(splitChainSegments("echo a ; echo b")).toEqual({
      segments: ["echo a", "echo b"],
      ops: [";"],
    });
    expect(splitChainSegments('echo "a && b" && pwd')).toEqual({
      segments: ['echo "a && b"', "pwd"],
      ops: ["&&"],
    });
  });

  it("does not treat || as a pipe", () => {
    expect(splitPipelineSegments("false || echo ok")).toEqual([
      "false || echo ok",
    ]);
    expect(splitPipelineSegments("ls | wc -l")).toEqual(["ls", "wc -l"]);
  });

  it("peels redirects", () => {
    expect(peelRedirects(["echo", "hi", ">", "out.txt"])).toEqual({
      tokens: ["echo", "hi"],
      redirects: { stdoutPath: "out.txt", stdoutAppend: false },
    });
    expect(peelRedirects(["cat", "<", "in.txt", ">>", "out.txt"])).toEqual({
      tokens: ["cat"],
      redirects: {
        stdinPath: "in.txt",
        stdoutPath: "out.txt",
        stdoutAppend: true,
      },
    });
    expect(peelRedirects(["echo", "x", ">out.txt"])).toEqual({
      tokens: ["echo", "x"],
      redirects: { stdoutPath: "out.txt", stdoutAppend: false },
    });
  });
});
