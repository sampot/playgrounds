import { describe, expect, it } from "vitest";
import {
  SAM_PLAYGROUNDS_PICK_REPOS,
  isSampotCatalogSource,
  samCatalog,
  samOpenHref,
  samOpenSource,
  samPlaygroundsPicks,
} from "./samCatalog";

describe("samPlaygroundsPicks", () => {
  it("resolves curated repos in order from the live catalog", () => {
    const picks = samPlaygroundsPicks();
    expect(picks.map(p => p.repo)).toEqual([...SAM_PLAYGROUNDS_PICK_REPOS]);
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(samCatalog.some(e => e.repo === pick.repo)).toBe(true);
    }
  });

  it("skips unknown repos", () => {
    expect(
      samPlaygroundsPicks(samCatalog, [
        "pg-breakout",
        "pg-nope",
        "pg-hashlab",
      ]).map(p => p.repo)
    ).toEqual(["pg-breakout", "pg-hashlab"]);
  });
});

describe("sam open helpers", () => {
  it("builds open source and same-origin field href", () => {
    expect(samOpenSource("pg-breakout")).toBe("sampot/pg-breakout");
    expect(samOpenHref({ repo: "pg-breakout", title: "打磚塊" })).toBe(
      "/?open=sampot%2Fpg-breakout&name=%E6%89%93%E7%A3%9A%E5%A1%8A"
    );
  });
});

describe("isSampotCatalogSource", () => {
  it("matches sampot owner forms", () => {
    expect(isSampotCatalogSource("sampot/pg-breakout")).toBe(true);
    expect(isSampotCatalogSource("https://github.com/sampot/pg-breakout")).toBe(
      true
    );
    expect(isSampotCatalogSource("playgrounds-agent-starter")).toBe(false);
    expect(isSampotCatalogSource(null)).toBe(false);
  });
});
