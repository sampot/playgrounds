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

  it("defaults to main only — no master or /repos fallback", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/git/trees/main")) {
        return new Response("Not Found", { status: 404 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { fetchGithubTipRev } = await import("./githubProject");
    await expect(
      fetchGithubTipRev({ owner: "sampot", repo: "legacy-master" })
    ).rejects.toThrow(/HTTP 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const urls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes("/git/trees/master"))).toBe(false);
    expect(urls.some(u => /\/repos\/[^/]+\/[^/]+$/.test(u))).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("fetchGithubProject", () => {
  it("returns files plus tipRev from the same trees call", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/git/trees/main")) {
        return Response.json({
          sha: "tipsha123",
          tree: [
            {
              path: "index.html",
              type: "blob",
              sha: "blobsha",
              size: 12,
            },
          ],
          truncated: false,
        });
      }
      if (url.includes("raw.githubusercontent.com")) {
        return new Response("<html></html>", { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { fetchGithubProject } = await import("./githubProject");
    const result = await fetchGithubProject({
      owner: "sampot",
      repo: "pg-gomoku",
    });
    expect(result.tipRev).toBe("tipsha123");
    expect(result.files["index.html"]).toBeDefined();
    expect(
      fetchMock.mock.calls.filter(c =>
        String(c[0]).includes("api.github.com")
      )
    ).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
