import { describe, expect, it } from "vitest";
import { formatGithubSource, parseGithubUrl } from "./githubProject";

describe("parseGithubUrl", () => {
  it("parses full tree URL", () => {
    expect(
      parseGithubUrl("https://github.com/acme/demo/tree/main/examples/web")
    ).toEqual({
      owner: "acme",
      repo: "demo",
      ref: "main",
      path: "examples/web",
    });
  });

  it("parses repo root URL", () => {
    expect(parseGithubUrl("https://github.com/acme/demo")).toEqual({
      owner: "acme",
      repo: "demo",
      ref: undefined,
      path: undefined,
    });
  });

  it("parses owner/repo shorthand", () => {
    expect(parseGithubUrl("acme/demo")).toEqual({
      owner: "acme",
      repo: "demo",
      path: undefined,
    });
  });

  it("returns null for non-github", () => {
    expect(parseGithubUrl("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("formatGithubSource", () => {
  it("formats with ref and path", () => {
    expect(
      formatGithubSource({
        owner: "a",
        repo: "b",
        ref: "main",
        path: "pkg",
      })
    ).toBe("https://github.com/a/b/tree/main/pkg");
  });
});
