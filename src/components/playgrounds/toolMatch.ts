/**
 * Tool discovery: match file paths to Tool SAM projects (DEC-022 Phase 6).
 */

import type { ProjectMeta } from "./projectTypes";

export const TOOL_PREFS_KEY = "playgrounds-tool-prefs-v1";

export interface ToolPrefs {
  /** Last tool project id used for a file extension (no leading dot). */
  byExt: Record<string, string>;
  /** Last tool project id used for an exact path. */
  byPath: Record<string, string>;
  lastToolId?: string;
}

export interface RankedTool {
  meta: ProjectMeta;
  score: number;
  reasons: string[];
}

/** Default globs for the text-tool starter. */
export const TEXT_TOOL_GLOBS = [
  "*.md",
  "*.txt",
  "*.json",
  "*.jsonc",
  "*.csv",
  "*.tsv",
  "*.yml",
  "*.yaml",
  "*.toml",
  "*.xml",
  "*.html",
  "*.htm",
  "*.css",
  "*.scss",
  "*.js",
  "*.mjs",
  "*.cjs",
  "*.ts",
  "*.tsx",
  "*.jsx",
  "*.svelte",
  "*.vue",
  "*.py",
  "*.sh",
  "*.env",
  "*.svg",
  "Dockerfile",
  "Makefile",
  "README*",
  "LICENSE*",
];

export const TEXT_TOOL_KINDS = ["editor:text"] as const;

export function emptyToolPrefs(): ToolPrefs {
  return { byExt: {}, byPath: {} };
}

export function readToolPrefs(
  storage: Pick<Storage, "getItem"> | null | undefined = globalThis.localStorage
): ToolPrefs {
  try {
    const raw = storage?.getItem(TOOL_PREFS_KEY);
    if (!raw) return emptyToolPrefs();
    const parsed = JSON.parse(raw) as Partial<ToolPrefs>;
    return {
      byExt:
        parsed.byExt && typeof parsed.byExt === "object" ? parsed.byExt : {},
      byPath:
        parsed.byPath && typeof parsed.byPath === "object" ? parsed.byPath : {},
      lastToolId:
        typeof parsed.lastToolId === "string" ? parsed.lastToolId : undefined,
    };
  } catch {
    return emptyToolPrefs();
  }
}

export function writeToolPrefs(
  prefs: ToolPrefs,
  storage: Pick<Storage, "setItem"> | null | undefined = globalThis.localStorage
): void {
  try {
    storage?.setItem(TOOL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}

export function rememberToolForPath(
  toolSandboxId: string,
  path: string,
  storage:
    | Pick<Storage, "getItem" | "setItem">
    | null
    | undefined = globalThis.localStorage
): ToolPrefs {
  const prefs = readToolPrefs(storage);
  const ext = fileExtension(path);
  if (ext) prefs.byExt[ext] = toolSandboxId;
  prefs.byPath[path] = toolSandboxId;
  prefs.lastToolId = toolSandboxId;
  writeToolPrefs(prefs, storage);
  return prefs;
}

export function fileExtension(path: string): string {
  const base = path.split("/").pop() ?? path;
  const i = base.lastIndexOf(".");
  if (i <= 0 || i === base.length - 1) return "";
  return base.slice(i + 1).toLowerCase();
}

/**
 * Simple glob: `*` within a single path segment (or whole basename).
 * `*.md` matches `foo.md` / `dir/foo.md`; `README*` matches `README` / `README.md`.
 */
export function matchToolGlob(path: string, glob: string): boolean {
  const g = glob.trim();
  if (!g) return false;
  const base = path.split("/").pop() ?? path;
  if (g === "*") return true;
  if (g.startsWith("*.") && !g.slice(2).includes("*") && !g.includes("/")) {
    const ext = g.slice(2).toLowerCase();
    return fileExtension(path) === ext;
  }
  // Filename pattern against basename only (no `/` in glob).
  if (!g.includes("/")) {
    return matchStarPattern(base, g);
  }
  return matchStarPattern(path, g);
}

function matchStarPattern(value: string, pattern: string): boolean {
  // Escape regex specials except *; case-insensitive for names like README*
  const parts = pattern
    .split("*")
    .map(p => p.replace(/[.+?^${}()|[\]\\]/gu, "\\$&"));
  const re = new RegExp(`^${parts.join(".*")}$`, "iu");
  return re.test(value);
}

export function pathMatchesToolGlobs(
  path: string,
  globs: string[] | undefined
): boolean {
  if (!globs?.length) return false;
  return globs.some(g => matchToolGlob(path, g));
}

export function isToolProject(
  meta: Pick<ProjectMeta, "toolKinds" | "toolGlobs"> | null | undefined
): boolean {
  return Boolean(meta?.toolKinds?.length || meta?.toolGlobs?.length);
}

/**
 * Score a tool for opening `path`. Higher is better.
 * 0 = no signal (still listable as fallback).
 */
export function scoreToolForPath(
  meta: ProjectMeta,
  path: string,
  prefs: ToolPrefs = emptyToolPrefs()
): RankedTool {
  const reasons: string[] = [];
  let score = 0;
  const hasDecl = isToolProject(meta);

  if (pathMatchesToolGlobs(path, meta.toolGlobs)) {
    score += 100;
    // Narrower declarations beat broad text tools that also list the same ext.
    const n = meta.toolGlobs?.length ?? 1;
    const specificity = Math.min(50, Math.round(80 / Math.max(1, n)));
    score += specificity;
    reasons.push(n <= 3 ? "符合檔案類型（專用）" : "符合檔案類型");
  } else if (hasDecl && meta.toolGlobs?.length) {
    // Declared globs but no match — demote below undeclared
    score -= 20;
  }

  if (prefs.byPath[path] === meta.id) {
    score += 50;
    reasons.push("曾用於此檔");
  }

  const ext = fileExtension(path);
  if (ext && prefs.byExt[ext] === meta.id) {
    score += 30;
    reasons.push("曾用於此副檔名");
  }

  if (prefs.lastToolId === meta.id) {
    score += 5;
    reasons.push("最近使用");
  }

  if (meta.toolKinds?.includes("editor:text") && !ext && path) {
    // no-op; kinds alone don't score without globs/history
  }

  if (hasDecl && score === 0) {
    score = 1;
    reasons.push("標示為工具");
  }

  return { meta, score, reasons };
}

/** Rank candidates for a path; highest score first. Ties by name. */
export function rankToolsForPath(
  candidates: ProjectMeta[],
  path: string,
  prefs: ToolPrefs = emptyToolPrefs()
): RankedTool[] {
  const ranked = candidates.map(m => scoreToolForPath(m, path, prefs));
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.meta.name.localeCompare(b.meta.name, "zh-Hant");
  });
  return ranked;
}

/**
 * Best tool to open without asking, when confidence is high enough.
 * Requires a positive glob/history signal (score >= 30).
 */
export function pickBestTool(
  candidates: ProjectMeta[],
  path: string,
  prefs: ToolPrefs = emptyToolPrefs()
): RankedTool | null {
  if (!path.trim()) return null;
  const ranked = rankToolsForPath(candidates, path, prefs);
  const top = ranked[0];
  if (!top || top.score < 30) return null;
  // If second is very close, prefer dialog (ambiguous).
  const second = ranked[1];
  if (second && second.score >= top.score - 5 && second.score >= 30) {
    return null;
  }
  return top;
}
