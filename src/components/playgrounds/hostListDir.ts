/**
 * Truncated directory listing for HOST.listDir (DEC-027).
 */

import type { FileMap } from "./projectTypes";
import { basename, normalizeProjectPath, parentDir } from "./pathUtils";

export const LIST_DIR_DEFAULT_MAX = 200;
export const LIST_DIR_HARD_MAX = 500;

export type ListDirOptions = {
  /** Project-relative directory; omit or "" = root. */
  prefix?: string;
  /** Max depth relative to prefix; default 1. Must be >= 1. */
  depth?: number;
  /** Max entries returned; default 200; hard cap 500. */
  maxEntries?: number;
};

export type ListDirEntry = {
  path: string;
  kind: "file" | "dir";
  /** Dir has descendants beyond the requested depth (relative to list prefix). */
  truncatedChildren?: boolean;
};

export type ListDirResult = {
  entries: ListDirEntry[];
  truncated: boolean;
  prefix: string;
  depth: number;
};

function joinUnderPrefix(prefix: string, rel: string): string {
  if (!prefix) return rel;
  if (!rel) return prefix;
  return `${prefix}/${rel}`;
}

function relativeToPrefix(path: string, prefix: string): string | null {
  if (!prefix) return path || null;
  if (path === prefix) return null;
  const head = `${prefix}/`;
  if (!path.startsWith(head)) return null;
  return path.slice(head.length);
}

/** Collect file paths + directory paths (parents of files + extra empty dirs). */
export function collectProjectPathKinds(
  files: FileMap,
  extraDirs: Iterable<string> = []
): Map<string, "file" | "dir"> {
  const kinds = new Map<string, "file" | "dir">();

  const addDir = (raw: string): void => {
    try {
      let d = normalizeProjectPath(raw);
      while (d) {
        if (kinds.get(d) !== "file") kinds.set(d, "dir");
        d = parentDir(d);
      }
    } catch {
      /* skip */
    }
  };

  for (const raw of Object.keys(files)) {
    try {
      const path = normalizeProjectPath(raw);
      if (!path) continue;
      kinds.set(path, "file");
      addDir(parentDir(path));
    } catch {
      /* skip */
    }
  }

  for (const raw of extraDirs) {
    addDir(raw);
  }

  return kinds;
}

function dirHasUnexpandedDescendant(
  kinds: Map<string, "file" | "dir">,
  dirPath: string,
  listPrefix: string,
  depth: number
): boolean {
  const head = `${dirPath}/`;
  for (const p of kinds.keys()) {
    if (!p.startsWith(head)) continue;
    const rel = relativeToPrefix(p, listPrefix);
    if (rel == null) continue;
    if (rel.split("/").filter(Boolean).length > depth) return true;
  }
  return false;
}

/**
 * List project paths under prefix up to depth.
 * Throws Error with message suitable for HostBridgeError bad_path on invalid input.
 */
export function listDirFromFileMap(
  files: FileMap,
  options: ListDirOptions = {},
  extraDirs: Iterable<string> = []
): ListDirResult {
  let prefix = "";
  if (options.prefix != null && String(options.prefix).trim() !== "") {
    try {
      prefix = normalizeProjectPath(String(options.prefix));
    } catch {
      throw new Error("路徑無效");
    }
  }

  const depth = options.depth ?? 1;
  if (!Number.isFinite(depth) || depth < 1 || !Number.isInteger(depth)) {
    throw new Error("depth 必須為 >= 1 的整數");
  }

  const maxEntries = Math.min(
    Math.max(options.maxEntries ?? LIST_DIR_DEFAULT_MAX, 1),
    LIST_DIR_HARD_MAX
  );

  const kinds = collectProjectPathKinds(files, extraDirs);
  const byPath = new Map<string, { path: string; kind: "file" | "dir" }>();

  for (const [path, kind] of kinds) {
    const rel = relativeToPrefix(path, prefix);
    if (rel == null) continue;
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    const levels = Math.min(parts.length, depth);
    for (let i = 1; i <= levels; i++) {
      const entryRel = parts.slice(0, i).join("/");
      const entryPath = joinUnderPrefix(prefix, entryRel);
      const isLeafOfPath = i === parts.length;
      const hitDepthCap = i === depth && parts.length > depth;

      let entryKind: "file" | "dir" = "dir";
      if (isLeafOfPath && !hitDepthCap) {
        entryKind = kind;
      }

      const prev = byPath.get(entryPath);
      if (!prev) {
        byPath.set(entryPath, { path: entryPath, kind: entryKind });
      } else if (prev.kind !== "file" && entryKind === "file") {
        byPath.set(entryPath, { path: entryPath, kind: "file" });
      }
    }
  }

  const dirs: ListDirEntry[] = [];
  const fileEntries: ListDirEntry[] = [];
  for (const base of byPath.values()) {
    if (base.kind === "dir") {
      const truncatedChildren = dirHasUnexpandedDescendant(
        kinds,
        base.path,
        prefix,
        depth
      );
      dirs.push({
        path: base.path,
        kind: "dir",
        ...(truncatedChildren ? { truncatedChildren: true } : {}),
      });
    } else {
      fileEntries.push({ path: base.path, kind: "file" });
    }
  }
  const byName = (a: ListDirEntry, b: ListDirEntry) =>
    basename(a.path).localeCompare(basename(b.path), "en");
  dirs.sort(byName);
  fileEntries.sort(byName);
  const sorted = [...dirs, ...fileEntries];

  const truncated = sorted.length > maxEntries;
  return {
    entries: truncated ? sorted.slice(0, maxEntries) : sorted,
    truncated,
    prefix,
    depth,
  };
}
