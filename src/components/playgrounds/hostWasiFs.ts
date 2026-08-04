/**
 * Serialize FileMap ↔ nested WASI preopen tree helpers (pure; used by worker + tests).
 */

import type { FileContent, FileMap } from "./projectTypes";
import { normalizeProjectPath } from "./pathUtils";

export interface WasiFileEntry {
  path: string;
  bytes: Uint8Array;
}

/** Normalize cwd relative to project root; empty string means root. */
export function normalizeWasiCwd(cwd: string | undefined): string {
  const raw = (cwd ?? ".").trim() || ".";
  if (raw === "." || raw === "/" || raw === "./") return "";
  try {
    return normalizeProjectPath(raw);
  } catch {
    throw new Error("bad_path");
  }
}

/** Slice project files to a cwd subtree; paths become relative to cwd. */
export function sliceFilesForCwd(files: FileMap, cwd: string): FileMap {
  if (!cwd) return { ...files };
  const prefix = `${cwd}/`;
  const out: FileMap = {};
  for (const [path, content] of Object.entries(files)) {
    let norm: string;
    try {
      norm = normalizeProjectPath(path);
    } catch {
      continue;
    }
    if (norm === cwd) continue;
    if (!norm.startsWith(prefix)) continue;
    out[norm.slice(prefix.length)] = content;
  }
  return out;
}

/** Rejoin cwd-relative paths back onto the project root. */
export function joinFilesWithCwd(files: FileMap, cwd: string): FileMap {
  if (!cwd) return { ...files };
  const out: FileMap = {};
  for (const [path, content] of Object.entries(files)) {
    let norm: string;
    try {
      norm = normalizeProjectPath(path);
    } catch {
      continue;
    }
    out[normalizeProjectPath(`${cwd}/${norm}`)] = content;
  }
  return out;
}

export function fileContentToBytes(content: FileContent): Uint8Array {
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  return content;
}

export function bytesToFileContent(bytes: Uint8Array): FileContent {
  // Prefer UTF-8 text when valid & printable-ish; else keep binary.
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.includes("\0")) return text;
  } catch {
    /* binary */
  }
  return bytes.slice();
}

export function fileMapToEntries(files: FileMap): WasiFileEntry[] {
  const out: WasiFileEntry[] = [];
  for (const [raw, content] of Object.entries(files)) {
    let path: string;
    try {
      path = normalizeProjectPath(raw);
    } catch {
      continue;
    }
    out.push({ path, bytes: fileContentToBytes(content) });
  }
  return out;
}

export function entriesToFileMap(entries: WasiFileEntry[]): FileMap {
  const out: FileMap = {};
  for (const { path, bytes } of entries) {
    try {
      out[normalizeProjectPath(path)] = bytesToFileContent(bytes);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Diff: paths where bytes differ or are new (not deletions). */
export function diffFileMaps(before: FileMap, after: FileMap): FileMap {
  const changed: FileMap = {};
  for (const [path, content] of Object.entries(after)) {
    const prev = before[path];
    if (prev === undefined) {
      changed[path] = content;
      continue;
    }
    const a = fileContentToBytes(content);
    const b = fileContentToBytes(prev);
    if (a.byteLength !== b.byteLength) {
      changed[path] = content;
      continue;
    }
    for (let i = 0; i < a.byteLength; i++) {
      if (a[i] !== b[i]) {
        changed[path] = content;
        break;
      }
    }
  }
  return changed;
}

export function truncateUtf8(
  text: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}
