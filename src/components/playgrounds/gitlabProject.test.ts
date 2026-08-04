import { describe, expect, it } from "vitest";
import { formatGitlabSource, parseGitlabUrl } from "./gitlabProject";

describe("parseGitlabUrl", () => {
  it("parses project root", () => {
    expect(parseGitlabUrl("https://gitlab.com/acme/demo")).toEqual({
      projectPath: "acme/demo",
      ref: undefined,
      path: undefined,
    });
  });

  it("parses subgroup and tree path", () => {
    expect(
      parseGitlabUrl(
        "https://gitlab.com/acme/group/demo/-/tree/main/examples/web"
      )
    ).toEqual({
      projectPath: "acme/group/demo",
      ref: "main",
      path: "examples/web",
    });
  });

  it("returns null for non-gitlab", () => {
    expect(parseGitlabUrl("https://github.com/a/b")).toBeNull();
    expect(parseGitlabUrl("acme/demo")).toBeNull();
  });
});

describe("formatGitlabSource", () => {
  it("formats with ref and path", () => {
    expect(
      formatGitlabSource({
        projectPath: "a/b",
        ref: "main",
        path: "pkg",
      })
    ).toBe("https://gitlab.com/a/b/-/tree/main/pkg");
  });
});
