/**
 * SAM FileMap resolve for go `/s/` and Invite `/i/`.
 *
 * Policies:
 * - `local-first`（`/s/`）：有同 source 離線包即重用；tip 同步僅經「檢查更新」。
 * - `check-tip`（Invite Guest）：入座前比 GitHub tree SHA；沒包或 tipRev 過期才重抓。
 */

import type { FileMap } from "@pg/projectTypes";
import type { FileListProgress } from "@pg/transferProgress";
import { findGoCatalogBySource, getGoCatalogEntry } from "./goCatalog";
import {
  getGoSamOfflineCache,
  putGoSamOfflineCache,
} from "./goSamOfflineCache";
import {
  assertSamHasIndex,
  fetchSamTipRev,
  loadSamFiles,
} from "./samLoad";

export type GoSamUpdatePolicy = "local-first" | "check-tip";

export type GoSamResolveOrigin = "cache" | "download" | "stale-cache";

export type GoSamResolveResult = {
  files: FileMap;
  origin: GoSamResolveOrigin;
  /** Catalog id used for the offline pack key (null when uncacheable). */
  catalogId: string | null;
};

export type ResolveGoSamFilesOptions = {
  /** Compose／catalog `source` (owner/repo or GitHub URL). */
  source: string;
  /** Prefer when known (`/s/<id>`); otherwise resolved via catalog source. */
  catalogId?: string | null;
  /**
   * `local-first` = solo `/s/`；`check-tip` = Invite Guest must verify tip.
   * Default `local-first`.
   */
  updatePolicy?: GoSamUpdatePolicy;
  signal?: AbortSignal;
  onProgress?: (p: FileListProgress) => void;
};

function resolveCacheTarget(opts: {
  source: string;
  catalogId?: string | null;
}): { catalogId: string; canonicalSource: string } | null {
  const fromId = opts.catalogId?.trim()
    ? getGoCatalogEntry(opts.catalogId.trim())
    : undefined;
  if (fromId) {
    return { catalogId: fromId.id, canonicalSource: fromId.source };
  }
  const fromSource = findGoCatalogBySource(opts.source);
  if (fromSource) {
    return { catalogId: fromSource.id, canonicalSource: fromSource.source };
  }
  return null;
}

async function downloadAndCache(opts: {
  source: string;
  target: { catalogId: string; canonicalSource: string } | null;
  tipRev?: string | null;
  signal?: AbortSignal;
  onProgress?: (p: FileListProgress) => void;
}): Promise<GoSamResolveResult> {
  const files = await loadSamFiles(opts.source, {
    signal: opts.signal,
    onProgress: opts.onProgress,
  });
  assertSamHasIndex(files);
  let tipRev = opts.tipRev?.trim() || null;
  if (!tipRev) {
    try {
      tipRev = await fetchSamTipRev(opts.source, { signal: opts.signal });
    } catch {
      tipRev = null;
    }
  }
  if (opts.target) {
    await putGoSamOfflineCache(
      opts.target.catalogId,
      opts.target.canonicalSource,
      files,
      tipRev
    );
  }
  return {
    files,
    origin: "download",
    catalogId: opts.target?.catalogId ?? null,
  };
}

/**
 * Resolve SAM files per {@link ResolveGoSamFilesOptions.updatePolicy}.
 */
export async function resolveGoSamFiles(
  opts: ResolveGoSamFilesOptions
): Promise<GoSamResolveResult> {
  const source = opts.source.trim();
  if (!source) throw new Error("小品來源為空");
  const policy: GoSamUpdatePolicy = opts.updatePolicy ?? "local-first";

  const target = resolveCacheTarget({
    source,
    catalogId: opts.catalogId,
  });
  const cached = target ? await getGoSamOfflineCache(target.catalogId) : null;

  if (policy === "local-first") {
    if (target && cached?.source === target.canonicalSource) {
      assertSamHasIndex(cached.files);
      return {
        files: cached.files,
        origin: "cache",
        catalogId: target.catalogId,
      };
    }
    try {
      return await downloadAndCache({
        source,
        target,
        signal: opts.signal,
        onProgress: opts.onProgress,
      });
    } catch (e) {
      if (cached) {
        assertSamHasIndex(cached.files);
        return {
          files: cached.files,
          origin: "stale-cache",
          catalogId: target?.catalogId ?? null,
        };
      }
      throw e;
    }
  }

  // check-tip（Invite）：先讀 tip；本機 tipRev 相符才跳過全量下載。
  let tipRev: string | null = null;
  try {
    tipRev = await fetchSamTipRev(source, { signal: opts.signal });
  } catch (e) {
    if (cached && (!target || cached.source === target.canonicalSource)) {
      assertSamHasIndex(cached.files);
      return {
        files: cached.files,
        origin: "stale-cache",
        catalogId: target?.catalogId ?? null,
      };
    }
    throw e;
  }

  if (
    target &&
    cached &&
    cached.source === target.canonicalSource &&
    cached.tipRev &&
    cached.tipRev === tipRev
  ) {
    assertSamHasIndex(cached.files);
    return {
      files: cached.files,
      origin: "cache",
      catalogId: target.catalogId,
    };
  }

  try {
    return await downloadAndCache({
      source,
      target,
      tipRev,
      signal: opts.signal,
      onProgress: opts.onProgress,
    });
  } catch (e) {
    if (cached) {
      assertSamHasIndex(cached.files);
      return {
        files: cached.files,
        origin: "stale-cache",
        catalogId: target?.catalogId ?? null,
      };
    }
    throw e;
  }
}
