/** Browser ↔ workspace file transfer helpers (OS pickers, URL fetch, ZIP). */

import { zipSync } from "fflate";
import { joinProjectPath, normalizeProjectPath } from "./pathUtils";
import {
  bytesToFileContent,
  fileContentToBytes,
  type FileContent,
  type FileMap,
} from "./projectTypes";

export const MAX_TRANSFER_FILES = 200;
export const MAX_TRANSFER_BYTES = 32 * 1024 * 1024;

export function downloadBytes(
  filename: string,
  data: Uint8Array,
  mime = "application/octet-stream"
): void {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** ZIP selected project paths (no project meta). Multi-file download default. */
export function pathsToZip(
  files: FileMap,
  paths: string[],
  options?: { folderName?: string }
): Uint8Array {
  const payload: Record<string, Uint8Array> = {};
  const folder = options?.folderName
    ? options.folderName.replace(/[^\w.\-()+@\u4e00-\u9fff]+/gu, "-") || "files"
    : "";

  for (const raw of paths) {
    let path: string;
    try {
      path = normalizeProjectPath(raw);
    } catch {
      continue;
    }
    const content = files[path];
    if (content === undefined) continue;
    const key = folder ? `${folder}/${path}` : path;
    payload[key] = fileContentToBytes(content);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("沒有可下載的檔案");
  }
  return zipSync(payload, { level: 6 });
}

function assertTransferBudget(fileCount: number, totalBytes: number): void {
  if (fileCount > MAX_TRANSFER_FILES) {
    throw new Error(`檔案過多（>${MAX_TRANSFER_FILES}）`);
  }
  if (totalBytes > MAX_TRANSFER_BYTES) {
    throw new Error(
      `總大小超過上限（>${Math.round(MAX_TRANSFER_BYTES / (1024 * 1024))}MB）`
    );
  }
}

/**
 * Shared top folder name from `webkitRelativePath` (directory picker), if any.
 * Returns null when paths are flat or roots disagree.
 */
export function browserDirectoryRootName(list: ArrayLike<File>): string | null {
  const relatives = Array.from(list).map(f => {
    const rel = (f as File & { webkitRelativePath?: string })
      .webkitRelativePath;
    return rel && rel.length > 0 ? rel.replace(/\\/gu, "/") : "";
  });
  if (
    relatives.length === 0 ||
    !relatives.every(r => r.includes("/")) ||
    !relatives.every(r => r.split("/")[0] === relatives[0]!.split("/")[0])
  ) {
    return null;
  }
  return relatives[0]!.split("/")[0] || null;
}

/**
 * Map OS File / FileList entries into a FileMap under `destDir`.
 * Uses `webkitRelativePath` when present (directory picker / webkitdirectory).
 */
export async function browserFilesToFileMap(
  list: ArrayLike<File>,
  destDir = ""
): Promise<FileMap> {
  const files = Array.from(list);
  if (files.length === 0) {
    throw new Error("未選擇檔案");
  }

  let base = "";
  try {
    base = destDir ? normalizeProjectPath(destDir) : "";
  } catch {
    throw new Error("目標目錄路徑無效");
  }

  const relatives = files.map(f => {
    const rel = (f as File & { webkitRelativePath?: string })
      .webkitRelativePath;
    return rel && rel.length > 0 ? rel.replace(/\\/gu, "/") : f.name;
  });
  let stripPrefix = "";
  if (
    relatives.length > 0 &&
    relatives.every(r => r.includes("/")) &&
    relatives.every(r => r.split("/")[0] === relatives[0]!.split("/")[0])
  ) {
    stripPrefix = relatives[0]!.split("/")[0]!;
  }

  const out: FileMap = {};
  let totalBytes = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    let rel = relatives[i]!;
    if (
      stripPrefix &&
      (rel === stripPrefix || rel.startsWith(`${stripPrefix}/`))
    ) {
      rel = rel === stripPrefix ? file.name : rel.slice(stripPrefix.length + 1);
    }
    const path = joinProjectPath(base, rel);
    totalBytes += file.size;
    assertTransferBudget(i + 1, totalBytes);
    const buf = new Uint8Array(await file.arrayBuffer());
    out[path] = bytesToFileContent(path, buf);
  }

  return out;
}

export function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "download";
    return decodeURIComponent(last);
  } catch {
    return "download";
  }
}

export function filenameFromContentDisposition(
  header: string | null
): string | null {
  if (!header) return null;
  const utf = header.match(/filename\*=(?:UTF-8''|utf-8'')([^;]+)/u);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim().replace(/^"|"$/gu, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/u);
  return plain?.[1]?.trim() || null;
}

export interface FetchUrlResult {
  path: string;
  content: FileContent;
}

export interface FetchUrlOptions {
  /** Full file path inside the project. */
  destPath?: string;
  /** Directory; filename inferred from Content-Disposition or URL. */
  destDir?: string;
  signal?: AbortSignal;
}

/**
 * Fetch a single URL into workspace bytes. Requires CORS on the remote.
 * Prefer `destPath`; otherwise `destDir` + inferred name; else root + inferred name.
 */
export async function fetchUrlToFile(
  url: string,
  options: FetchUrlOptions = {}
): Promise<FetchUrlResult> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("請輸入 URL");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("URL 無效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("僅支援 http(s) URL");
  }

  let response: Response;
  try {
    response = await fetch(parsed.href, {
      signal: options.signal,
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (options.signal?.aborted) throw new Error("已取消下載");
    throw new Error(`無法下載（多半是對方未開放 CORS，或網路錯誤）：${msg}`);
  }

  if (!response.ok) {
    throw new Error(`下載失敗：HTTP ${response.status}`);
  }

  const buf = new Uint8Array(await response.arrayBuffer());
  assertTransferBudget(1, buf.byteLength);

  const inferred =
    filenameFromContentDisposition(
      response.headers.get("content-disposition")
    ) || filenameFromUrl(parsed.href);

  let path: string;
  if (options.destPath) {
    path = normalizeProjectPath(options.destPath);
  } else if (options.destDir) {
    path = joinProjectPath(options.destDir, inferred);
  } else {
    path = normalizeProjectPath(inferred);
  }

  if (!path) throw new Error("目標路徑無效");
  return { path, content: bytesToFileContent(path, buf) };
}
