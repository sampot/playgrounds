import { repoBlobToProjectPath, shouldIncludeRepoPath } from "./gitRepoPaths";
import { normalizeProjectPath } from "./pathUtils";
import { bytesToFileContent, type FileMap } from "./projectTypes";
import type { FileListProgress } from "./transferProgress";

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

async function resolveDefaultBranch(
  owner: string,
  repo: string
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`無法讀取儲存庫（HTTP ${res.status}）`);
  }
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch || "main";
}

/**
 * Fetch project files from a public GitHub repo into a FileMap (text + common binaries).
 * Uses the Git Trees API + raw.githubusercontent.com (unauthenticated rate limits apply).
 */
export async function fetchGithubProject(
  ref: GithubRef,
  options?: {
    signal?: AbortSignal;
    maxFiles?: number;
    onProgress?: (p: FileListProgress) => void;
  }
): Promise<FileMap> {
  const maxFiles = options?.maxFiles ?? 200;
  const branch = ref.ref || (await resolveDefaultBranch(ref.owner, ref.repo));
  const rootPrefix = ref.path ? normalizeProjectPath(ref.path) : "";

  const treeUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const treeRes = await fetch(treeUrl, {
    headers: { Accept: "application/vnd.github+json" },
    signal: options?.signal,
  });
  if (!treeRes.ok) {
    throw new Error(`無法列出檔案樹（HTTP ${treeRes.status}）`);
  }
  const tree = (await treeRes.json()) as {
    truncated?: boolean;
    tree?: { path?: string; type?: string; size?: number }[];
  };
  if (tree.truncated) {
    throw new Error("儲存庫檔案樹過大（API truncated），請指定較淺的子目錄");
  }

  const candidates = (tree.tree || []).filter(
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
    const rawUrl = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${repoPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
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

  return files;
}
