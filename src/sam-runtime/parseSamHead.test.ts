import { describe, expect, it } from "vitest";
import {
  parseSamHead,
  parseSamProtocolToken,
  resolveSamMeta,
} from "./parseSamHead.ts";

describe("parseSamHead", () => {
  it("reads title and sam: meta tags", () => {
    const html = `<!doctype html><html><head>
      <title>Demo Agent</title>
      <meta name="sam:tool-kinds" content="editor:text, editor:md" />
      <meta name="sam:tool-globs" content="*.md, README*" />
      <meta name="sam:needs-controller" content="true" />
      <meta name="sam:protocol" content="brainstorm.v1" />
      <meta name="sam:capabilities" content="runPython, runCmd" />
    </head><body><p>hi</p></body></html>`;
    const meta = parseSamHead(html);
    expect(meta.title).toBe("Demo Agent");
    expect(meta.toolKinds).toEqual(["editor:text", "editor:md"]);
    expect(meta.toolGlobs).toEqual(["*.md", "README*"]);
    expect(meta.needsController).toBe(true);
    expect(meta.protocol).toBe("brainstorm.v1");
    expect(meta.sessionProtocols).toEqual([
      { protocolId: "brainstorm.v1", apiVersion: "1" },
    ]);
    expect(meta.capabilities).toEqual(["runPython", "runCmd"]);
  });

  it("parses sam:protocol tokens with apiVersion and roles", () => {
    const html = `<head>
      <meta name="sam:protocol" content="coding-orchestration.v1@1:worker+host, brainstorm.v1@2" />
    </head>`;
    const meta = parseSamHead(html);
    expect(meta.protocol).toBe("coding-orchestration.v1");
    expect(meta.sessionProtocols).toEqual([
      {
        protocolId: "coding-orchestration.v1",
        apiVersion: "1",
        roles: ["worker", "host"],
      },
      { protocolId: "brainstorm.v1", apiVersion: "2" },
    ]);
  });

  it("accepts content-before-name meta order", () => {
    const html = `<head><meta content="1" name="sam:needs-controller" /></head>`;
    expect(parseSamHead(html).needsController).toBe(true);
  });

  it("ignores legacy playgrounds: prefix", () => {
    const html = `<head>
      <title>X</title>
      <meta name="playgrounds:needs-controller" content="true" />
      <meta name="sam:tool-kinds" content="a" />
    </head>`;
    const meta = parseSamHead(html);
    expect(meta.needsController).toBeUndefined();
    expect(meta.toolKinds).toEqual(["a"]);
  });
});

describe("parseSamProtocolToken", () => {
  it("defaults apiVersion and splits roles on +", () => {
    expect(parseSamProtocolToken("foo.v1")).toEqual({
      protocolId: "foo.v1",
      apiVersion: "1",
    });
    expect(parseSamProtocolToken("foo.v1@9:a+b")).toEqual({
      protocolId: "foo.v1",
      apiVersion: "9",
      roles: ["a", "b"],
    });
  });
});

describe("resolveSamMeta", () => {
  it("sets name from title only", () => {
    const resolved = resolveSamMeta({
      title: "From Head",
      toolKinds: ["a"],
    });
    expect(resolved.name).toBe("From Head");
    expect(resolved.toolKinds).toEqual(["a"]);
  });

  it("omits name when title missing", () => {
    expect(resolveSamMeta({}).name).toBeUndefined();
  });
});
