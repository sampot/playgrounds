import { repoBlobToProjectPath, shouldIncludeRepoPath } from "./gitRepoPaths";
import { normalizeProjectPath } from "./pathUtils";
import { bytesToFileContent, type FileMap } from "./projectTypes";
import type { FileListProgress } from "./transferProgress";
import {
  parseSamManifestJson,
  SAM_MANIFEST_FILENAME,
  type SamManifest,
} from "./samManifest";

export interface GithubRef {
  owner: string;
  repo: string;
  /** Branch, tag, or commit; default resolved at fetch time. */
  ref?: string;
  /** Subdirectory inside the repo. */
  path?: string;
}

export function parseGithubUrl(input: string): GithubRef | null {
  const raw = input.trim();
  if (!raw) return null;

  // owner/repo or owner/repo/path
  const short = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(.+))?$/u);
  if (short && !raw.includes("://") && !raw.includes("github.com")) {
    const path = short[3] ? normalizeProjectPath(short[3]) : undefined;
    return {
      owner: short[1]!,
      repo: short[2]!.replace(/\.git$/u, ""),
      path: path || undefined,
    };
  }

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/(?:^|\.)github\.com$/iu.test(url.hostname)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/u, "");

  let ref: string | undefined;
  let path: string | undefined;

  if (parts[2] === "tree" || parts[2] === "blob") {
    ref = parts[3];
    if (parts.length > 4) {
      path = normalizeProjectPath(parts.slice(4).join("/"));
    }
  } else if (parts.length > 2) {
    path = normalizeProjectPath(parts.slice(2).join("/"));
  }

  return { owner, repo, ref, path: path || undefined };
}

export function formatGithubSource(ref: GithubRef): string {
  const base = `https://github.com/${ref.owner}/${ref.repo}`;
  if (ref.ref && ref.path) {
    return `${base}/tree/${ref.ref}/${ref.path}`;
  }
  if (ref.ref) return `${base}/tree/${ref.ref}`;
  if (ref.path) return `${base}/tree/HEAD/${ref.path}`;
  return base;
}

const GH_JSON = {
  Accept: "application/vnd.github+json",
} as const;

type GhTreeItem = {
  path?: string;
  type?: string;
  size?: number;
  sha?: string;
};

async function fetchRepoTree(
  owner: string,
  repo: string,
  treeRef: string,
  signal?: AbortSignal
): Promise<
  | { ok: true; sha: string; tree: GhTreeItem[] }
  | { ok: false; status: number }
> {
  // Branch tips are mutable, so the tree API response is HTTP-cached by the
  // browser／SW and would otherwise serve a stale tree (with old blob SHAs)
  // indefinitely — keeping go pinned to a pre-push SAM version. Append a
  // cache-busting query so a new push is actually fetched. Immutable refs
  // (40-char SHA／tag) skip the bust to keep legitimate HTTP caching.
  const isBranch = !/^[0-9a-f]{40}$/i.test(treeRef);
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeRef)}?recursive=1${isBranch ? `&_=${Date.now()}` : ""}`;
  const treeRes = await fetch(treeUrl, {
    headers: GH_JSON,
    signal,
  });
  if (!treeRes.ok) return { ok: false, status: treeRes.status };
  const tree = (await treeRes.json()) as {
    sha?: string;
    truncated?: boolean;
    tree?: GhTreeItem[];
  };
  if (tree.truncated) {
    throw new Error("儲存庫檔案樹過大（API truncated），請指定較淺的子目錄");
  }
  const sha = typeof tree.sha === "string" ? tree.sha.trim() : "";
  if (!sha) {
    throw new Error("無法讀取儲存庫 tip revision");
  }
  return { ok: true, sha, tree: tree.tree || [] };
}

/**
 * Resolve the Git tree SHA for a public GitHub source (branch tip／ref).
 * Light check used by Invite join to skip a full re-download when local
 * offline pack already matches tip.
 */
export async function fetchGithubTipRev(
  ref: GithubRef,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const { sha } = await resolveGithubTree(ref, options?.signal);
  return sha;
}

async function resolveGithubTree(
  ref: GithubRef,
  signal?: AbortSignal
): Promise<{ sha: string; rawRef: string; tree: GhTreeItem[] }> {
  // Default branch is always `main` (no master／/repos fallback — saves API quota).
  const rawRef = ref.ref || "main";
  const treeResult = await fetchRepoTree(ref.owner, ref.repo, rawRef, signal);
  if (!treeResult.ok) {
    throw new Error(`無法列出檔案樹（HTTP ${treeResult.status}）`);
  }
  return { sha: treeResult.sha, rawRef, tree: treeResult.tree };
}

export type FetchGithubProjectResult = {
  files: FileMap;
  /** Manifest `rev` (go／catalog) or Git tree SHA (Trees fallback). */
  tipRev: string;
};

function githubRawRefPath(rawRef: string): string {
  // Branch names via /main are often CDN-sticky on raw.githubusercontent.com;
  // refs/heads/<branch> stays fresher. Leave full SHAs and existing refs/ alone.
  const t = rawRef.trim();
  if (!t) return "refs/heads/main";
  if (t.startsWith("refs/")) return t;
  if (/^[0-9a-f]{7,40}$/i.test(t)) return t;
  return `refs/heads/${t}`;
}

function githubRawBase(ref: GithubRef, rawRef: string): string {
  const path = githubRawRefPath(rawRef)
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${path}`;
}

/**
 * Fetch and validate root `sam-manifest.json` for a public GitHub source.
 * No GitHub REST API — raw only (PG-GO-SAM-MANIFEST-PLAN).
 */
export async function fetchGithubSamManifest(
  ref: GithubRef,
  options?: { signal?: AbortSignal }
): Promise<{ manifest: SamManifest; rawRef: string }> {
  if (ref.path) {
    throw new Error("sam-manifest 僅支援儲存庫根目錄來源（勿指定子目錄）");
  }
  const rawRef = ref.ref || "main";
  // Bust CDN／browser HTTP cache so booth check-tip sees the latest rev.
  const url = `${githubRawBase(ref, rawRef)}/${SAM_MANIFEST_FILENAME}?t=${Date.now()}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: options?.signal, cache: "no-store" });
  } catch (e) {
    if (options?.signal?.aborted) throw new Error("已取消下載");
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`無法下載 sam-manifest.json：${msg}`);
  }
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "找不到 sam-manifest.json（來源未就緒）"
        : `無法下載 sam-manifest.json（HTTP ${res.status}）`
    );
  }
  const text = await res.text();
  const manifest = parseSamManifestJson(text);
  return { manifest, rawRef };
}

/** Tip／offline freshness = manifest `rev` (not Git Trees SHA). */
export async function fetchGithubSamTipRev(
  ref: GithubRef,
  options?: { signal?: AbortSignal }
): Promise<string> {
  const { manifest } = await fetchGithubSamManifest(ref, options);
  return manifest.rev;
}

/**
 * Download SAM FileMap using only `sam-manifest.json` + raw files.
 * Does **not** call api.github.com and does **not** fall back to Trees.
 */
export async function fetchGithubProjectFromManifest(
  ref: GithubRef,
  options?: {
    signal?: AbortSignal;
    maxFiles?: number;
    onProgress?: (p: FileListProgress) => void;
  }
): Promise<FetchGithubProjectResult> {
  const maxFiles = options?.maxFiles ?? 200;
  const { manifest, rawRef } = await fetchGithubSamManifest(ref, {
    signal: options?.signal,
  });
  if (manifest.files.length > maxFiles) {
    throw new Error(`檔案過多（>${maxFiles}），請縮小 sam-manifest files`);
  }

  const total = manifest.files.length;
  options?.onProgress?.({ done: 0, total, ratio: 0 });

  const files: FileMap = {};
  const bust = `?v=${encodeURIComponent(manifest.rev)}`;
  const base = githubRawBase(ref, rawRef);

  for (let i = 0; i < manifest.files.length; i++) {
    const repoPath = manifest.files[i]!;
    const pathEnc = repoPath
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    // no-store: branch tip + rev query still hit Fastly; avoid caching a
    // stale blob under a freshly published manifest.rev (poisoned offline pack).
    const rawUrl = `${base}/${pathEnc}${bust}&t=${Date.now()}`;
    const fileRes = await fetch(rawUrl, {
      signal: options?.signal,
      cache: "no-store",
    });
    if (!fileRes.ok) {
      throw new Error(`下載失敗：${repoPath}（HTTP ${fileRes.status}）`);
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const projectPath = normalizeProjectPath(repoPath);
    files[projectPath] = bytesToFileContent(projectPath, bytes);
    const done = i + 1;
    options?.onProgress?.({
      done,
      total,
      ratio: done / total,
      path: repoPath,
    });
  }

  return { files, tipRev: manifest.rev };
}

/**
 * Fetch project files from a public GitHub repo into a FileMap (text + common binaries).
 * Prefer root `sam-manifest.json` when present; otherwise Git Trees API + raw
 * (field-shell fallback for non-game／legacy sources).
 */
export async function fetchGithubProject(
  ref: GithubRef,
  options?: {
    signal?: AbortSignal;
    maxFiles?: number;
    onProgress?: (p: FileListProgress) => void;
  }
): Promise<FetchGithubProjectResult> {
  if (!ref.path) {
    try {
      return await fetchGithubProjectFromManifest(ref, options);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Missing manifest → Trees. Other errors (bad JSON, file 404) surface.
      if (!/找不到 sam-manifest\.json|來源未就緒|HTTP 404/.test(msg)) {
        throw e;
      }
    }
  }

  const maxFiles = options?.maxFiles ?? 200;
  const rootPrefix = ref.path ? normalizeProjectPath(ref.path) : "";

  const { sha, rawRef, tree } = await resolveGithubTree(ref, options?.signal);

  const candidates = tree.filter(
    item =>
      item.type === "blob" &&
      typeof item.path === "string" &&
      shouldIncludeRepoPath(item.path, rootPrefix) &&
      (item.size === undefined || item.size <= 2_000_000)
  );

  if (candidates.length === 0) {
    throw new Error("找不到可匯入的檔案（請確認路徑與分支）");
  }
  if (candidates.length > maxFiles) {
    throw new Error(`檔案過多（>${maxFiles}），請指定子目錄或縮小範圍`);
  }

  const total = candidates.length;
  options?.onProgress?.({ done: 0, total, ratio: 0 });

  const files: FileMap = {};
  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i]!;
    const repoPath = item.path!;
    const projectPath = repoBlobToProjectPath(repoPath, rootPrefix);
    const pathEnc = repoPath
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    // Blob SHA in query busts stale branch-tip HTTP caches without an extra API call.
    const bust = item.sha ? `?v=${encodeURIComponent(item.sha)}` : "";
    const rawUrl = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(rawRef)}/${pathEnc}${bust}`;
    const fileRes = await fetch(rawUrl, { signal: options?.signal });
    if (!fileRes.ok) {
      throw new Error(`下載失敗：${repoPath}（HTTP ${fileRes.status}）`);
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    files[projectPath] = bytesToFileContent(projectPath, bytes);
    const done = i + 1;
    options?.onProgress?.({
      done,
      total,
      ratio: done / total,
      path: repoPath,
    });
  }

  return { files, tipRev: sha };
}
