/**
 * Text search over a project FileMap for HOST.search.
 */

import { isGitPath } from "./gitPathUtils";
import {
  isBinaryContent,
  type FileContent,
  type FileMap,
} from "./projectTypes";
import { fileContentToUtf8 } from "./hostBridge";
import { normalizeProjectPath } from "./pathUtils";

export interface HostSearchMatch {
  path: string;
  line: number;
  text: string;
}

export interface HostSearchOptions {
  query: string;
  glob?: string;
  maxResults?: number;
  /** When true, include `.git` tree (default excludes — DEC-051 §8.4). */
  includeGit?: boolean;
}

const DEFAULT_MAX = 50;
const HARD_MAX = 200;
const LINE_MAX = 200;

/** Convert a simple glob (`*`, `?`, `**`) to a RegExp matching full paths. */
export function globToRegExp(glob: string): RegExp {
  const normalized = glob.trim().replace(/\\/gu, "/");
  let source = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    if (ch === "*" && normalized[i + 1] === "*") {
      source += ".*";
      i += 1;
      if (normalized[i + 1] === "/") i += 1;
    } else if (ch === "*") {
      source += "[^/]*";
    } else if (ch === "?") {
      source += "[^/]";
    } else if ("\\.()+^${}|[]".includes(ch)) {
      source += `\\${ch}`;
    } else {
      source += ch;
    }
  }
  source += "$";
  return new RegExp(source, "u");
}

export function pathMatchesGlob(path: string, glob?: string): boolean {
  if (!glob || !glob.trim()) return true;
  try {
    return globToRegExp(glob).test(normalizeProjectPath(path));
  } catch {
    return false;
  }
}

export function searchFileMap(
  files: FileMap,
  options: HostSearchOptions
): HostSearchMatch[] {
  const query = options.query;
  if (!query) return [];
  const maxResults = Math.min(
    Math.max(options.maxResults ?? DEFAULT_MAX, 1),
    HARD_MAX
  );
  const matches: HostSearchMatch[] = [];
  const paths = Object.keys(files).sort((a, b) => a.localeCompare(b, "en"));

  for (const path of paths) {
    if (!options.includeGit && isGitPath(path)) continue;
    if (!pathMatchesGlob(path, options.glob)) continue;
    const content: FileContent | undefined = files[path];
    if (content === undefined || isBinaryContent(content)) continue;
    const text = fileContentToUtf8(content);
    const lines = text.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
      const lineText = lines[i]!;
      if (!lineText.includes(query)) continue;
      matches.push({
        path,
        line: i + 1,
        text:
          lineText.length > LINE_MAX
            ? `${lineText.slice(0, LINE_MAX)}…`
            : lineText,
      });
      if (matches.length >= maxResults) return matches;
    }
  }
  return matches;
}
