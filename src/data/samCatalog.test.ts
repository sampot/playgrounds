import { describe, expect, it } from "vitest";
import {
  SAM_PLAYGROUNDS_PICK_REPOS,
  isSampotCatalogSource,
  samCatalog,
  samEntryOpenSource,
  samOpenHref,
  samPlaygroundsPicks,
  samSourceHref,
} from "./samCatalog";

describe("samPlaygroundsPicks", () => {
  it("resolves curated ids in order from the live catalog", () => {
    const picks = samPlaygroundsPicks();
    expect(picks.map(p => p.id)).toEqual([...SAM_PLAYGROUNDS_PICK_REPOS]);
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(samCatalog.some(e => e.id === pick.id)).toBe(true);
    }
  });

  it("skips unknown ids", () => {
    expect(
      samPlaygroundsPicks(samCatalog, [
        "pg-breakout",
        "pg-nope",
        "pg-hashlab",
      ]).map(p => p.id)
    ).toEqual(["pg-breakout", "pg-hashlab"]);
  });
});

describe("sam open helpers", () => {
  it("builds open source and same-origin field href from entry.source", () => {
    const entry = samCatalog.find(e => e.id === "pg-breakout");
    expect(entry).toBeTruthy();
    expect(samEntryOpenSource(entry!)).toBe("sampot/pg-breakout");
    expect(samOpenHref(entry!)).toBe(
      "/?open=sampot%2Fpg-breakout&name=%E6%89%93%E7%A3%9A%E5%A1%8A"
    );
  });

  it("supports non-sampot owner/repo and full URLs", () => {
    expect(
      samEntryOpenSource({ source: "acme/cool-sam" })
    ).toBe("acme/cool-sam");
    expect(
      samSourceHref("acme/cool-sam")
    ).toBe("https://github.com/acme/cool-sam");
    expect(
      samSourceHref("https://gitlab.com/acme/cool-sam")
    ).toBe("https://gitlab.com/acme/cool-sam");
    expect(samOpenHref({ title: "Cool", source: "acme/cool-sam" })).toBe(
      "/?open=acme%2Fcool-sam&name=Cool"
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

describe("generated catalog smoke", () => {
  it("has unique ids and steward source", () => {
    const ids = samCatalog.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const steward = samCatalog.find(e => e.id === "pg-steward");
    expect(steward?.source).toBe("sampot/pg-steward");
  });
});
