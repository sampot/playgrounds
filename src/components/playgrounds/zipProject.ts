import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { isGitPath } from "./gitPathUtils";
import { normalizeProjectPath } from "./pathUtils";
import type { ProjectStateBundle } from "./projectState";
import {
  isStatePath,
  stateBundleToZipEntries,
  zipEntriesToStateBundle,
} from "./projectStateZip";
import {
  LEGACY_META_FILENAME,
  META_FILENAME,
  bytesToFileContent,
  defaultMeta,
  fileContentToBytes,
  isMetaFilename,
  pickEntry,
  type FileMap,
  type ProjectMeta,
} from "./projectTypes";

/**
 * Playgrounds project package extension.
 * Bytes are a ZIP container; `.sam` only marks a SAM／沙盒包裹 for recognition.
 */
export const SAM_FILE_EXTENSION = ".sam";

export interface ExportedProject {
  meta: ProjectMeta;
  files: FileMap;
  /** Optional durable state (KV / DB / Secrets) when present in the package. */
  state?: ProjectStateBundle | null;
}

export function isSamFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(SAM_FILE_EXTENSION);
}

/** Ensure a project download name ends with `.sam` (strips a trailing `.zip`). */
export function withSamExtension(filename: string): string {
  const base = filename.replace(/\.(sam|zip)$/i, "");
  return `${base || "project"}${SAM_FILE_EXTENSION}`;
}

function stripRootPrefix(paths: string[]): {
  prefix: string;
  relative: string[];
} {
  if (paths.length === 0) return { prefix: "", relative: [] };
  const parts = paths[0]!.split("/");
  // If all files share a single top-level folder, strip it (common ZIP layout).
  if (parts.length < 2) return { prefix: "", relative: paths };
  const top = parts[0]!;
  if (
    paths.every(p => p === top || p.startsWith(`${top}/`)) &&
    paths.some(p => p.startsWith(`${top}/`))
  ) {
    return {
      prefix: top,
      relative: paths
        .filter(p => p.startsWith(`${top}/`))
        .map(p => p.slice(top.length + 1)),
    };
  }
  return { prefix: "", relative: paths };
}

export function filesToZip(
  files: FileMap,
  meta: ProjectMeta,
  options?: { folderName?: string; state?: ProjectStateBundle | null }
): Uint8Array {
  const folder = options?.folderName || meta.name || "project";
  const safeFolder =
    folder.replace(/[^\w.\-()+@\u4e00-\u9fff]+/gu, "-") || "project";
  const payload: Record<string, Uint8Array> = {};
  // DEC-036／051: do not pack admittedCapabilities／scopeGrants — re-admit／re-grant.
  const {
    admittedCapabilities: _admitted,
    scopeGrants: _grants,
    ...exportMeta
  } = meta;
  const metaJson = JSON.stringify(
    { ...exportMeta, updatedAt: new Date().toISOString() },
    null,
    2
  );
  payload[`${safeFolder}/${META_FILENAME}`] = strToU8(metaJson);
  for (const [path, content] of Object.entries(files)) {
    if (isMetaFilename(path) || isStatePath(path)) continue;
    // §8.4: default exclude `.git/**` from `.sam` export.
    if (isGitPath(path)) continue;
    payload[`${safeFolder}/${path}`] = fileContentToBytes(content);
  }
  if (options?.state) {
    const stateEntries = stateBundleToZipEntries(options.state);
    for (const [rel, bytes] of Object.entries(stateEntries)) {
      payload[`${safeFolder}/${rel}`] = bytes;
    }
  }
  return zipSync(payload, { level: 6 });
}

export function zipToFiles(data: Uint8Array): ExportedProject {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(data);
  } catch {
    throw new Error("無法解讀沙盒包裹（.sam 應為 ZIP 格式）");
  }

  const allPaths = Object.keys(unzipped).filter(
    p => !p.endsWith("/") && !p.includes("__MACOSX")
  );
  if (allPaths.length === 0) {
    throw new Error("沙盒包裹內沒有檔案");
  }

  const { prefix } = stripRootPrefix(allPaths);
  const files: FileMap = {};
  const stateEntries: Record<string, Uint8Array> = {};
  let meta: ProjectMeta | null = null;

  for (const full of allPaths) {
    const rel = prefix ? full.slice(prefix.length + 1) : full;
    if (!rel) continue;
    let path: string;
    try {
      path = normalizeProjectPath(rel);
    } catch {
      continue;
    }
    const bytes = unzipped[full]!;
    if (path === META_FILENAME || path === LEGACY_META_FILENAME) {
      try {
        const parsed = JSON.parse(strFromU8(bytes)) as ProjectMeta;
        // Host ledger hints only — never SAM tool declarations (DEC-024).
        delete parsed.toolKinds;
        delete parsed.toolGlobs;
        meta = parsed;
      } catch {
        /* ignore bad meta */
      }
      continue;
    }
    if (isStatePath(path)) {
      stateEntries[path] = bytes;
      continue;
    }
    files[path] = bytesToFileContent(path, bytes);
  }

  if (Object.keys(files).length === 0) {
    throw new Error("沙盒包裹內沒有可匯入的沙盒檔");
  }

  const entry = pickEntry(files, meta?.entry);
  const id = meta?.id || `import-${Date.now().toString(36)}`;
  const name = meta?.name || prefix || "imported-project";
  const resolved = defaultMeta(id, name, {
    ...(meta ?? {}),
    id,
    name,
    entry,
    toolKinds: undefined,
    toolGlobs: undefined,
  });

  const state = zipEntriesToStateBundle(stateEntries);

  return { meta: resolved, files, state };
}

export function downloadBlob(filename: string, data: Uint8Array): void {
  const name = /\.(sam|zip)$/i.test(filename)
    ? filename
    : withSamExtension(filename);
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
