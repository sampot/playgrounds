import { describe, expect, it } from "vitest";
import {
  GO_CATALOG,
  GO_LISTED_CATALOG,
  GO_RECOMMEND_KIND,
  getGoCatalogEntry,
  nextSameKind,
  recommendHome,
  recommendSameKind,
  sameKindPeers,
  searchGoCatalog,
  searchGoCatalogById,
  seriesIcon,
} from "./goCatalog";

describe("goCatalog game-kind swap", () => {
  it("embeds published catalog with kind", () => {
    expect(GO_CATALOG.length).toBeGreaterThan(10);
    expect(GO_LISTED_CATALOG.length).toBeLessThanOrEqual(GO_CATALOG.length);
    expect(GO_LISTED_CATALOG.every(e => e.status === "listed")).toBe(true);
    const breakout = getGoCatalogEntry("pg-breakout");
    expect(breakout?.kind).toBe("game");
    expect(breakout?.status).toBe("listed");
    expect(breakout?.source).toBeTruthy();
    expect(GO_RECOMMEND_KIND).toBe("game");
  });

  it("embeds a static cover path for every game", () => {
    const games = GO_CATALOG.filter(entry => entry.kind === "game");
    expect(games.length).toBeGreaterThan(0);
    expect(
      games.every(entry => entry.cover === `/covers/${entry.id}.png`)
    ).toBe(true);
  });

  it("home and swap pools never include unlisted", () => {
    expect(recommendHome(5, () => 0.2).every(e => e.status === "listed")).toBe(
      true
    );
    expect(
      sameKindPeers("pg-breakout").every(e => e.status === "listed")
    ).toBe(true);
  });

  it("next stays among games", () => {
    const cur = getGoCatalogEntry("pg-breakout");
    expect(cur).toBeTruthy();
    const next = nextSameKind("pg-breakout");
    expect(next).toBeTruthy();
    expect(next!.kind).toBe("game");
    expect(next!.id).not.toBe("pg-breakout");
  });

  it("recommend never crosses kind and respects limit", () => {
    const peers = sameKindPeers("pg-breakout");
    expect(peers.every(p => p.kind === "game")).toBe(true);

    let i = 0;
    const rng = () => {
      i += 0.17;
      return i % 1;
    };
    const rec = recommendSameKind("pg-breakout", 3, rng);
    expect(rec.length).toBeLessThanOrEqual(3);
    expect(rec.length).toBe(Math.min(3, peers.length));
    expect(rec.every(r => r.kind === "game")).toBe(true);
    expect(rec.every(r => r.id !== "pg-breakout")).toBe(true);
  });

  it("non-game current yields no swap peers", () => {
    const tool = GO_CATALOG.find(e => e.kind === "tool");
    expect(tool).toBeTruthy();
    expect(sameKindPeers(tool!.id)).toEqual([]);
    expect(nextSameKind(tool!.id)).toBeNull();
    expect(recommendSameKind(tool!.id, 3)).toEqual([]);
  });
});

describe("recommendHome", () => {
  it("returns up to 3 games drawn from all listed games", () => {
    let i = 0;
    const rng = () => {
      i += 0.13;
      return i % 1;
    };
    const rec = recommendHome(3, rng);
    expect(rec.length).toBe(3);
    expect(rec.every(r => r.kind === "game")).toBe(true);
    expect(new Set(rec.map(r => r.id)).size).toBe(3);
    // Every recommendation must be a listed game; a reshuffle can surface any
    // listed game, not just the curated field picks.
    expect(
      rec.every(r =>
        GO_CATALOG.some(e => e.id === r.id && e.kind === "game" && e.status === "listed")
      )
    ).toBe(true);
  });

  it("never recommends non-game kinds", () => {
    const rec = recommendHome(3, () => 0.5);
    expect(rec.length).toBeGreaterThan(0);
    expect(rec.every(r => r.kind === "game")).toBe(true);
  });
});

describe("seriesIcon", () => {
  it("maps known series to an emoji icon", () => {
    expect(seriesIcon("街機")).toBe("🕹️");
    expect(seriesIcon("桌遊")).toBe("🃏");
    expect(seriesIcon("懷舊")).toBe("📺");
  });

  it("falls back to default game icon for unknown or empty series", () => {
    expect(seriesIcon("")).toBe("🎮");
    expect(seriesIcon(undefined)).toBe("🎮");
    expect(seriesIcon("不存在的分類")).toBe("🎮");
  });

  it("game catalog entries carry a series used for icons", () => {
    const game = GO_LISTED_CATALOG.find(e => e.kind === "game");
    expect(game).toBeTruthy();
    expect(typeof game!.series).toBe("string");
    expect(seriesIcon(game!.series)).toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("searchGoCatalog", () => {
  it("is the canonical alias used by the home page", () => {
    expect(searchGoCatalog("打磚塊").map(e => e.id)).toEqual(
      searchGoCatalogById("打磚塊").map(e => e.id)
    );
  });
});

describe("searchGoCatalogById", () => {
  it("returns empty array for empty query", () => {
    const result = searchGoCatalogById("");
    expect(result).toEqual([]);
  });

  it("returns games matching partial id (case-insensitive)", () => {
    const result = searchGoCatalogById("break");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(r => r.kind === "game")).toBe(true);
    expect(result.every(r => r.id.toLowerCase().includes("break"))).toBe(true);
  });

  it("returns up to 3 games", () => {
    const result = searchGoCatalogById("a");
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("returns exact match when query matches id exactly", () => {
    const result = searchGoCatalogById("pg-breakout");
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("pg-breakout");
  });

  it("only returns game kind entries", () => {
    const result = searchGoCatalogById("pg");
    expect(result.every(r => r.kind === "game")).toBe(true);
  });

  it("includes unlisted games", () => {
    expect(searchGoCatalogById("pg-carrom").map(e => e.id)).toEqual([
      "pg-carrom",
    ]);
    expect(searchGoCatalogById("康樂球").some(r => r.id === "pg-carrom")).toBe(
      true
    );
    expect(
      searchGoCatalog("pg-", 50).some(r => r.status === "unlisted")
    ).toBe(true);
  });

  it("matches Chinese title and blurb, not only id", () => {
    const byTitle = searchGoCatalogById("打磚");
    expect(byTitle.some(r => r.id === "pg-breakout")).toBe(true);

    const byBlurb = searchGoCatalogById("擋板反彈");
    expect(byBlurb.some(r => r.id === "pg-breakout")).toBe(true);
  });

  it("prefers id hits over weaker title-only noise when both exist", () => {
    const result = searchGoCatalogById("pg-breakout");
    expect(result[0]?.id).toBe("pg-breakout");
  });
});
