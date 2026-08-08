/**
 * Embedded SAM catalog for go `/s/<id>` resolve + same-kind swap (DEC-050).
 * Same codegen authority as field `catalog:gen` → samCatalog.generated.ts.
 */

import {
  GENERATED_SAM_CATALOG,
  GENERATED_SAM_PLAYGROUNDS_PICK_IDS,
  type GeneratedSamEntry,
  type GeneratedSamKind,
} from "@data/samCatalog.generated";

export type GoCatalogEntry = Pick<
  GeneratedSamEntry,
  "id" | "title" | "kind" | "source" | "blurb"
>;

export type GoSamKind = GeneratedSamKind;

/**
 * go 換片／首頁推薦只推這個 kind（§5.6／§5.7）。
 * 非 game 的 `/s/<id>` 仍可玩，但不露「下一個」／推薦。
 */
export const GO_RECOMMEND_KIND: GoSamKind = "game";

/** Build-time embedded catalog (published entries only). */
export const GO_CATALOG: readonly GoCatalogEntry[] = GENERATED_SAM_CATALOG.map(
  e => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    source: e.source,
    blurb: e.blurb,
  })
);

function normalizeSource(source: string): string {
  let s = source.trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  const gh = lower.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/#?]+)\/([^/#?]+)/i
  );
  if (gh) {
    return `${gh[1]}/${gh[2].replace(/\.git$/i, "")}`.toLowerCase();
  }
  const gl = lower.match(
    /^(?:https?:\/\/)?(?:www\.)?gitlab\.com\/([^/#?]+\/[^/#?]+)/i
  );
  if (gl) {
    return gl[1].replace(/\.git$/i, "").toLowerCase();
  }
  if (s.includes("/") && !s.includes("://")) {
    return s.replace(/\.git$/i, "").toLowerCase();
  }
  return s.replace(/\/+$/, "").toLowerCase();
}

export function getGoCatalogEntry(id: string): GoCatalogEntry | undefined {
  const key = id.trim();
  if (!key) return undefined;
  return GO_CATALOG.find(e => e.id === key);
}

export function findGoCatalogBySource(
  source: string
): GoCatalogEntry | undefined {
  const want = normalizeSource(source);
  if (!want) return undefined;
  for (const e of GO_CATALOG) {
    if (normalizeSource(e.source) === want) return e;
    if (e.id.toLowerCase() === want) return e;
    if (`sampot/${e.id}`.toLowerCase() === want) return e;
  }
  return undefined;
}

/** Game-kind peers excluding current id (stable catalog order). Empty if not game. */
export function sameKindPeers(
  catalogId: string
): readonly GoCatalogEntry[] {
  const cur = getGoCatalogEntry(catalogId);
  if (!cur || cur.kind !== GO_RECOMMEND_KIND) return [];
  return GO_CATALOG.filter(
    e => e.kind === GO_RECOMMEND_KIND && e.id !== cur.id
  );
}

/**
 * Next game in stable order (wraps). Null if current is not game or no peers.
 */
export function nextSameKind(catalogId: string): GoCatalogEntry | null {
  const cur = getGoCatalogEntry(catalogId);
  if (!cur || cur.kind !== GO_RECOMMEND_KIND) return null;
  const same = GO_CATALOG.filter(e => e.kind === GO_RECOMMEND_KIND);
  if (same.length < 2) return null;
  const idx = same.findIndex(e => e.id === cur.id);
  if (idx < 0) return null;
  return same[(idx + 1) % same.length] ?? null;
}

/**
 * Up to `limit` random other **game** recommendations (never cross kind; never pad).
 * Non-game current → [].
 */
export function recommendSameKind(
  catalogId: string,
  limit = 3,
  rng: () => number = Math.random
): GoCatalogEntry[] {
  const peers = [...sameKindPeers(catalogId)];
  if (!peers.length || limit <= 0) return [];
  // Fisher–Yates partial shuffle
  for (let i = peers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = peers[i]!;
    peers[i] = peers[j]!;
    peers[j] = tmp;
  }
  return peers.slice(0, Math.min(limit, peers.length));
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Home `/` recommendations (DEC-050): up to `limit` **game** entries.
 * Prefer field picks (shuffled, games only), then pad from other games.
 */
export function recommendHome(
  limit = 3,
  rng: () => number = Math.random
): GoCatalogEntry[] {
  if (limit <= 0) return [];
  const byId = new Map(GO_CATALOG.map(e => [e.id, e]));
  const picked: GoCatalogEntry[] = [];
  const seen = new Set<string>();

  const pickPool = shuffleInPlace(
    GENERATED_SAM_PLAYGROUNDS_PICK_IDS.map(id => byId.get(id)).filter(
      (e): e is GoCatalogEntry =>
        e != null && e.kind === GO_RECOMMEND_KIND
    ),
    rng
  );
  for (const e of pickPool) {
    if (picked.length >= limit) break;
    picked.push(e);
    seen.add(e.id);
  }

  if (picked.length < limit) {
    const rest = shuffleInPlace(
      GO_CATALOG.filter(
        e => e.kind === GO_RECOMMEND_KIND && !seen.has(e.id)
      ),
      rng
    );
    for (const e of rest) {
      if (picked.length >= limit) break;
      picked.push(e);
    }
  }

  return picked;
}
