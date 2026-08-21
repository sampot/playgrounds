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

describe("fetchGithubProjectFromManifest", () => {
  it("downloads via sam-manifest.json without calling api.github.com", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("api.github.com")) {
        throw new Error(`unexpected API: ${url}`);
      }
      if (url.includes("/sam-manifest.json")) {
        return new Response(
          JSON.stringify({
            version: 1,
            rev: "rev-9",
            files: ["index.html", "app.js"],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/index.html")) {
        return new Response("<html></html>", { status: 200 });
      }
      if (url.includes("/app.js")) {
        return new Response("console.log(1)", { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { fetchGithubProjectFromManifest } = await import("./githubProject");
    const result = await fetchGithubProjectFromManifest({
      owner: "sampot",
      repo: "pg-gomoku",
    });
    expect(result.tipRev).toBe("rev-9");
    expect(result.files["index.html"]).toBeDefined();
    expect(result.files["app.js"]).toBeDefined();
    expect(
      fetchMock.mock.calls.every(c => !String(c[0]).includes("api.github.com"))
    ).toBe(true);
    vi.unstubAllGlobals();
  });

  it("errors clearly when manifest is missing (no Trees fallback)", async () => {
    const fetchMock = vi.fn(async () => new Response("Nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { fetchGithubProjectFromManifest } = await import("./githubProject");
    await expect(
      fetchGithubProjectFromManifest({ owner: "sampot", repo: "pg-x" })
    ).rejects.toThrow(/來源未就緒|sam-manifest/);
    expect(
      fetchMock.mock.calls.some(c => String(c[0]).includes("api.github.com"))
    ).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("fetchGithubSamTipRev", () => {
  it("returns manifest rev from raw", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      expect(url).toContain("/refs/heads/main/sam-manifest.json");
      expect(url).not.toMatch(/\/pg-gomoku\/main\/sam-manifest/);
      return new Response(
        JSON.stringify({
          version: 1,
          rev: "tip-rev",
          files: ["index.html"],
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { fetchGithubSamTipRev } = await import("./githubProject");
    await expect(
      fetchGithubSamTipRev({ owner: "sampot", repo: "pg-gomoku" })
    ).resolves.toBe("tip-rev");
    vi.unstubAllGlobals();
  });
});

describe("fetchGithubProject", () => {
  it("falls back to Trees when sam-manifest.json is missing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/sam-manifest.json")) {
        return new Response("missing", { status: 404 });
      }
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
      repo: "legacy-demo",
    });
    expect(result.tipRev).toBe("tipsha123");
    expect(result.files["index.html"]).toBeDefined();
    vi.unstubAllGlobals();
  });
});
