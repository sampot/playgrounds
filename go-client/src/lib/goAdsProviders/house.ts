/**
 * Phase 1 house ads: promote one other listed `kind: game` (DEC-054 / PG-GO-ADS-PLAN).
 */

import {
  GO_LISTED_CATALOG,
  GO_RECOMMEND_KIND,
  type GoCatalogEntry,
} from "../goCatalog";

/**
 * Pick a single listed game for the house ad slot.
 * @param excludeId — current `/s/<id>` (or null on home); never returned
 * @param rng — injectable for tests (default Math.random)
 */
export function pickHouseGame(
  excludeId?: string | null,
  rng: () => number = Math.random
): GoCatalogEntry | null {
  const exclude = excludeId?.trim() || "";
  const pool = GO_LISTED_CATALOG.filter(
    e => e.kind === GO_RECOMMEND_KIND && e.id !== exclude
  );
  if (!pool.length) return null;
  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx] ?? null;
}
