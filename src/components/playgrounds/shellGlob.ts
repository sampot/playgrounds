/**
 * Pathname expansion (`*` / `?`) for Playgrounds Shell.
 * Bash-like: unquoted only; no match → leave pattern literal (no nullglob).
 */

import { normalizeProjectPath, sortProjectPaths } from "./pathUtils";
import type { FileMap } from "./projectTypes";

export type ShellToken = {
  text: string;
  /** True if the token included any quotes (no glob expansion). */
  quoted: boolean;
};

export function hasGlobMeta(text: string): boolean {
  return /[*?]/u.test(text);
}

/** Convert a single path segment glob to RegExp source (no `/` in pattern). */
function segmentGlobToRegExpSource(pattern: string): string {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (/[.+^${}()|[\]\\]/u.test(c)) re += `\\${c}`;
    else re += c;
  }
  return re;
}

/** Glob pattern → anchored RegExp (`*` / `?` do not cross `/`). */
export function globToRegExp(pattern: string): RegExp {
  const parts = pattern.split("/");
  const body = parts.map(segmentGlobToRegExpSource).join("/");
  return new RegExp(`^${body}$`, "u");
}

/**
 * Candidate paths relative to `cwd` (no leading slash).
 * Includes files and implied directories (no trailing slash).
 */
export function listGlobCandidates(
  files: FileMap,
  cwd: string,
  recursive: boolean
): string[] {
  const prefix = cwd ? `${cwd}/` : "";
  const names = new Set<string>();

  for (const path of Object.keys(files)) {
    let norm: string;
    try {
      norm = normalizeProjectPath(path);
    } catch {
      continue;
    }
    if (cwd) {
      if (norm === cwd) continue;
      if (!norm.startsWith(prefix)) continue;
      const rel = norm.slice(prefix.length);
      if (!recursive) {
        const seg = rel.split("/")[0];
        if (seg) names.add(seg);
      } else {
        const parts = rel.split("/").filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          names.add(parts.slice(0, i).join("/"));
        }
      }
    } else if (!recursive) {
      const seg = norm.split("/")[0];
      if (seg) names.add(seg);
    } else {
      const parts = norm.split("/").filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        names.add(parts.slice(0, i).join("/"));
      }
    }
  }

  return sortProjectPaths([...names]);
}

/**
 * Expand one pattern relative to session cwd.
 * Leading `/` means from project root. Returns paths relative to cwd
 * when pattern is relative; root-absolute patterns return project-relative paths.
 */
export function matchShellGlob(
  pattern: string,
  cwd: string,
  files: FileMap
): string[] {
  const raw = pattern.trim();
  if (!raw || !hasGlobMeta(raw)) return [];

  const fromRoot = raw.startsWith("/");
  const pat = fromRoot ? raw.replace(/^\/+/u, "") : raw;
  if (!pat || !hasGlobMeta(pat)) return [];

  const recursive = pat.includes("/");
  const searchCwd = fromRoot ? "" : cwd;
  const candidates = listGlobCandidates(files, searchCwd, recursive);
  const re = globToRegExp(pat);
  const matched = candidates.filter(c => re.test(c));

  if (fromRoot) {
    // Keep project-relative (no leading slash) for redirects / argv
    return sortProjectPaths(matched);
  }
  return sortProjectPaths(matched);
}

/** Expand globs in unquoted tokens; quoted / non-glob tokens unchanged. */
export function expandGlobsInTokens(
  tokens: ShellToken[],
  cwd: string,
  files: FileMap
): string[] {
  const out: string[] = [];
  for (const tok of tokens) {
    if (tok.quoted || !hasGlobMeta(tok.text)) {
      out.push(tok.text);
      continue;
    }
    const matches = matchShellGlob(tok.text, cwd, files);
    if (matches.length === 0) {
      out.push(tok.text);
    } else {
      out.push(...matches);
    }
  }
  return out;
}
