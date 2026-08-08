import { describe, expect, it } from "vitest";
import {
  GO_CATALOG,
  getGoCatalogEntry,
  nextSameKind,
  recommendHome,
  recommendSameKind,
  sameKindPeers,
} from "./goCatalog";
import { GENERATED_SAM_PLAYGROUNDS_PICK_IDS } from "@data/samCatalog.generated";

describe("goCatalog same-kind swap", () => {
  it("embeds published catalog with kind", () => {
    expect(GO_CATALOG.length).toBeGreaterThan(10);
    const breakout = getGoCatalogEntry("pg-breakout");
    expect(breakout?.kind).toBe("game");
    expect(breakout?.source).toBeTruthy();
  });

  it("next stays in the same kind", () => {
    const cur = getGoCatalogEntry("pg-breakout");
    expect(cur).toBeTruthy();
    const next = nextSameKind("pg-breakout");
    expect(next).toBeTruthy();
    expect(next!.kind).toBe(cur!.kind);
    expect(next!.id).not.toBe("pg-breakout");
  });

  it("recommend never crosses kind and respects limit", () => {
    const cur = getGoCatalogEntry("pg-breakout")!;
    const peers = sameKindPeers("pg-breakout");
    expect(peers.every(p => p.kind === cur.kind)).toBe(true);

    let i = 0;
    const rng = () => {
      // Deterministic-ish shuffle seed
      i += 0.17;
      return i % 1;
    };
    const rec = recommendSameKind("pg-breakout", 3, rng);
    expect(rec.length).toBeLessThanOrEqual(3);
    expect(rec.length).toBe(Math.min(3, peers.length));
    expect(rec.every(r => r.kind === "game")).toBe(true);
    expect(rec.every(r => r.id !== "pg-breakout")).toBe(true);
  });

  it("does not pad recommendations with other kinds", () => {
    // Pick a kind that may have few entries — still never mix.
    const tool = GO_CATALOG.find(e => e.kind === "tool");
    expect(tool).toBeTruthy();
    const rec = recommendSameKind(tool!.id, 3);
    expect(rec.every(r => r.kind === "tool")).toBe(true);
  });
});

describe("recommendHome", () => {
  it("returns up to 3 entries preferring picks", () => {
    let i = 0;
    const rng = () => {
      i += 0.13;
      return i % 1;
    };
    const rec = recommendHome(3, rng);
    expect(rec.length).toBe(3);
    expect(new Set(rec.map(r => r.id)).size).toBe(3);
    // With enough picks, all three should come from the picks list.
    if (GENERATED_SAM_PLAYGROUNDS_PICK_IDS.length >= 3) {
      expect(
        rec.every(r => GENERATED_SAM_PLAYGROUNDS_PICK_IDS.includes(r.id))
      ).toBe(true);
    }
  });

  it("may cross kind on the home surface", () => {
    const rec = recommendHome(3, () => 0.5);
    expect(rec.length).toBeGreaterThan(0);
    // Not a hard requirement that kinds differ — only that cross-kind is allowed.
    expect(rec.every(r => GO_CATALOG.some(e => e.id === r.id))).toBe(true);
  });
});
