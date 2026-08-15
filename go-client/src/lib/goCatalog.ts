/**
 * Embedded SAM catalog for go `/s/<id>` resolve + same-kind swap (DEC-050).
 * Same codegen authority as field `catalog:gen` → samCatalog.generated.ts.
 *
 * `unlisted` entries resolve on `/s/<id>` and prerender, but are omitted from
 * home recommendations and「下一個」swap pools.
 */

import {
  GENERATED_SAM_CATALOG,
  type GeneratedSamEntry,
  type GeneratedSamEntryStatus,
  type GeneratedSamKind,
  type GeneratedSamProtocol,
} from "@data/samCatalog.generated";

export type GoCatalogEntry = Pick<
  GeneratedSamEntry,
  | "id"
  | "title"
  | "kind"
  | "series"
  | "source"
  | "blurb"
  | "status"
  | "protocols"
>;

/**
 * 分類（catalog `series`）→ 顯示用 icon。go 無 icon 相依庫，用 emoji 當分類
 * 標記，輕量且符合小品原創風格。未知分類退回預設遊戲 icon。
 */
const GO_SERIES_ICON: Record<string, string> = {
  精緻可玩: "🎯",
  街機: "🕹️",
  懷舊: "📺",
  機台: "🎰",
  桌遊: "🃏",
};

export function seriesIcon(series: string | undefined | null): string {
  if (!series) return "🎮";
  return GO_SERIES_ICON[series] ?? "🎮";
}

export type GoSamKind = GeneratedSamKind;
export type GoEntryStatus = GeneratedSamEntryStatus;
export type GoProtocol = GeneratedSamProtocol;

/**
 * The hostable session protocol a go player can open for a catalog SAM
 * (GO-INVITE framework). go hosting needs a declared roster session protocol;
 * null when the SAM declares none (pure single-player / non-hostable).
 */
export type HostableProtocol = {
  protocolId: string;
  apiVersion: string;
  roles: string[];
  roleLimits?: Record<string, number>;
};

/**
 * Resolve the hostable protocol for a catalog entry. Picks the first declared
 * `protocols` entry (catalog authority); fallback to `gomoku.v1` for the
 * single legacy hardcoded carrier so existing flows keep working.
 */
export function hostableProtocolFor(
  entry: Pick<GoCatalogEntry, "id" | "protocols"> | undefined | null
): HostableProtocol | null {
  if (!entry) return null;
  const first = entry.protocols?.find(p => p.protocolId.trim());
  if (first) {
    const out: HostableProtocol = {
      protocolId: first.protocolId.trim(),
      apiVersion: first.apiVersion?.trim() || "1",
      roles: first.roles?.filter(Boolean) ?? [],
    };
    return out;
  }
  if (entry.id === "pg-gomoku") {
    return { protocolId: "gomoku.v1", apiVersion: "1", roles: ["host", "player"] };
  }
  return null;
}

/**
 * go 換片／首頁推薦只推這個 kind（§5.6／§5.7）。
 * 非 game 的 `/s/<id>` 仍可玩，但不露「下一個」／推薦。
 */
export const GO_RECOMMEND_KIND: GoSamKind = "game";

function toGoEntry(e: GeneratedSamEntry): GoCatalogEntry {
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    series: e.series,
    source: e.source,
    blurb: e.blurb,
    status: e.status ?? "listed",
    protocols: e.protocols,
  };
}

function isListed(e: Pick<GoCatalogEntry, "status">): boolean {
  return e.status === "listed";
}

/** All registered entries (listed + unlisted). */
export const GO_CATALOG: readonly GoCatalogEntry[] =
  GENERATED_SAM_CATALOG.map(toGoEntry);

/** Public browse／recommend pool only. */
export const GO_LISTED_CATALOG: readonly GoCatalogEntry[] =
  GO_CATALOG.filter(isListed);

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

/** Game-kind listed peers excluding current id (stable catalog order). */
export function sameKindPeers(
  catalogId: string
): readonly GoCatalogEntry[] {
  const cur = getGoCatalogEntry(catalogId);
  if (!cur || cur.kind !== GO_RECOMMEND_KIND) return [];
  return GO_LISTED_CATALOG.filter(
    e => e.kind === GO_RECOMMEND_KIND && e.id !== cur.id
  );
}

/**
 * Next listed game in stable order (wraps). Null if current is not game or no peers.
 * Unlisted current still advances among listed games (does not surface other unlisted).
 */
export function nextSameKind(catalogId: string): GoCatalogEntry | null {
  const cur = getGoCatalogEntry(catalogId);
  if (!cur || cur.kind !== GO_RECOMMEND_KIND) return null;
  const same = GO_LISTED_CATALOG.filter(e => e.kind === GO_RECOMMEND_KIND);
  if (same.length < 2) return null;
  const idx = same.findIndex(e => e.id === cur.id);
  // Unlisted／missing from listed pool → first listed game
  if (idx < 0) return same[0] ?? null;
  return same[(idx + 1) % same.length] ?? null;
}

/**
 * Up to `limit` random other **listed game** recommendations.
 * Non-game current → [].
 */
export function recommendSameKind(
  catalogId: string,
  limit = 3,
  rng: () => number = Math.random
): GoCatalogEntry[] {
  const peers = [...sameKindPeers(catalogId)];
  if (!peers.length || limit <= 0) return [];
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
 * Home `/` recommendations (DEC-050): up to `limit` **listed game** entries,
 * drawn uniformly at random from ALL listed games (not a fixed curated set),
 * so a reshuffle surfaces different titles each time.
 */
export function recommendHome(
  limit = 3,
  rng: () => number = Math.random
): GoCatalogEntry[] {
  if (limit <= 0) return [];
  const pool = shuffleInPlace(
    GO_LISTED_CATALOG.filter(e => e.kind === GO_RECOMMEND_KIND),
    rng
  );
  return pool.slice(0, Math.min(limit, pool.length));
}

/**
 * 搜尋小品：比對 id／title／blurb（不區分大小寫），回傳最多 limit 個 game。
 * 排序：精確 id > id 包含 > title 包含 > blurb 包含。
 * 含 listed 與 unlisted。
 */
export function searchGoCatalog(
  query: string,
  limit = 3
): GoCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q || limit <= 0) return [];

  const scored: { entry: GoCatalogEntry; score: number }[] = [];
  for (const entry of GO_CATALOG) {
    if (entry.kind !== GO_RECOMMEND_KIND) continue;
    const id = entry.id.toLowerCase();
    const title = entry.title.toLowerCase();
    const blurb = (entry.blurb || "").toLowerCase();
    let score = 0;
    if (id === q) score = 100;
    else if (id.includes(q)) score = 80;
    else if (title.includes(q)) score = 60;
    else if (blurb.includes(q)) score = 40;
    else continue;
    scored.push({ entry, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id)
  );
  return scored.slice(0, Math.min(limit, scored.length)).map(s => s.entry);
}

/** @deprecated Prefer {@link searchGoCatalog}; kept as a thin alias. */
export function searchGoCatalogById(
  query: string,
  limit = 3
): GoCatalogEntry[] {
  return searchGoCatalog(query, limit);
}
