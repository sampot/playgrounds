import { describe, expect, it } from "vitest";
import { normalizeSearchArgs, sliceFileContent } from "./agentToolHelpers";

describe("normalizeSearchArgs", () => {
  it("keeps query", () => {
    expect(normalizeSearchArgs({ query: "foo", glob: "*.js" })).toEqual({
      query: "foo",
      glob: "*.js",
      maxResults: undefined,
    });
  });

  it("aliases pattern to query when query missing", () => {
    expect(normalizeSearchArgs({ pattern: "start-ai" })).toEqual({
      query: "start-ai",
      glob: undefined,
      maxResults: undefined,
    });
  });

  it("prefers query over pattern", () => {
    expect(normalizeSearchArgs({ query: "a", pattern: "b" }).query).toBe("a");
  });
});

describe("sliceFileContent", () => {
  it("windows by 1-based line offset", () => {
    const file = ["L1", "L2", "L3", "L4", "L5"].join("\n");
    const r = sliceFileContent(file, { offset: 2, limit: 2 });
    expect(r).toEqual({
      content: "L2\nL3",
      offset: 2,
      totalLines: 5,
      totalChars: file.length,
      truncated: true,
      nextOffset: 4,
    });
  });

  it("defaults to line 1 and clears nextOffset at end", () => {
    const r = sliceFileContent("hi\nthere", { defaultLimit: 10 });
    expect(r.content).toBe("hi\nthere");
    expect(r.offset).toBe(1);
    expect(r.truncated).toBe(false);
    expect(r.nextOffset).toBeNull();
  });
});
