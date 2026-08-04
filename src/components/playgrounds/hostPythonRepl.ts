/**
 * Pure helpers for the Playgrounds human Python REPL panel.
 * No Worker / Pyodide — safe for Vitest.
 */

import { normalizeProjectPath } from "./pathUtils";

export const REPL_PRIMARY_PROMPT = ">>> ";
export const REPL_CONTINUATION_PROMPT = "... ";
/** Pyodide FS root where work-project `.py` files are synced for `%run`. */
export const REPL_PROJECT_FS_ROOT = "/home/pyodide/project";

export type ReplPrompt =
  typeof REPL_PRIMARY_PROMPT | typeof REPL_CONTINUATION_PROMPT;

export interface HostPythonReplResult {
  /** Incomplete statement — keep buffering; show continuation prompt. */
  incomplete: boolean;
  prompt: ReplPrompt;
  stdout: string;
  stderr: string;
  /** Stringified last expression when available. */
  result?: string;
  /** Syntax / runtime error message (also may appear in stderr). */
  error?: string;
  /** OPFS paths written after `%run` with projectId. */
  changedPaths?: string[];
}

/** Blank Enter at primary prompt: re-prompt only, do not send to interpreter. */
export function isBlankPrimaryLine(buffer: string, line: string): boolean {
  return !buffer && !line.trim();
}

export function formatReplBanner(
  version: string,
  packages: readonly string[]
): string {
  return [
    `遊樂場 Python REPL · Pyodide ${version}`,
    "非 Linux shell；與總管 HOST.runPython 共用解譯器。",
    `允許套件：${packages.join(", ")}`,
    "安裝：%pip numpy  或  %pip install numpy pandas",
    "執行沙盒腳本：%run path/to/script.py（從 OPFS 讀寫；大檔不需載入 File list）",
    "亦可直接 import 允許套件；Enter 送出。",
  ].join("\n");
}

/** Append a line to the REPL source buffer (always ends with newline). */
export function appendReplLine(buffer: string, line: string): string {
  return `${buffer}${line}\n`;
}

export function isPythonScriptPath(path: string): boolean {
  return path.toLowerCase().endsWith(".py");
}

export type PipMagicParse =
  | { kind: "none" }
  | { kind: "usage" }
  | { kind: "packages"; names: string[] }
  | { kind: "error"; message: string };

/**
 * Parse `%pip` / `%pip install …` at the primary prompt.
 * Returns `none` when the line is ordinary Python.
 */
export function parsePipMagic(line: string): PipMagicParse {
  const trimmed = line.trim();
  if (!trimmed.startsWith("%pip")) return { kind: "none" };
  const rest = trimmed.slice("%pip".length).trim();
  if (!rest) return { kind: "usage" };
  const withoutInstall = rest.replace(/^install\b/iu, "").trim();
  if (!withoutInstall) return { kind: "usage" };
  const names = withoutInstall
    .split(/[\s,]+/u)
    .map(s => s.trim())
    .filter(Boolean);
  if (!names.length) return { kind: "usage" };
  for (const name of names) {
    if (!/^[a-zA-Z][\w.-]*$/u.test(name)) {
      return {
        kind: "error",
        message: `無效套件名稱「${name}」。用法：%pip install numpy`,
      };
    }
  }
  return { kind: "packages", names };
}

export type RunMagicParse =
  | { kind: "none" }
  | { kind: "usage" }
  | { kind: "path"; path: string }
  | { kind: "error"; message: string };

/** Parse `%run path/to/script.py`. */
export function parseRunMagic(line: string): RunMagicParse {
  const trimmed = line.trim();
  if (!trimmed.startsWith("%run")) return { kind: "none" };
  const rest = trimmed.slice("%run".length).trim();
  if (!rest) return { kind: "usage" };
  // Single path; strip optional quotes.
  const m = rest.match(/^["'](.+)["']\s*$/u) || rest.match(/^(\S+)\s*$/u);
  if (!m?.[1]) {
    return {
      kind: "error",
      message: "用法：%run path/to/script.py",
    };
  }
  return { kind: "path", path: m[1] };
}

export type ResolveScriptResult =
  { ok: true; path: string; code: string } | { ok: false; error: string };

/** Resolve a `.py` path against a map of project text files (normalized keys). */
export function resolveProjectScript(
  projectFiles: Record<string, string>,
  rawPath: string
): ResolveScriptResult {
  let path: string;
  try {
    path = normalizeProjectPath(rawPath.replace(/^\/+/u, ""));
  } catch {
    return { ok: false, error: `路徑無效：${rawPath}` };
  }
  if (!isPythonScriptPath(path)) {
    return { ok: false, error: `只支援 .py 腳本：${path}` };
  }
  const code = projectFiles[path];
  if (code === undefined) {
    const available = Object.keys(projectFiles).sort();
    const hint =
      available.length > 0
        ? `（沙盒內有：${available.slice(0, 8).join(", ")}${available.length > 8 ? "…" : ""}）`
        : "（目前工作沙盒沒有 .py 檔）";
    return { ok: false, error: `找不到檔案：${path} ${hint}` };
  }
  return { ok: true, path, code };
}
