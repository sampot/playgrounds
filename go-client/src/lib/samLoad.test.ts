import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  parse: vi.fn(() => ({ owner: "sampot", repo: "pg-gomoku" })),
  tip: vi.fn(async () => "manifest-rev"),
  fromManifest: vi.fn(),
}));

vi.mock("@pg/githubProject", () => ({
  parseGithubUrl: fixtures.parse,
  fetchGithubSamTipRev: fixtures.tip,
  fetchGithubProjectFromManifest: fixtures.fromManifest,
}));

describe("fetchSamTipRev", () => {
  it("delegates tip check to fetchGithubSamTipRev (sam-manifest rev)", async () => {
    const { fetchSamTipRev } = await import("./samLoad");
    await expect(fetchSamTipRev("sampot/pg-gomoku")).resolves.toBe(
      "manifest-rev"
    );
    expect(fixtures.parse).toHaveBeenCalledWith("sampot/pg-gomoku");
    expect(fixtures.tip).toHaveBeenCalledWith(
      { owner: "sampot", repo: "pg-gomoku" },
      expect.objectContaining({})
    );
    expect(fixtures.fromManifest).not.toHaveBeenCalled();
  });
});
