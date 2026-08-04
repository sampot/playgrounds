import { describe, expect, it } from "vitest";
import {
  expandGlobsInTokens,
  globToRegExp,
  listGlobCandidates,
  matchShellGlob,
} from "./shellGlob";
import { tokenizeShellLineDetailed } from "./shellReadline";

const files = {
  "readme.md": "",
  "a.txt": "",
  "b.txt": "",
  "src/main.ts": "",
  "src/util.ts": "",
  "src/lib/x.ts": "",
};

describe("shellGlob", () => {
  it("builds segment-safe regex", () => {
    expect(globToRegExp("*.txt").test("a.txt")).toBe(true);
    expect(globToRegExp("*.txt").test("src/a.txt")).toBe(false);
    expect(globToRegExp("src/*.ts").test("src/main.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/lib/x.ts")).toBe(false);
    expect(globToRegExp("?.txt").test("a.txt")).toBe(true);
    expect(globToRegExp("?.txt").test("ab.txt")).toBe(false);
  });

  it("lists candidates", () => {
    expect(listGlobCandidates(files, "", false)).toEqual([
      "a.txt",
      "b.txt",
      "readme.md",
      "src",
    ]);
    expect(listGlobCandidates(files, "src", false)).toEqual([
      "lib",
      "main.ts",
      "util.ts",
    ]);
    expect(listGlobCandidates(files, "", true)).toContain("src/lib/x.ts");
  });

  it("matches relative to cwd", () => {
    expect(matchShellGlob("*.txt", "", files)).toEqual(["a.txt", "b.txt"]);
    expect(matchShellGlob("*.ts", "src", files)).toEqual([
      "main.ts",
      "util.ts",
    ]);
    expect(matchShellGlob("src/*.ts", "", files)).toEqual([
      "src/main.ts",
      "src/util.ts",
    ]);
    expect(matchShellGlob("nope*", "", files)).toEqual([]);
  });

  it("expands unquoted tokens only", () => {
    const tokens = tokenizeShellLineDetailed("cat *.txt '*.txt'");
    expect(expandGlobsInTokens(tokens, "", files)).toEqual([
      "cat",
      "a.txt",
      "b.txt",
      "*.txt",
    ]);
  });
});
