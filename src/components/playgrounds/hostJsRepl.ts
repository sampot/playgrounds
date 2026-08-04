/**
 * Pure helpers for the Playgrounds human JavaScript REPL panel.
 * No Worker / DOM — safe for Vitest.
 */

import { normalizeProjectPath, parentDir } from "./pathUtils";

export const JS_REPL_PRIMARY_PROMPT = "> ";
export const JS_REPL_CONTINUATION_PROMPT = "... ";

export type JsReplPrompt =
  typeof JS_REPL_PRIMARY_PROMPT | typeof JS_REPL_CONTINUATION_PROMPT;

export interface HostJsReplResult {
  incomplete: boolean;
  prompt: JsReplPrompt;
  stdout: string;
  stderr: string;
  result?: string;
  error?: string;
}

export function formatJsReplBanner(): string {
  return [
    "遊樂場 JavaScript REPL",
    "非 Node／無 npm；與畫布 runtime 分離（隔離 Worker）。",
    "執行沙盒腳本：%run path/to/script.js（從 OPFS 讀取；大檔不需載入 File list）",
    '同沙盒其它檔：load("lib/util.js")；相對 import 會解析到沙盒 OPFS。',
    "Enter 送出；括號未閉合會出現 ... 提示。",
  ].join("\n");
}

export function isJsScriptPath(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")
  );
}

export type JsRunMagicParse =
  | { kind: "none" }
  | { kind: "usage" }
  | { kind: "path"; path: string }
  | { kind: "error"; message: string };

export function parseJsRunMagic(line: string): JsRunMagicParse {
  const trimmed = line.trim();
  if (!trimmed.startsWith("%run")) return { kind: "none" };
  const rest = trimmed.slice("%run".length).trim();
  if (!rest) return { kind: "usage" };
  const m = rest.match(/^["'](.+)["']\s*$/u) || rest.match(/^(\S+)\s*$/u);
  if (!m?.[1]) {
    return { kind: "error", message: "用法：%run path/to/script.js" };
  }
  return { kind: "path", path: m[1] };
}

export type ResolveJsScriptResult =
  { ok: true; path: string; code: string } | { ok: false; error: string };

export function resolveProjectJsScript(
  projectFiles: Record<string, string>,
  rawPath: string
): ResolveJsScriptResult {
  let path: string;
  try {
    path = normalizeProjectPath(rawPath.replace(/^\/+/u, ""));
  } catch {
    return { ok: false, error: `路徑無效：${rawPath}` };
  }
  if (!isJsScriptPath(path)) {
    return { ok: false, error: `只支援 .js／.mjs／.cjs：${path}` };
  }
  const code = projectFiles[path];
  if (code === undefined) {
    const available = Object.keys(projectFiles).sort();
    const hint =
      available.length > 0
        ? `（沙盒內有：${available.slice(0, 8).join(", ")}${available.length > 8 ? "…" : ""}）`
        : "（目前工作沙盒沒有 JS 腳本）";
    return { ok: false, error: `找不到檔案：${path} ${hint}` };
  }
  return { ok: true, path, code };
}

/** Rough completeness for multi-line input (brackets + Function parse). */
export function isJsSourceComplete(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return true;
  if (!bracketsBalanced(source)) return false;
  try {
    // Statement form
    // eslint-disable-next-line no-new-func -- completeness probe only
    new Function(source);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unexpected end of input|expected/iu.test(msg)) return false;
    // Other syntax errors: treat as complete so the runner can surface the error.
    return true;
  }
}

function bracketsBalanced(source: string): boolean {
  let brace = 0;
  let paren = 0;
  let bracket = 0;
  let quote: '"' | "'" | "`" | null = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
    if (brace < 0 || paren < 0 || bracket < 0) return true; // let runner error
  }
  return brace === 0 && paren === 0 && bracket === 0 && quote === null;
}

export function stringifyJsResult(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "function") {
    return `[Function${value.name ? ` ${value.name}` : ""}]`;
  }
  if (value && typeof value === "object") {
    const tag = Object.prototype.toString.call(value);
    if (tag === "[object Module]") {
      const keys = Reflect.ownKeys(value as object).map(String);
      return `Module { ${keys.join(", ")} }`;
    }
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** True when source uses ESM import/export (needs blob import, not Function). */
export function looksLikeEsModule(code: string): boolean {
  return /(?:^|[\n;])\s*(?:import|export)\b/u.test(code);
}

/** Resolve `./` / `../` specifiers against an importer path. */
export function resolveJsImportPath(
  fromPath: string,
  specifier: string
): string | null {
  const spec = specifier.trim();
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  try {
    const base = parentDir(fromPath);
    return normalizeProjectPath(base ? `${base}/${spec}` : spec);
  } catch {
    return null;
  }
}

/**
 * Rewrite relative import/export specifiers to absolute URLs via `urlForPath`.
 */
export function rewriteRelativeJsImports(
  code: string,
  fromPath: string,
  urlForPath: (projectPath: string) => string
): string {
  return code.replace(
    /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.[^'"]+)\2/gu,
    (full, prefix: string, quote: string, spec: string) => {
      const resolved = resolveJsImportPath(fromPath, spec);
      if (!resolved) return full;
      try {
        const url = urlForPath(resolved);
        return `${prefix}${quote}${url}${quote}`;
      } catch {
        return full;
      }
    }
  );
}
