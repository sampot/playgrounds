import { describe, expect, it } from "vitest";
import {
  catalogCoverHref,
  coverExistsInDirs,
  coverPngExists,
  planCoverSync,
  resolveCatalogCover,
} from "../scripts/catalogCover.ts";

describe("catalogCoverHref", () => {
  it("builds site-relative /covers/<id>.png", () => {
    expect(catalogCoverHref("pg-breakout")).toBe("/covers/pg-breakout.png");
    expect(catalogCoverHref("  pg-tetris  ")).toBe("/covers/pg-tetris.png");
  });
});

describe("resolveCatalogCover", () => {
  it("returns href only when the static file exists", () => {
    const present = new Set(["pg-cityroam"]);
    expect(
      resolveCatalogCover("pg-cityroam", {
        coverFileExists: id => present.has(id),
      })
    ).toBe("/covers/pg-cityroam.png");
    expect(
      resolveCatalogCover("pg-breakout", {
        coverFileExists: id => present.has(id),
      })
    ).toBeUndefined();
  });

  it("ignores empty ids", () => {
    expect(
      resolveCatalogCover("  ", { coverFileExists: () => true })
    ).toBeUndefined();
  });
});

describe("coverExistsInDirs", () => {
  it("is false for empty id", () => {
    expect(coverExistsInDirs(["/tmp"], "")).toBe(false);
  });

  it("coverPngExists rejects empty", () => {
    expect(coverPngExists("/tmp", "")).toBe(false);
  });
});

describe("planCoverSync", () => {
  it("plans copies only when thumbnail.png exists under games root", () => {
    const files = new Set([
      "/games/pg-cityroam/thumbnail.png",
      "/games/pg-breakout/index.html",
    ]);
    const plan = planCoverSync({
      gamesRoot: "/games",
      catalogIds: ["pg-cityroam", "pg-breakout", "pg-missing"],
      destDirs: ["/out/go", "/out/public"],
      fileExists: p => files.has(p),
    });
    expect(plan).toEqual([
      {
        id: "pg-cityroam",
        from: "/games/pg-cityroam/thumbnail.png",
        to: ["/out/go/pg-cityroam.png", "/out/public/pg-cityroam.png"],
      },
    ]);
  });
});
