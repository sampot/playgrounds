import { describe, expect, it } from "vitest";
import { globToRegExp, pathMatchesGlob, searchFileMap } from "./hostSearch";

describe("globToRegExp / pathMatchesGlob", () => {
  it("matches * and **", () => {
    expect(pathMatchesGlob("src/app.js", "src/*")).toBe(true);
    expect(pathMatchesGlob("src/nested/app.js", "src/*")).toBe(false);
    expect(pathMatchesGlob("src/nested/app.js", "src/**")).toBe(true);
    expect(pathMatchesGlob("readme.md", "*.md")).toBe(true);
  });

  it("builds a usable regex", () => {
    expect(globToRegExp("**/*.ts").test("a/b/c.ts")).toBe(true);
  });
});

describe("searchFileMap", () => {
  it("finds substring matches and skips binary", () => {
    const matches = searchFileMap(
      {
        "a.js": ["hello world", "foo"].join("\n"),
        "b.js": "nope",
        "c.png": new Uint8Array([1, 2, 3]),
      },
      { query: "hello" }
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      path: "a.js",
      line: 1,
      text: "hello world",
    });
  });

  it("respects glob and maxResults", () => {
    const files = {
      "src/a.ts": "needle",
      "src/b.ts": "needle",
      "lib/c.ts": "needle",
    };
    const matches = searchFileMap(files, {
      query: "needle",
      glob: "src/*",
      maxResults: 1,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.path.startsWith("src/")).toBe(true);
  });

  it("returns empty for empty query", () => {
    expect(searchFileMap({ "a.js": "x" }, { query: "" })).toEqual([]);
  });
});
