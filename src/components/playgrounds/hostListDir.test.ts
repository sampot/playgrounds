import { describe, expect, it } from "vitest";
import { listDirFromFileMap } from "./hostListDir";

describe("listDirFromFileMap", () => {
  const files = {
    "index.html": "",
    "functions.js": "",
    "lib/a.js": "",
    "lib/b.js": "",
    "assets/x.png": "",
    "ui/app.js": "",
  };

  it("lists depth-1 root: top files and dirs", () => {
    const r = listDirFromFileMap(files, { depth: 1 });
    expect(r.prefix).toBe("");
    expect(r.depth).toBe(1);
    expect(r.truncated).toBe(false);
    const paths = r.entries.map(e => e.path);
    expect(paths).toEqual([
      "assets",
      "lib",
      "ui",
      "functions.js",
      "index.html",
    ]);
    expect(r.entries.find(e => e.path === "lib")).toMatchObject({
      kind: "dir",
      truncatedChildren: true,
    });
    expect(r.entries.find(e => e.path === "index.html")).toMatchObject({
      kind: "file",
    });
  });

  it("lists depth-1 under prefix", () => {
    const r = listDirFromFileMap(files, { prefix: "lib", depth: 1 });
    expect(r.prefix).toBe("lib");
    expect(r.entries.map(e => e.path)).toEqual(["lib/a.js", "lib/b.js"]);
    expect(r.entries.every(e => e.kind === "file")).toBe(true);
  });

  it("includes nested paths at depth 2", () => {
    const r = listDirFromFileMap(files, { depth: 2 });
    const paths = r.entries.map(e => e.path);
    expect(paths).toContain("lib");
    expect(paths).toContain("lib/a.js");
    expect(paths).toContain("lib/b.js");
    expect(
      r.entries.find(e => e.path === "lib")?.truncatedChildren
    ).toBeFalsy();
  });

  it("includes empty dirs from extraDirs", () => {
    const r = listDirFromFileMap({ "index.html": "" }, { depth: 1 }, [
      "empty",
      "empty/nested",
    ]);
    expect(r.entries.map(e => e.path)).toEqual(["empty", "index.html"]);
    expect(r.entries.find(e => e.path === "empty")).toMatchObject({
      kind: "dir",
      truncatedChildren: true,
    });
  });

  it("respects maxEntries and truncated flag", () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 10; i++) many[`f${i}.js`] = "";
    const r = listDirFromFileMap(many, { depth: 1, maxEntries: 3 });
    expect(r.entries).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it("rejects path escape", () => {
    expect(() => listDirFromFileMap(files, { prefix: "../outside" })).toThrow(
      /路徑/
    );
  });

  it("rejects depth < 1", () => {
    expect(() => listDirFromFileMap(files, { depth: 0 })).toThrow(/depth/);
  });
});
