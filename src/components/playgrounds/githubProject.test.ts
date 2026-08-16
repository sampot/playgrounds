import { describe, expect, it, vi } from "vitest";
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

describe("fetchGithubTipRev", () => {
  it("returns the tree sha from the GitHub trees API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      expect(url).toContain("/git/trees/main");
      return Response.json({
        sha: "deadbeefcafebabe",
        tree: [{ path: "index.html", type: "blob", sha: "blob1", size: 10 }],
        truncated: false,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchGithubTipRev } = await import("./githubProject");
    await expect(
      fetchGithubTipRev({ owner: "sampot", repo: "pg-gomoku" })
    ).resolves.toBe("deadbeefcafebabe");
    vi.unstubAllGlobals();
  });
});
