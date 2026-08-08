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
} from "./goCatalog";
import { GENERATED_SAM_PLAYGROUNDS_PICK_IDS } from "@data/samCatalog.generated";

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
  it("returns up to 3 games preferring picks", () => {
    let i = 0;
    const rng = () => {
      i += 0.13;
      return i % 1;
    };
    const rec = recommendHome(3, rng);
    expect(rec.length).toBe(3);
    expect(rec.every(r => r.kind === "game")).toBe(true);
    expect(new Set(rec.map(r => r.id)).size).toBe(3);
    const gamePicks = GENERATED_SAM_PLAYGROUNDS_PICK_IDS.filter(id =>
      GO_CATALOG.some(e => e.id === id && e.kind === "game")
    );
    if (gamePicks.length >= 3) {
      expect(rec.every(r => gamePicks.includes(r.id))).toBe(true);
    }
  });

  it("never recommends non-game kinds", () => {
    const rec = recommendHome(3, () => 0.5);
    expect(rec.length).toBeGreaterThan(0);
    expect(rec.every(r => r.kind === "game")).toBe(true);
  });
});
