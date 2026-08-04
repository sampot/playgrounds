import { describe, expect, it } from "vitest";
import type { ProjectMeta } from "./projectTypes";
import {
  emptyToolPrefs,
  matchToolGlob,
  pathMatchesToolGlobs,
  pickBestTool,
  rankToolsForPath,
  rememberToolForPath,
  scoreToolForPath,
  TEXT_TOOL_GLOBS,
} from "./toolMatch";

function meta(
  partial: Partial<ProjectMeta> & Pick<ProjectMeta, "id" | "name">
): ProjectMeta {
  return {
    entry: "index.html",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("matchToolGlob", () => {
  it("matches extension globs", () => {
    expect(matchToolGlob("docs/a.md", "*.md")).toBe(true);
    expect(matchToolGlob("a.MD", "*.md")).toBe(true);
    expect(matchToolGlob("a.txt", "*.md")).toBe(false);
  });

  it("matches basename star patterns", () => {
    expect(matchToolGlob("README.md", "README*")).toBe(true);
    expect(matchToolGlob("readme", "README*")).toBe(true);
    expect(matchToolGlob("Dockerfile", "Dockerfile")).toBe(true);
  });
});

describe("rankToolsForPath / pickBestTool", () => {
  const textTool = meta({
    id: "text-1",
    name: "文字工具",
    toolKinds: ["editor:text"],
    toolGlobs: [...TEXT_TOOL_GLOBS],
  });
  const other = meta({
    id: "other-1",
    name: "其他沙盒",
  });
  const csvTool = meta({
    id: "csv-1",
    name: "CSV 工具",
    toolKinds: ["editor:csv"],
    toolGlobs: ["*.csv"],
  });

  it("prefers glob match", () => {
    const ranked = rankToolsForPath([other, textTool, csvTool], "notes.md");
    expect(ranked[0]!.meta.id).toBe("text-1");
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(100);
  });

  it("prefers csv tool for csv", () => {
    const ranked = rankToolsForPath([textTool, csvTool], "data/a.csv");
    expect(ranked[0]!.meta.id).toBe("csv-1");
  });

  it("boosts remembered path", () => {
    const prefs = emptyToolPrefs();
    prefs.byPath["notes.md"] = "other-1";
    const ranked = rankToolsForPath([other, textTool], "notes.md", prefs);
    // text still wins via glob (100) vs path-only other (50)
    expect(ranked[0]!.meta.id).toBe("text-1");
    prefs.byPath["weird.bin"] = "other-1";
    const ranked2 = rankToolsForPath([other, textTool], "weird.bin", prefs);
    expect(ranked2[0]!.meta.id).toBe("other-1");
  });

  it("pickBestTool returns clear winner", () => {
    const best = pickBestTool([other, textTool], "a.md");
    expect(best?.meta.id).toBe("text-1");
  });

  it("pickBestTool returns null when ambiguous", () => {
    const twin = meta({
      id: "text-2",
      name: "另一文字",
      toolKinds: ["editor:text"],
      toolGlobs: ["*.md"],
    });
    const textMd = meta({
      id: "text-1",
      name: "文字工具",
      toolKinds: ["editor:text"],
      toolGlobs: ["*.md"],
    });
    expect(pickBestTool([textMd, twin], "a.md")).toBeNull();
  });

  it("pathMatchesToolGlobs", () => {
    expect(pathMatchesToolGlobs("x.md", TEXT_TOOL_GLOBS)).toBe(true);
    expect(pathMatchesToolGlobs("x.png", TEXT_TOOL_GLOBS)).toBe(false);
  });

  it("rememberToolForPath updates prefs", () => {
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    rememberToolForPath("tool-x", "docs/a.md", storage);
    const scored = scoreToolForPath(
      meta({ id: "tool-x", name: "T" }),
      "docs/a.md",
      JSON.parse(store["playgrounds-tool-prefs-v1"]!)
    );
    expect(scored.score).toBeGreaterThanOrEqual(50);
  });
});
