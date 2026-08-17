import {
  fetchGithubProjectFromManifest,
  fetchGithubSamTipRev,
  parseGithubUrl,
} from "@pg/githubProject";
import type { FileMap } from "@pg/projectTypes";
import type { FileListProgress } from "@pg/transferProgress";

export type LoadSamFilesOptions = {
  signal?: AbortSignal;
  onProgress?: (p: FileListProgress) => void;
};

export type LoadSamFilesResult = {
  files: FileMap;
  tipRev: string;
};

/**
 * Fetch SAM FileMap from a catalog／compose `source`.
 * Catalog games require root `sam-manifest.json` (no Trees fallback).
 */
export async function loadSamFiles(
  source: string,
  options?: LoadSamFilesOptions
): Promise<LoadSamFilesResult> {
  const ref = parseGithubUrl(source);
  if (!ref) {
    throw new Error(`無法解析小品來源：${source}`);
  }
  return fetchGithubProjectFromManifest(ref, {
    signal: options?.signal,
    onProgress: options?.onProgress,
  });
}

/** Tip／offline freshness = sam-manifest `rev`. */
export async function fetchSamTipRev(
  source: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const ref = parseGithubUrl(source);
  if (!ref) {
    throw new Error(`無法解析小品來源：${source}`);
  }
  return fetchGithubSamTipRev(ref, { signal: options?.signal });
}

export function assertSamHasIndex(files: FileMap): void {
  if (files["index.html"] || files["/index.html"]) return;
  const hasIndex = Object.keys(files).some(
    p => p === "index.html" || p.endsWith("/index.html")
  );
  if (!hasIndex) {
    throw new Error("小品缺少 index.html");
  }
}
