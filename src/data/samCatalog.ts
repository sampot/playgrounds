/**
 * SAM catalog API for `/sam/` and shell picks.
 * Authority: `catalog/entries/*.yaml` (see `npm run catalog:gen`).
 */

import { buildCanonicalOpenUrl } from "../utils/playgroundsUrls";
import {
  GENERATED_SAM_CATALOG,
  GENERATED_SAM_KIND_LABEL,
  GENERATED_SAM_KIND_ORDER,
  GENERATED_SAM_PAGE,
  GENERATED_SAM_PLAYGROUNDS_PICK_IDS,
  GENERATED_SAM_SERIES_ORDER,
  type GeneratedSamEntry,
  type GeneratedSamKind,
  type GeneratedSamProtocol,
} from "./samCatalog.generated";

export type SamKind = GeneratedSamKind;

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
    ...(e.license ? { license: e.license } : {}),
    ...(e.protocols?.length ? { protocols: e.protocols } : {}),
  };
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

/** Listed catalog entries (draft YAML omitted at gen time). */
export const samCatalog: SamEntry[] = GENERATED_SAM_CATALOG.map(toSamEntry);

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

/** All listed catalog entries (same authority as `/catalog/v1.json`). */
export function listCatalogEntries(
  catalog: readonly SamEntry[] = samCatalog
): readonly SamEntry[] {
  return catalog;
}

/** Lookup by stable catalog id. */
export function getCatalogEntry(
  id: string,
  catalog: readonly SamEntry[] = samCatalog
): SamEntry | undefined {
  const key = id.trim();
  if (!key) return undefined;
  return catalog.find(e => e.id === key);
}

/**
 * Find entry whose `source` matches (after {@link normalizeCatalogSource}).
 * Also matches when `source` equals catalog `id` or `sampot/<id>`.
 */
export function findCatalogBySource(
  source: string,
  catalog: readonly SamEntry[] = samCatalog
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
  catalog: readonly SamEntry[] = samCatalog
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
  catalog: readonly SamEntry[] = samCatalog
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
  const catalog = options?.catalog ?? samCatalog;
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
