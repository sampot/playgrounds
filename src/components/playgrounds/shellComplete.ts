/**
 * Tab-completion helpers for Playgrounds Shell (commands + project paths).
 */

import { normalizeProjectPath, sortProjectPaths } from "./pathUtils";
import type { FileMap } from "./projectTypes";

export type ShellCompleteResult =
  | { kind: "none" }
  | { kind: "apply"; line: string; cursor: number }
  | { kind: "list"; matches: string[]; line: string; cursor: number };

function commonPrefix(items: string[]): string {
  if (!items.length) return "";
  let prefix = items[0]!;
  for (let i = 1; i < items.length; i++) {
    const s = items[i]!;
    let j = 0;
    while (j < prefix.length && j < s.length && prefix[j] === s[j]) j++;
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  return prefix;
}

/** Token under cursor: [start, end) in line; end defaults to cursor. */
export function tokenAtCursor(
  line: string,
  cursor: number
): { start: number; end: number; token: string } {
  const c = Math.max(0, Math.min(cursor, line.length));
  let start = c;
  while (start > 0 && !/\s/.test(line[start - 1]!)) start--;
  let end = c;
  while (end < line.length && !/\s/.test(line[end]!)) end++;
  return { start, end, token: line.slice(start, end) };
}

function isFirstToken(line: string, start: number): boolean {
  return !line.slice(0, start).trim();
}

/** Immediate children of cwd (dirs end with `/`). */
export function listPathEntries(files: FileMap, cwd: string): string[] {
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
      const rest = norm.slice(prefix.length);
      const seg = rest.split("/")[0];
      if (!seg) continue;
      names.add(rest.includes("/") ? `${seg}/` : seg);
    } else {
      const seg = norm.split("/")[0];
      if (!seg) continue;
      names.add(norm.includes("/") ? `${seg}/` : seg);
    }
  }
  return sortProjectPaths([...names]);
}

function completePath(partial: string, cwd: string, files: FileMap): string[] {
  let dirPart = "";
  let namePart = partial;
  const slash = partial.lastIndexOf("/");
  if (slash >= 0) {
    dirPart = partial.slice(0, slash + 1);
    namePart = partial.slice(slash + 1);
  }

  let baseCwd = cwd;
  if (dirPart.startsWith("/")) {
    const rel = dirPart.replace(/^\/+/u, "").replace(/\/$/u, "");
    baseCwd = rel;
  } else if (dirPart) {
    const joined = cwd
      ? `${cwd}/${dirPart.replace(/\/$/u, "")}`
      : dirPart.replace(/\/$/u, "");
    try {
      baseCwd = joined ? normalizeProjectPath(joined) : "";
    } catch {
      return [];
    }
  }

  const entries = listPathEntries(files, baseCwd);
  const matches = entries.filter(e => e.startsWith(namePart));
  return matches.map(m => `${dirPart}${m}`);
}

export function completeShellLine(options: {
  line: string;
  cursor: number;
  cwd: string;
  files: FileMap;
  commands: string[];
}): ShellCompleteResult {
  const { line, cursor, cwd, files, commands } = options;
  const { start, token } = tokenAtCursor(line, cursor);

  let matches: string[];
  if (isFirstToken(line, start) && !token.includes("/")) {
    matches = commands.filter(c => c.startsWith(token)).sort();
  } else {
    matches = completePath(token, cwd, files);
  }

  if (!matches.length) return { kind: "none" };

  if (matches.length === 1) {
    const m = matches[0]!;
    const insert = m.endsWith("/") ? m : `${m} `;
    const next =
      line.slice(0, start) + insert + line.slice(start + token.length);
    return { kind: "apply", line: next, cursor: start + insert.length };
  }

  const shared = commonPrefix(matches);
  if (shared.length > token.length) {
    const next =
      line.slice(0, start) + shared + line.slice(start + token.length);
    return { kind: "apply", line: next, cursor: start + shared.length };
  }

  return { kind: "list", matches, line, cursor };
}
