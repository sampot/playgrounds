import { describe, expect, it } from "vitest";
import {
  buildSitemapXml,
  listedCatalogIds,
} from "../../scripts/generate-sitemap.mjs";

describe("go sitemap", () => {
  it("lists only listed catalog ids, sorted", () => {
    expect(
      listedCatalogIds([
        { id: "pg-zebra", status: "listed" },
        { id: "pg-hidden", status: "unlisted" },
        { id: "pg-alpha", status: "listed" },
        { id: "  ", status: "listed" },
        { id: "pg-alpha", status: "listed" },
      ])
    ).toEqual(["pg-alpha", "pg-zebra"]);
  });

  it("builds urlset with home, help, and /s/ paths", () => {
    const xml = buildSitemapXml("https://go.samkuo.me", ["pg-breakout"], {
      lastmod: "2026-08-15",
    });
    expect(xml).toContain("<loc>https://go.samkuo.me/</loc>");
    expect(xml).toContain("<loc>https://go.samkuo.me/help</loc>");
    expect(xml).toContain("<loc>https://go.samkuo.me/room</loc>");
    expect(xml).toContain("<loc>https://go.samkuo.me/s/pg-breakout</loc>");
    expect(xml).toContain("<lastmod>2026-08-15</lastmod>");
    expect(xml).not.toContain("/i/");
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it("omits lastmod when not provided", () => {
    const xml = buildSitemapXml("https://go.samkuo.me", ["pg-breakout"]);
    expect(xml).not.toContain("<lastmod>");
  });

  it("encodes catalog ids in loc", () => {
    const xml = buildSitemapXml("https://go.samkuo.me", ["a/b"]);
    expect(xml).toContain("<loc>https://go.samkuo.me/s/a%2Fb</loc>");
  });
});
