import {
  fetchGithubProject,
  fetchGithubTipRev,
  parseGithubUrl,
} from "@pg/githubProject";
import type { FileMap } from "@pg/projectTypes";
import type { FileListProgress } from "@pg/transferProgress";

export type LoadSamFilesOptions = {
  signal?: AbortSignal;
  onProgress?: (p: FileListProgress) => void;
};

/** Fetch SAM FileMap from a catalog／compose `source` (GitHub owner/repo or URL). */
export async function loadSamFiles(
  source: string,
  options?: LoadSamFilesOptions
): Promise<FileMap> {
  const ref = parseGithubUrl(source);
  if (!ref) {
    throw new Error(`無法解析小品來源：${source}`);
  }
  return fetchGithubProject(ref, {
    signal: options?.signal,
    onProgress: options?.onProgress,
  });
}

/** Light GitHub tree SHA for tip／offline freshness checks. */
export async function fetchSamTipRev(
  source: string,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const ref = parseGithubUrl(source);
  if (!ref) {
    throw new Error(`無法解析小品來源：${source}`);
  }
  return fetchGithubTipRev(ref, { signal: options?.signal });
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
