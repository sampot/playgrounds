import { describe, expect, it } from "vitest";
import {
  filterOutGitPaths,
  isGitPath,
  omitGitFromFileMap,
} from "./gitPathUtils";

describe("gitPathUtils", () => {
  it("detects .git paths", () => {
    expect(isGitPath(".git")).toBe(true);
    expect(isGitPath(".git/objects/xx")).toBe(true);
    expect(isGitPath("src/.git/config")).toBe(true);
    expect(isGitPath("src/main.ts")).toBe(false);
  });

  it("filters maps and lists", () => {
    expect(filterOutGitPaths(["a.ts", ".git/HEAD", "b.ts"])).toEqual([
      "a.ts",
      "b.ts",
    ]);
    expect(
      omitGitFromFileMap({ "a.ts": "1", ".git/config": "x", "b.ts": "2" })
    ).toEqual({ "a.ts": "1", "b.ts": "2" });
  });
});
