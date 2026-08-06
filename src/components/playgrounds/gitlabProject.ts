/**
 * Public GitLab.com project import for Playgrounds open-from-URL (DEC-025).
 */

import { repoBlobToProjectPath, shouldIncludeRepoPath } from "./gitRepoPaths";
import { normalizeProjectPath } from "./pathUtils";
import { bytesToFileContent, type FileMap } from "./projectTypes";
import type { FileListProgress } from "./transferProgress";

export interface GitlabRef {
  /** Full project path, e.g. `group/sub/repo`. */
  projectPath: string;
  ref?: string;
  path?: string;
}

export function parseGitlabUrl(input: string): GitlabRef | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/(?:^|\.)gitlab\.com$/iu.test(url.hostname)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const dash = parts.indexOf("-");
  let projectParts: string[];
  let ref: string | undefined;
  let path: string | undefined;

  if (dash >= 2 && (parts[dash + 1] === "tree" || parts[dash + 1] === "blob")) {
    projectParts = parts.slice(0, dash);
    ref = parts[dash + 2];
    if (parts.length > dash + 3) {
      path = normalizeProjectPath(parts.slice(dash + 3).join("/"));
    }
  } else {
    projectParts = parts;
  }

  const projectPath = projectParts.map(p => p.replace(/\.git$/u, "")).join("/");
  if (!projectPath.includes("/")) return null;

  return {
    projectPath,
    ref,
    path: path || undefined,
  };
}

export function formatGitlabSource(ref: GitlabRef): string {
  const base = `https://gitlab.com/${ref.projectPath}`;
  if (ref.ref && ref.path) {
    return `${base}/-/tree/${ref.ref}/${ref.path}`;
  }
  if (ref.ref) return `${base}/-/tree/${ref.ref}`;
  if (ref.path) return `${base}/-/tree/HEAD/${ref.path}`;
  return base;
}

async function resolveDefaultBranch(projectPath: string): Promise<string> {
  const id = encodeURIComponent(projectPath);
  const res = await fetch(`https://gitlab.com/api/v4/projects/${id}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`無法讀取 GitLab 儲存庫（HTTP ${res.status}）`);
  }
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch || "main";
}

/**
 * Fetch files from a public GitLab.com project (tree + raw file API).
 */
export async function fetchGitlabProject(
  ref: GitlabRef,
  options?: {
    signal?: AbortSignal;
    maxFiles?: number;
    onProgress?: (p: FileListProgress) => void;
  }
): Promise<FileMap> {
  const maxFiles = options?.maxFiles ?? 200;
  const branch = ref.ref || (await resolveDefaultBranch(ref.projectPath));
  const rootPrefix = ref.path ? normalizeProjectPath(ref.path) : "";
  const projectId = encodeURIComponent(ref.projectPath);

  const treeUrl =
    `https://gitlab.com/api/v4/projects/${projectId}/repository/tree` +
    `?ref=${encodeURIComponent(branch)}&recursive=true&per_page=100`;

  const blobs: { path: string }[] = [];
  let page = 1;
  for (;;) {
    const res = await fetch(`${treeUrl}&page=${page}`, {
      headers: { Accept: "application/json" },
      signal: options?.signal,
    });
    if (!res.ok) {
      throw new Error(`無法列出 GitLab 檔案樹（HTTP ${res.status}）`);
    }
    const batch = (await res.json()) as {
      path?: string;
      type?: string;
    }[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const item of batch) {
      if (
        item.type === "blob" &&
        typeof item.path === "string" &&
        shouldIncludeRepoPath(item.path, rootPrefix)
      ) {
        blobs.push({ path: item.path });
      }
    }
    if (batch.length < 100) break;
    page += 1;
    if (page > 20) {
      throw new Error("儲存庫檔案樹過大，請指定較淺的子目錄");
    }
  }

  if (blobs.length === 0) {
    throw new Error("找不到可匯入的檔案（請確認路徑與分支）");
  }
  if (blobs.length > maxFiles) {
    throw new Error(`檔案過多（>${maxFiles}），請指定子目錄或縮小範圍`);
  }

  const total = blobs.length;
  options?.onProgress?.({ done: 0, total, ratio: 0 });

  const files: FileMap = {};
  for (let i = 0; i < blobs.length; i++) {
    const item = blobs[i]!;
    const projectPath = repoBlobToProjectPath(item.path, rootPrefix);
    const filePath = encodeURIComponent(item.path);
    const rawUrl =
      `https://gitlab.com/api/v4/projects/${projectId}/repository/files/` +
      `${filePath}/raw?ref=${encodeURIComponent(branch)}`;
    const fileRes = await fetch(rawUrl, { signal: options?.signal });
    if (!fileRes.ok) {
      throw new Error(`下載失敗：${item.path}（HTTP ${fileRes.status}）`);
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    if (bytes.byteLength > 2_000_000) continue;
    files[projectPath] = bytesToFileContent(projectPath, bytes);
    const done = i + 1;
    options?.onProgress?.({
      done,
      total,
      ratio: done / total,
      path: item.path,
    });
  }

  if (Object.keys(files).length === 0) {
    throw new Error("找不到可匯入的檔案（檔案過大或無法下載）");
  }

  return files;
}
