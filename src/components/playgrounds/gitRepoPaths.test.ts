import { describe, expect, it } from "vitest";
import { shouldIncludeRepoPath } from "./gitRepoPaths";

describe("shouldIncludeRepoPath", () => {
  it("excludes host side-meta files from git import", () => {
    expect(shouldIncludeRepoPath(".playgrounds-meta.json", "")).toBe(false);
    expect(shouldIncludeRepoPath(".ide-meta.json", "")).toBe(false);
    expect(shouldIncludeRepoPath("pkg/.playgrounds-meta.json", "")).toBe(false);
  });

  it("still includes normal SAM sources", () => {
    expect(shouldIncludeRepoPath("index.html", "")).toBe(true);
    expect(shouldIncludeRepoPath("app.js", "")).toBe(true);
  });

  it("includes workflow / config text files (e.g. workflow.yaml)", () => {
    expect(shouldIncludeRepoPath("workflow.yaml", "")).toBe(true);
    expect(shouldIncludeRepoPath("config.yml", "")).toBe(true);
    expect(shouldIncludeRepoPath("pyproject.toml", "")).toBe(true);
    expect(shouldIncludeRepoPath("steps/publish.js", "")).toBe(true);
  });

  it("still excludes unknown extensions", () => {
    expect(shouldIncludeRepoPath("blob.dat", "")).toBe(false);
  });
});
