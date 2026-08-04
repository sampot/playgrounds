import { describe, expect, it } from "vitest";
import {
  basename,
  buildFileTree,
  filesUnderDir,
  guessLanguage,
  isUnderDir,
  isValidProjectPath,
  joinProjectPath,
  normalizeProjectPath,
  parentDir,
  rewritePathPrefix,
  sortProjectPaths,
} from "./pathUtils";

describe("normalizeProjectPath", () => {
  it("strips leading ./ and /", () => {
    expect(normalizeProjectPath("./src/main.js")).toBe("src/main.js");
    expect(normalizeProjectPath("/index.html")).toBe("index.html");
  });

  it("strips trailing slashes", () => {
    expect(normalizeProjectPath("src/lib/")).toBe("src/lib");
  });

  it("resolves .. within project", () => {
    expect(normalizeProjectPath("a/b/../c.js")).toBe("a/c.js");
  });

  it("rejects escaping root", () => {
    expect(() => normalizeProjectPath("../x")).toThrow();
  });
});

describe("path helpers", () => {
  it("parentDir and basename", () => {
    expect(parentDir("src/app.js")).toBe("src");
    expect(basename("src/app.js")).toBe("app.js");
    expect(parentDir("app.js")).toBe("");
  });

  it("joinProjectPath", () => {
    expect(joinProjectPath("src", "lib", "a.js")).toBe("src/lib/a.js");
  });

  it("isValidProjectPath", () => {
    expect(isValidProjectPath("a/b.ts")).toBe(true);
    expect(isValidProjectPath("")).toBe(false);
  });

  it("sortProjectPaths", () => {
    expect(sortProjectPaths(["b.js", "a.js"])).toEqual(["a.js", "b.js"]);
  });

  it("guessLanguage", () => {
    expect(guessLanguage("x.HTML")).toBe("html");
    expect(guessLanguage("a.mjs")).toBe("javascript");
  });

  it("isUnderDir and filesUnderDir", () => {
    expect(isUnderDir("src/a.js", "src")).toBe(true);
    expect(isUnderDir("src", "src")).toBe(true);
    expect(isUnderDir("lib/a.js", "src")).toBe(false);
    expect(filesUnderDir(["src/a.js", "src/b/c.js", "root.js"], "src")).toEqual(
      ["src/a.js", "src/b/c.js"]
    );
  });

  it("rewritePathPrefix", () => {
    expect(rewritePathPrefix("src/a.js", "src", "lib")).toBe("lib/a.js");
    expect(rewritePathPrefix("src", "src", "lib")).toBe("lib");
  });
});

describe("buildFileTree", () => {
  it("nests files and sorts dirs before files", () => {
    const tree = buildFileTree(["z.js", "src/a.js", "src/b.js"], ["empty"]);
    expect(tree.map(n => n.name)).toEqual(["empty", "src", "z.js"]);
    const src = tree.find(n => n.kind === "dir" && n.name === "src");
    expect(src?.kind).toBe("dir");
    if (src?.kind === "dir") {
      expect(src.children.map(c => c.name)).toEqual(["a.js", "b.js"]);
    }
    const empty = tree.find(n => n.kind === "dir" && n.name === "empty");
    expect(empty?.kind).toBe("dir");
    if (empty?.kind === "dir") {
      expect(empty.children).toEqual([]);
    }
  });
});
