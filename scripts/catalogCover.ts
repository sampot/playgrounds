/**
 * Catalog card covers (PG-GO-CLIENT-PLAN §5.8 / PG-GAME-AGENT-GUIDE §2.4).
 * Authority for UI: committed static `/covers/<id>.png` (not YAML).
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const COVER_URL_PREFIX = "/covers/";
export const COVER_FILENAME = "thumbnail.png";

/** Site-relative href for a catalog id cover asset. */
export function catalogCoverHref(id: string): string {
  const clean = id.trim();
  if (!clean) return `${COVER_URL_PREFIX}.png`;
  return `${COVER_URL_PREFIX}${clean}.png`;
}

/**
 * Emit cover path only when the static PNG is present under a covers dir.
 * YAML must not invent covers without files.
 */
export function resolveCatalogCover(
  id: string,
  opts: { coverFileExists: (catalogId: string) => boolean }
): string | undefined {
  const clean = id.trim();
  if (!clean) return undefined;
  if (!opts.coverFileExists(clean)) return undefined;
  return catalogCoverHref(clean);
}

/** True if `<coversDir>/<id>.png` exists. */
export function coverPngExists(coversDir: string, id: string): boolean {
  const clean = id.trim();
  if (!clean || !coversDir) return false;
  return existsSync(join(coversDir, `${clean}.png`));
}

/** True if any of the covers dirs has `<id>.png`. */
export function coverExistsInDirs(
  coversDirs: readonly string[],
  id: string
): boolean {
  return coversDirs.some(dir => coverPngExists(dir, id));
}

export type CoverSyncCopy = {
  id: string;
  from: string;
  to: string[];
};

/**
 * For each catalog id, if `<gamesRoot>/<id>/thumbnail.png` exists, copy to
 * each destination covers directory as `<id>.png`.
 */
export function planCoverSync(opts: {
  gamesRoot: string;
  catalogIds: readonly string[];
  destDirs: readonly string[];
  fileExists?: (path: string) => boolean;
}): CoverSyncCopy[] {
  const exists = opts.fileExists ?? existsSync;
  const out: CoverSyncCopy[] = [];
  for (const id of opts.catalogIds) {
    const clean = id.trim();
    if (!clean) continue;
    const from = join(opts.gamesRoot, clean, COVER_FILENAME);
    if (!exists(from)) continue;
    out.push({
      id: clean,
      from,
      to: opts.destDirs.map(dir => join(dir, `${clean}.png`)),
    });
  }
  return out;
}

/** Apply planCoverSync copies (mkdir + copyFile). */
export function applyCoverSync(plan: readonly CoverSyncCopy[]): number {
  let n = 0;
  for (const row of plan) {
    for (const dest of row.to) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(row.from, dest);
      n += 1;
    }
  }
  return n;
}

/** List `<id>.png` stems already in a covers directory. */
export function listCoverIds(coversDir: string): string[] {
  if (!existsSync(coversDir)) return [];
  return readdirSync(coversDir)
    .filter(name => name.endsWith(".png"))
    .map(name => name.slice(0, -".png".length))
    .filter(Boolean)
    .sort();
}
