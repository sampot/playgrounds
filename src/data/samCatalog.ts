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
} from "./samCatalog.generated";

export type SamKind = GeneratedSamKind;

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
}

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
