/**
 * SAM catalog API for `/sam/` and shell picks.
 * Authority: `catalog/entries/*.yaml` (see `npm run catalog:gen`).
 */

import {
  buildCanonicalOpenUrl,
  fieldShareOrigin,
  goSamShareHref,
  PLAYGROUNDS_GO_ORIGIN,
} from "../utils/playgroundsUrls";
import {
  GENERATED_SAM_CATALOG,
  GENERATED_SAM_KIND_LABEL,
  GENERATED_SAM_KIND_ORDER,
  GENERATED_SAM_PAGE,
  GENERATED_SAM_PLAYGROUNDS_PICK_IDS,
  GENERATED_SAM_SERIES_ORDER,
  type GeneratedSamEntry,
  type GeneratedSamEntryStatus,
  type GeneratedSamKind,
  type GeneratedSamProtocol,
} from "./samCatalog.generated";

export type SamKind = GeneratedSamKind;

/** listed = public /sam/ browse; unlisted = registered only (resolve／go／JSON). */
export type SamEntryStatus = GeneratedSamEntryStatus;

/** Catalog-declared session protocol support (DEC-046 Phase 3). */
export type SamCatalogProtocol = GeneratedSamProtocol;

/** Shelf / genre within a kind (e.g. arcade under games, or a tool family). */
export type SamSeries = string;

export interface SamEntry {
  /** Stable catalog id (= YAML filename stem). */
  id: string;
  /**
   * Alias of `id` for older call sites / icons keyed by repo name.
   * Prefer `id` in new code.
   */
  repo: string;
  /** Display name shown in UI / `?name=`. */
  title: string;
  kind: SamKind;
  series: SamSeries;
  /** One-line catalog blurb. */
  blurb: string;
  /**
   * Open source: `owner/repo` or full GitHub／GitLab URL.
   * Used for `?open=` and repository links.
   */
  source: string;
  /**
   * Visibility: `listed` on /sam/; `unlisted` in catalog JSON／resolve only
   * (go `/s/<id>`, easter eggs, pre-release). Draft YAML never reaches here.
   */
  status: SamEntryStatus;
  license?: string;
  /** Optional session protocols this SAM can join (catalog declaration). */
  protocols?: readonly SamCatalogProtocol[];
}

/**
 * Invite / Host session protocol spec for catalog matching (DEC-023／046).
 * Enough to gate compatibility; richer shapes may be attached by callers.
 */
export type SessionProtocolSpec = {
  protocolId: string;
  apiVersion: string;
  /** If set, entry must declare this role (or omit `roles` on the decl). */
  role?: string;
  /** Optional hints — used to order / pin candidates, not to bypass protocol match. */
  catalogId?: string;
  source?: string;
};

function toSamEntry(e: GeneratedSamEntry): SamEntry {
  return {
    id: e.id,
    repo: e.id,
    title: e.title,
    kind: e.kind,
    series: e.series,
    blurb: e.blurb,
    source: e.source,
    status: e.status ?? "listed",
    ...(e.license ? { license: e.license } : {}),
    ...(e.protocols?.length ? { protocols: e.protocols } : {}),
  };
}

function isListed(e: Pick<SamEntry, "status">): boolean {
  return e.status === "listed";
}

/** Tab order on `/sam/`. */
export const SAM_KIND_ORDER: SamKind[] = [...GENERATED_SAM_KIND_ORDER];

export const SAM_KIND_LABEL: Record<SamKind, string> = {
  ...GENERATED_SAM_KIND_LABEL,
};

export const SAM_GAME_SERIES_ORDER: string[] = [
  ...GENERATED_SAM_SERIES_ORDER.game,
];
export const SAM_TOOL_SERIES_ORDER: string[] = [
  ...GENERATED_SAM_SERIES_ORDER.tool,
];
export const SAM_TOY_SERIES_ORDER: string[] = [
  ...GENERATED_SAM_SERIES_ORDER.toy,
];
export const SAM_MEDIA_SERIES_ORDER: string[] = [
  ...GENERATED_SAM_SERIES_ORDER.media,
];
export const SAM_AGENT_SERIES_ORDER: string[] = [
  ...GENERATED_SAM_SERIES_ORDER.agent,
];

/**
 * All registered entries (`listed` + `unlisted`; draft omitted at gen).
 * Prefer {@link samCatalog} for public browse UI.
 */
export const samCatalogRegistered: SamEntry[] =
  GENERATED_SAM_CATALOG.map(toSamEntry);

/** Public browse entries only (`status: listed`). Used by `/sam/`. */
export const samCatalog: SamEntry[] = samCatalogRegistered.filter(isListed);

/** Hero / SEO / footnote copy for `/sam/`. */
export const samCatalogPage = GENERATED_SAM_PAGE;

/** Homologous static catalog URL (DEC-046 / PG-CATALOG-QUERY-PLAN). */
export const SAM_CATALOG_JSON_PATH = "/catalog/v1.json" as const;

/**
 * Normalize catalog `source` for equality checks (trim; lowercase host in URLs;
 * strip trailing slash; collapse github.com/owner/repo → owner/repo).
 */
export function normalizeCatalogSource(source: string): string {
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

/** Public listed entries (default for /sam/ browse helpers). */
export function listCatalogEntries(
  catalog: readonly SamEntry[] = samCatalog
): readonly SamEntry[] {
  return catalog;
}

/** Registered entries including unlisted (machine resolve／go). */
export function listRegisteredCatalogEntries(
  catalog: readonly SamEntry[] = samCatalogRegistered
): readonly SamEntry[] {
  return catalog;
}

/** Lookup by stable catalog id (includes unlisted). */
export function getCatalogEntry(
  id: string,
  catalog: readonly SamEntry[] = samCatalogRegistered
): SamEntry | undefined {
  const key = id.trim();
  if (!key) return undefined;
  return catalog.find(e => e.id === key);
}

/**
 * Find entry whose `source` matches (after {@link normalizeCatalogSource}).
 * Also matches when `source` equals catalog `id` or `sampot/<id>`.
 * Includes unlisted.
 */
export function findCatalogBySource(
  source: string,
  catalog: readonly SamEntry[] = samCatalogRegistered
): SamEntry | undefined {
  const want = normalizeCatalogSource(source);
  if (!want) return undefined;
  for (const e of catalog) {
    if (normalizeCatalogSource(e.source) === want) return e;
    if (e.id.toLowerCase() === want) return e;
    if (normalizeCatalogSource(`sampot/${e.id}`) === want) return e;
  }
  return undefined;
}

/** Whether a catalog protocol decl satisfies an invite / session spec. */
export function catalogProtocolMatches(
  decl: SamCatalogProtocol,
  spec: Pick<SessionProtocolSpec, "protocolId" | "apiVersion" | "role">
): boolean {
  if (decl.protocolId !== spec.protocolId) return false;
  if (decl.apiVersion !== spec.apiVersion) return false;
  if (spec.role) {
    // No roles listed ⇒ any role for this protocolId@apiVersion.
    if (decl.roles && decl.roles.length > 0 && !decl.roles.includes(spec.role)) {
      return false;
    }
  }
  return true;
}

/** True if the entry declares at least one matching protocol. */
export function entrySupportsProtocol(
  entry: Pick<SamEntry, "protocols">,
  spec: Pick<SessionProtocolSpec, "protocolId" | "apiVersion" | "role">
): boolean {
  const list = entry.protocols;
  if (!list?.length) return false;
  return list.some(p => catalogProtocolMatches(p, spec));
}

/**
 * Catalog entries that declare compatibility with `spec`.
 * Entries without `protocols` are never returned (do not pretend support).
 * Optional `catalogId`／`source` hints only reorder matches (hints first).
 */
export function matchCatalogForProtocol(
  spec: SessionProtocolSpec,
  catalog: readonly SamEntry[] = samCatalogRegistered
): SamEntry[] {
  const protocolId = spec.protocolId?.trim();
  const apiVersion = spec.apiVersion?.trim();
  if (!protocolId || !apiVersion) return [];

  const gate = { protocolId, apiVersion, role: spec.role?.trim() || undefined };
  const matched = catalog.filter(e => entrySupportsProtocol(e, gate));
  if (matched.length <= 1) return matched;

  const hintId = spec.catalogId?.trim();
  const hintSource = spec.source?.trim();
  const rank = (e: SamEntry): number => {
    if (hintId && e.id === hintId) return 0;
    if (hintSource && normalizeCatalogSource(e.source) === normalizeCatalogSource(hintSource)) {
      return 1;
    }
    if (hintSource && e.id.toLowerCase() === hintSource.toLowerCase()) return 1;
    return 2;
  };
  return [...matched].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}

/**
 * Resolve catalog candidates for a session invite (query only — no install).
 * Prefers protocol matches; if none and hints are present, does **not** fall back
 * to id/source-only (protocol gate stays honest). Use get/find helpers for those.
 */
export function resolveCatalogInviteCandidates(
  spec: SessionProtocolSpec,
  catalog: readonly SamEntry[] = samCatalogRegistered
): SamEntry[] {
  return matchCatalogForProtocol(spec, catalog);
}

/** Installed local SAM probe row (head-derived protocols; DEC-046 Phase 4). */
export type InstalledSamProbe = {
  sandboxId: string;
  name: string;
  source?: string;
  protocols?: readonly SamCatalogProtocol[];
};

/**
 * Invite resolution candidate: catalog virtual and/or already-installed local.
 * Query only — does not install or join a seat.
 */
export type InviteCandidate = {
  /** Set when a local sandbox already matches. */
  sandboxId?: string;
  /** Catalog id when known (listed or linked via source). */
  catalogId?: string;
  title: string;
  source?: string;
  origin: "catalog" | "installed" | "both";
};

/** Installed probes that declare compatibility with `spec`. */
export function matchInstalledForProtocol(
  spec: SessionProtocolSpec,
  installed: readonly InstalledSamProbe[]
): InstalledSamProbe[] {
  const protocolId = spec.protocolId?.trim();
  const apiVersion = spec.apiVersion?.trim();
  if (!protocolId || !apiVersion) return [];
  const gate = { protocolId, apiVersion, role: spec.role?.trim() || undefined };
  return installed.filter(p => entrySupportsProtocol(p, gate));
}

function installedDedupKey(p: InstalledSamProbe): string {
  if (p.source?.trim()) return `src:${normalizeCatalogSource(p.source)}`;
  return `id:${p.sandboxId}`;
}

function catalogCoveredByInstalled(
  entry: SamEntry,
  installed: readonly InstalledSamProbe[],
  catalog: readonly SamEntry[]
): InstalledSamProbe | undefined {
  for (const p of installed) {
    if (!p.source?.trim()) continue;
    const linked = findCatalogBySource(p.source, catalog);
    if (linked?.id === entry.id) return p;
    if (normalizeCatalogSource(p.source) === normalizeCatalogSource(entry.source)) {
      return p;
    }
  }
  return undefined;
}

/**
 * Merge catalog + installed protocol matches for invite resolution.
 * Installed／both first (ready to seat); catalog-only next (lazy install).
 * Hints only reorder within the same readiness band.
 */
export function resolveInviteCandidates(
  spec: SessionProtocolSpec,
  options?: {
    catalog?: readonly SamEntry[];
    installed?: readonly InstalledSamProbe[];
  }
): InviteCandidate[] {
  const catalog = options?.catalog ?? samCatalogRegistered;
  const installedHits = matchInstalledForProtocol(spec, options?.installed ?? []);
  const catalogHits = matchCatalogForProtocol(spec, catalog);

  const out: InviteCandidate[] = [];
  const coveredCatalogIds = new Set<string>();
  const usedInstalled = new Set<string>();

  for (const p of installedHits) {
    usedInstalled.add(installedDedupKey(p));
    const linked = p.source?.trim()
      ? findCatalogBySource(p.source, catalog)
      : undefined;
    if (linked) coveredCatalogIds.add(linked.id);
    out.push({
      sandboxId: p.sandboxId,
      ...(linked ? { catalogId: linked.id } : {}),
      title: linked?.title ?? p.name,
      source: p.source?.trim() || linked?.source,
      origin: linked ? "both" : "installed",
    });
  }

  for (const e of catalogHits) {
    if (coveredCatalogIds.has(e.id)) continue;
    const overlap = catalogCoveredByInstalled(e, installedHits, catalog);
    if (overlap && usedInstalled.has(installedDedupKey(overlap))) continue;
    out.push({
      catalogId: e.id,
      title: e.title,
      source: e.source,
      origin: "catalog",
    });
  }

  const hintId = spec.catalogId?.trim();
  const hintSource = spec.source?.trim();
  const readiness = (c: InviteCandidate): number =>
    c.origin === "catalog" ? 1 : 0;
  const hintRank = (c: InviteCandidate): number => {
    if (hintId && c.catalogId === hintId) return 0;
    if (
      hintSource &&
      c.source &&
      normalizeCatalogSource(c.source) === normalizeCatalogSource(hintSource)
    ) {
      return 1;
    }
    if (hintSource && c.catalogId?.toLowerCase() === hintSource.toLowerCase()) {
      return 1;
    }
    return 2;
  };
  return out.sort(
    (a, b) =>
      readiness(a) - readiness(b) ||
      hintRank(a) - hintRank(b) ||
      (a.catalogId ?? a.sandboxId ?? "").localeCompare(
        b.catalogId ?? b.sandboxId ?? ""
      )
  );
}

/**
 * Normalize catalog `source` for `?open=` (trim; leave URLs／owner/repo as-is).
 */
export function samEntryOpenSource(
  entry: Pick<SamEntry, "source"> | string
): string {
  if (typeof entry === "string") return entry.trim();
  return entry.source.trim();
}

/**
 * @deprecated Prefer `samEntryOpenSource(entry)`. Kept for call sites that
 * still pass a repo id and assume sampot/.
 */
export function samOpenSource(repoOrSource: string): string {
  const s = repoOrSource.trim();
  if (
    s.includes("://") ||
    s.includes("github.com/") ||
    s.includes("gitlab.com/") ||
    s.includes("/")
  ) {
    return s;
  }
  return `sampot/${s}`;
}

/**
 * One-click open into the **current field** (same origin).
 * Catalog lives on the field host (`/sam/`); opens land on `/?open=…`.
 * Developer／edit chrome（no `view=canvas`）.
 */
export function samOpenHref(
  entry: Pick<SamEntry, "title" | "source">
): string {
  const params = new URLSearchParams({
    open: samEntryOpenSource(entry),
    name: entry.title,
  });
  return `/?${params.toString()}`;
}

/** Absolute open URL on the default field (`play.samkuo.me`). */
export function samOpenCanonicalHref(
  entry: Pick<SamEntry, "title" | "source">
): string {
  return buildCanonicalOpenUrl(samEntryOpenSource(entry), {
    name: entry.title,
  });
}

/**
 * Absolute URL for sharing a catalog entry to casual recipients (DEC-050).
 * Lands on pure-play go `/s/<id>` — not field `?open=` / `view=canvas`.
 */
export function samOpenShareHref(
  entry: Pick<SamEntry, "id">,
  goOrigin: string = PLAYGROUNDS_GO_ORIGIN
): string {
  return goSamShareHref(entry.id, goOrigin);
}

/** Absolute `/sam/` browse URL for the current filter (shareable). */
export function catalogBrowseShareHref(
  filter: CatalogHumanFilter,
  origin: string = fieldShareOrigin()
): string {
  const base = origin.replace(/\/$/, "");
  const qs = catalogUrlSearchParams(filter).toString();
  return `${base}/sam/${qs ? `?${qs}` : ""}`;
}

/** Public repo page for an entry (GitHub or GitLab). */
export function samSourceHref(source: string): string {
  const s = source.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.toLowerCase().includes("gitlab.com/")) {
    return s.startsWith("http") ? s : `https://${s.replace(/^\/+/, "")}`;
  }
  if (s.toLowerCase().includes("github.com/")) {
    return s.startsWith("http") ? s : `https://${s.replace(/^\/+/, "")}`;
  }
  // owner/repo
  const slash = s.indexOf("/");
  if (slash > 0 && !s.includes("://")) {
    return `https://github.com/${s}`;
  }
  return `https://github.com/sampot/${s}`;
}

/** @deprecated Prefer `samSourceHref(entry.source)`. */
export function samGithubHref(repoOrSource: string): string {
  return samSourceHref(
    repoOrSource.includes("/") ? repoOrSource : `sampot/${repoOrSource}`
  );
}

/**
 * Curated picks for Playgrounds「玩玩看」(display order).
 */
export const SAM_PLAYGROUNDS_PICK_REPOS: readonly string[] = [
  ...GENERATED_SAM_PLAYGROUNDS_PICK_IDS,
];

/** Resolve curated pick ids against the catalog (skips unknown ids). */
export function samPlaygroundsPicks(
  catalog: readonly SamEntry[] = samCatalog,
  ids: readonly string[] = SAM_PLAYGROUNDS_PICK_REPOS
): SamEntry[] {
  const byId = new Map(catalog.map(e => [e.id, e]));
  const out: SamEntry[] = [];
  for (const id of ids) {
    const entry = byId.get(id);
    if (entry) out.push(entry);
  }
  return out;
}

export type PickRandomCatalogOptions = {
  catalog?: readonly SamEntry[];
  /** Prefer curated picks; fall back to full catalog when pool empty. Default true. */
  preferPicks?: boolean;
  excludeId?: string | null;
  excludeIds?: readonly string[] | null;
  /** Exclude the catalog entry matching this sandbox `meta.source`. */
  excludeSource?: string | null;
  /** Inject for tests. */
  random?: () => number;
};

/**
 * Random catalog entry for try-play「換一個」.
 * Prefers picks; excludes current id／source when possible.
 */
export function pickRandomCatalogEntry(
  options: PickRandomCatalogOptions = {}
): SamEntry | undefined {
  const catalog = options.catalog ?? samCatalog;
  const preferPicks = options.preferPicks !== false;
  const random = options.random ?? Math.random;
  const excludeIds = new Set<string>();
  if (options.excludeId?.trim()) excludeIds.add(options.excludeId.trim());
  for (const id of options.excludeIds ?? []) {
    if (id.trim()) excludeIds.add(id.trim());
  }
  if (options.excludeSource?.trim()) {
    const hit = findCatalogBySource(options.excludeSource, catalog);
    if (hit) excludeIds.add(hit.id);
  }
  const filterPool = (pool: readonly SamEntry[]) =>
    pool.filter(e => !excludeIds.has(e.id));
  let pool = filterPool(preferPicks ? samPlaygroundsPicks(catalog) : catalog);
  if (pool.length === 0 && preferPicks) {
    pool = filterPool(catalog);
  }
  if (pool.length === 0) return undefined;
  const i = Math.floor(random() * pool.length);
  return pool[Math.min(Math.max(i, 0), pool.length - 1)];
}

/** True when sandbox `meta.source` looks like a sampot catalog open. */
export function isSampotCatalogSource(
  source: string | null | undefined
): boolean {
  if (!source) return false;
  const s = source.trim().toLowerCase();
  return (
    s.startsWith("sampot/") ||
    s.includes("github.com/sampot/") ||
    s.includes("gitlab.com/sampot/")
  );
}

function seriesOrderFor(kind: SamKind): string[] {
  return GENERATED_SAM_SERIES_ORDER[kind] ?? [];
}

export type SamSeriesBlock = {
  series: SamSeries;
  entries: SamEntry[];
};

export type SamKindBlock = {
  kind: SamKind;
  label: string;
  seriesBlocks: SamSeriesBlock[];
};

/** kind → series → entries (empty kinds omitted). */
export function samCatalogByKind(): SamKindBlock[] {
  return SAM_KIND_ORDER.map(kind => {
    const inKind = samCatalog.filter(e => e.kind === kind);
    const preferred = seriesOrderFor(kind);
    const seen = new Set<string>();
    const seriesBlocks: SamSeriesBlock[] = [];

    for (const series of preferred) {
      const entries = inKind.filter(e => e.series === series);
      if (!entries.length) continue;
      seen.add(series);
      seriesBlocks.push({ series, entries });
    }
    for (const entry of inKind) {
      if (seen.has(entry.series)) continue;
      seen.add(entry.series);
      seriesBlocks.push({
        series: entry.series,
        entries: inKind.filter(e => e.series === entry.series),
      });
    }

    return {
      kind,
      label: SAM_KIND_LABEL[kind],
      seriesBlocks,
    };
  }).filter(block => block.seriesBlocks.length > 0);
}

/** Human-facing filter state for `/sam/`（DEC-046 機器查詢之外的人機面）. */
export type CatalogHumanFilter = {
  q: string;
  kinds: SamKind[];
  series: string[];
};

export type CatalogDensity = "compact" | "comfortable";

const KIND_SET = new Set<string>(SAM_KIND_ORDER);

function parseCsvParam(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Parse `?q=`／`?kind=`／`?series=` from a search string or URLSearchParams. */
export function parseCatalogUrlSearch(
  search: string | URLSearchParams
): CatalogHumanFilter {
  const params =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") ? search.slice(1) : search
        )
      : search;
  const kinds = parseCsvParam(params.get("kind")).filter((k): k is SamKind =>
    KIND_SET.has(k)
  );
  return {
    q: (params.get("q") ?? "").trim(),
    kinds,
    series: parseCsvParam(params.get("series")),
  };
}

/** Build shareable query params（omit empty）. */
export function catalogUrlSearchParams(
  filter: CatalogHumanFilter
): URLSearchParams {
  const params = new URLSearchParams();
  const q = filter.q.trim();
  if (q) params.set("q", q);
  if (filter.kinds.length) params.set("kind", filter.kinds.join(","));
  if (filter.series.length) params.set("series", filter.series.join(","));
  return params;
}

/** Case-insensitive match against title／id／blurb／series／kind（+ label）. */
export function entryMatchesCatalogQuery(
  entry: SamEntry,
  q: string
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    entry.title,
    entry.id,
    entry.blurb,
    entry.series,
    entry.kind,
    SAM_KIND_LABEL[entry.kind],
    entry.source,
  ]
    .join("\n")
    .toLowerCase();
  return hay.includes(needle);
}

/**
 * Filter listed catalog for human browse（AND across dimensions）.
 * Empty `kinds`／`series` = no restriction on that axis.
 */
export function filterCatalogEntries(
  catalog: readonly SamEntry[] = samCatalog,
  filter: CatalogHumanFilter = { q: "", kinds: [], series: [] }
): SamEntry[] {
  const kinds =
    filter.kinds.length > 0 ? new Set<SamKind>(filter.kinds) : null;
  const series =
    filter.series.length > 0
      ? new Set(filter.series.map(s => s.trim()).filter(Boolean))
      : null;
  return catalog.filter(e => {
    if (kinds && !kinds.has(e.kind)) return false;
    if (series && !series.has(e.series)) return false;
    return entryMatchesCatalogQuery(e, filter.q);
  });
}

/** Series labels present in catalog（optionally scoped to selected kinds）. */
export function catalogSeriesOptions(
  catalog: readonly SamEntry[] = samCatalog,
  kinds?: readonly SamKind[]
): string[] {
  const kindSet = kinds?.length ? new Set(kinds) : null;
  const seen = new Set<string>();
  const out: string[] = [];
  const preferOrder = new Map<string, number>();
  let ord = 0;
  for (const kind of SAM_KIND_ORDER) {
    if (kindSet && !kindSet.has(kind)) continue;
    for (const s of seriesOrderFor(kind)) {
      if (!preferOrder.has(s)) preferOrder.set(s, ord++);
    }
  }
  for (const e of catalog) {
    if (kindSet && !kindSet.has(e.kind)) continue;
    if (seen.has(e.series)) continue;
    seen.add(e.series);
    out.push(e.series);
  }
  return out.sort((a, b) => {
    const ia = preferOrder.has(a) ? preferOrder.get(a)! : 10_000;
    const ib = preferOrder.has(b) ? preferOrder.get(b)! : 10_000;
    return ia - ib || a.localeCompare(b, "zh-Hant");
  });
}
