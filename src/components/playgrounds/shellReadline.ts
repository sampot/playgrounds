/**
 * Line-oriented Shell dispatcher for Playgrounds WASI Shell (not a real Bash).
 */

import { listHostCmds } from "./hostWasi";
import { normalizeProjectPath, sortProjectPaths } from "./pathUtils";
import type { FileMap } from "./projectTypes";
import {
  SHELL_MAX_ENV_VARS,
  SHELL_MAX_ENV_VALUE_CHARS,
  expandShellVars,
  formatShellEnv,
  isValidEnvName,
  parseExportAssignment,
  syncShellEnvPwd,
} from "./shellEnv";
import {
  expandGlobsInTokens,
  hasGlobMeta,
  matchShellGlob,
  type ShellToken,
} from "./shellGlob";
import {
  SHELL_MAX_CHAIN_STEPS,
  SHELL_MAX_PIPELINE_STAGES,
  hasRedirects,
  peelRedirectsDetailed,
  splitChainSegments,
  splitPipelineSegments,
  type ShellChainOp,
  type ShellRedirects,
} from "./shellSyntax";
import { SHELL_HOST_CMD_NAMES, isShellHostCmd } from "./wasiPin";

export type { ShellToken };

export const SHELL_PRIMARY_PROMPT = "$ ";
export { SHELL_MAX_CHAIN_STEPS, SHELL_MAX_PIPELINE_STAGES };
export type { ShellChainOp, ShellRedirects };
export { splitPipelineSegments, splitChainSegments };

export const SHELL_BUILTIN_NAMES = [
  "help",
  "clear",
  "cd",
  "pwd",
  "export",
  "unset",
  "env",
] as const;

export type ShellStage = {
  cmd: string;
  args: string[];
  redirects?: ShellRedirects;
};

export type ShellBuiltinResult =
  | {
      kind: "output";
      text: string;
      cwd?: string;
      /** Full session env when mutated. */
      env?: Record<string, string>;
      clear?: boolean;
      /** Defaults to 0 when omitted. */
      exitCode?: number;
      redirects?: ShellRedirects;
    }
  | {
      kind: "run";
      cmd: string;
      args: string[];
      env: Record<string, string>;
      redirects?: ShellRedirects;
    }
  | {
      /** JS-host command (e.g. xargs); not a WASI binary. */
      kind: "host";
      cmd: string;
      args: string[];
      env: Record<string, string>;
      redirects?: ShellRedirects;
    }
  | {
      kind: "pipeline";
      stages: ShellStage[];
      env: Record<string, string>;
      redirects?: ShellRedirects;
    }
  | {
      kind: "chain";
      segments: string[];
      ops: ShellChainOp[];
    }
  | { kind: "noop" };

export type ShellDispatchContext = {
  cwd: string;
  files: FileMap;
  env: Record<string, string>;
  /** Previous command exit status (`$?`). */
  lastExit?: number;
};

const BUILTINS = new Set<string>(SHELL_BUILTIN_NAMES);

/** Strip SGR (color) sequences. */
export function stripSgr(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, "");
}

/**
 * East-Asian-wide code points occupy 2 terminal cells (xterm / wcwidth-style).
 * Used so cursor math matches what xterm.js paints for CJK in prompts.
 */
function isWideCodePoint(code: number): boolean {
  return (
    code >= 0x1100 &&
    (code <= 0x115f ||
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x3fffd))
  );
}

/** Display width in terminal cells (no ANSI); CJK counts as 2. */
export function terminalDisplayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) continue;
    width += isWideCodePoint(code) ? 2 : 1;
  }
  return width;
}

/** Visible prompt columns for cursor math (strip SGR, then cell width). */
export function visiblePromptLength(text: string): number {
  return terminalDisplayWidth(stripSgr(text));
}

function sanitizePromptHost(name: string): string {
  const t = name.trim().replace(/[\r\n\x00]/gu, "") || "project";
  return t.replace(/\s+/gu, "-").slice(0, 48);
}

/**
 * `user@project:~/path$ ` with optional color (exit≠0 → red `$`).
 * Root cwd shows as `~` (HOME=/).
 */
export function formatShellPrompt(options: {
  cwd: string;
  projectName?: string;
  user?: string;
  lastExit?: number;
  color?: boolean;
}): string {
  const user = options.user?.trim() || "playground";
  const host = sanitizePromptHost(options.projectName || "project");
  const path = options.cwd.trim() ? `/${options.cwd.trim()}` : "~";
  const dollar = SHELL_PRIMARY_PROMPT.trimEnd();
  const failed = (options.lastExit ?? 0) !== 0;
  if (!options.color) {
    return `${user}@${host}:${path}${dollar} `;
  }
  const reset = "\x1b[0m";
  const userHost = `\x1b[36m${user}@${host}${reset}`;
  const pathPart = `\x1b[34m${path}${reset}`;
  const tip = failed
    ? `\x1b[31m${dollar}${reset}`
    : `\x1b[32m${dollar}${reset}`;
  return `${userHost}:${pathPart}${tip} `;
}

/**
 * Tokenize with quote tracking (for glob: quoted tokens are not expanded).
 */
export function tokenizeShellLineDetailed(line: string): ShellToken[] {
  const out: ShellToken[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let quoted = false;

  const flush = () => {
    if (cur || quoted) {
      out.push({ text: cur, quoted });
    }
    cur = "";
    quoted = false;
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    cur += ch;
  }
  flush();
  return out;
}

/** Simple tokenize: whitespace split; supports "double" and 'single' quotes. */
export function tokenizeShellLine(line: string): string[] {
  return tokenizeShellLineDetailed(line).map(t => t.text);
}

const ASSIGN_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u;

/** Peel leading `NAME=value` before glob (assignment values stay literal). */
function peelEnvAssignmentsFromTokens(tokens: ShellToken[]): {
  assigns: Record<string, string>;
  rest: ShellToken[];
} {
  const assigns: Record<string, string> = {};
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.quoted) break;
    const m = ASSIGN_RE.exec(t.text);
    if (!m) break;
    const name = m[1]!;
    let value = m[2]!;
    if (value.length > SHELL_MAX_ENV_VALUE_CHARS) {
      value = value.slice(0, SHELL_MAX_ENV_VALUE_CHARS);
    }
    assigns[name] = value;
    i++;
  }
  return { assigns, rest: tokens.slice(i) };
}

function expandRedirectPath(
  path: string,
  quoted: boolean,
  cwd: string,
  files: FileMap
): { path: string } | { error: string } {
  if (quoted || !hasGlobMeta(path)) return { path };
  const matches = matchShellGlob(path, cwd, files);
  if (matches.length === 0) return { path };
  if (matches.length > 1) {
    return { error: `ambiguous redirect：${path}` };
  }
  return { path: matches[0]! };
}

/**
 * Tokenize → peel assigns → peel redirects → glob argv → resolve redirect globs.
 */
function tokenizeAssignsRedirectsAndGlobs(
  segment: string,
  cwd: string,
  files: FileMap
):
  | {
      assigns: Record<string, string>;
      tokens: string[];
      redirects: ShellRedirects;
    }
  | { error: string } {
  const detailed = tokenizeShellLineDetailed(segment);
  const { assigns, rest } = peelEnvAssignmentsFromTokens(detailed);
  const peeled = peelRedirectsDetailed(rest);
  if ("error" in peeled) return peeled;

  const redirects: ShellRedirects = { ...peeled.redirects };
  if (peeled.redirectPaths.stdin) {
    const r = expandRedirectPath(
      peeled.redirectPaths.stdin.path,
      peeled.redirectPaths.stdin.quoted,
      cwd,
      files
    );
    if ("error" in r) return r;
    redirects.stdinPath = r.path;
  }
  if (peeled.redirectPaths.stdout) {
    const r = expandRedirectPath(
      peeled.redirectPaths.stdout.path,
      peeled.redirectPaths.stdout.quoted,
      cwd,
      files
    );
    if ("error" in r) return r;
    redirects.stdoutPath = r.path;
  }

  return {
    assigns,
    tokens: expandGlobsInTokens(peeled.tokens, cwd, files),
    redirects,
  };
}

export function formatShellBanner(): string {
  return "Playgrounds Shell — 工作沙盒 CLI（非完整 Linux）。輸入 help 查看命令與語法。";
}

/** Builtin + host + allowlisted WASI names for Tab completion. */
export function listShellCommandNames(): string[] {
  const { commands } = listHostCmds();
  return [
    ...SHELL_BUILTIN_NAMES,
    ...SHELL_HOST_CMD_NAMES,
    ...commands.map(c => c.name),
  ].sort();
}

export function resolveShellCwd(
  cwd: string,
  target: string
): { cwd: string } | { error: string } {
  const base = cwd.trim() || "";
  const t = target.trim();
  if (!t || t === ".") return { cwd: base };
  if (t === "/" || t === "~") return { cwd: "" };
  try {
    const joined = t.startsWith("/")
      ? t.replace(/^\/+/u, "")
      : base
        ? `${base}/${t}`
        : t;
    if (!joined || joined === ".") return { cwd: "" };
    return { cwd: normalizeProjectPath(joined) };
  } catch {
    return { error: `cd: 無效路徑：${target}` };
  }
}

/** Resolve a redirect path relative to session cwd → project-relative path. */
export function resolveShellFilePath(
  cwd: string,
  target: string
): { path: string } | { error: string } {
  const t = target.trim();
  if (!t || t === "." || t === "/" || t === "~") {
    return { error: `無效路徑：${target}` };
  }
  try {
    const joined = t.startsWith("/")
      ? t.replace(/^\/+/u, "")
      : cwd
        ? `${cwd}/${t}`
        : t;
    const path = normalizeProjectPath(joined);
    if (!path) return { error: `無效路徑：${target}` };
    return { path };
  } catch {
    return { error: `無效路徑：${target}` };
  }
}

export function listShellDir(files: FileMap, cwd: string): string {
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
      if (seg) names.add(rest.includes("/") ? `${seg}/` : seg);
    } else {
      const seg = norm.split("/")[0];
      if (seg) names.add(norm.includes("/") ? `${seg}/` : seg);
    }
  }
  return sortProjectPaths([...names]).join("\n");
}

function applyEnvCap(
  env: Record<string, string>
): Record<string, string> | { error: string } {
  if (Object.keys(env).length > SHELL_MAX_ENV_VARS) {
    return {
      error: `環境變數過多（最多 ${SHELL_MAX_ENV_VARS}）`,
    };
  }
  return env;
}

function redirectOrEmpty(r: ShellRedirects): ShellRedirects | undefined {
  return hasRedirects(r) ? r : undefined;
}

function parsePipelineStageFull(
  segment: string,
  cwd: string,
  files: FileMap
):
  | {
      stage: ShellStage;
      assigns: Record<string, string>;
      redirects: ShellRedirects;
    }
  | { error: string } {
  const parsed = tokenizeAssignsRedirectsAndGlobs(segment, cwd, files);
  if ("error" in parsed) return parsed;
  const { assigns, tokens, redirects } = parsed;
  if (!tokens.length && !Object.keys(assigns).length) {
    return { error: "管線段落為空" };
  }
  if (!tokens.length) {
    return { error: "管線段落需要命令（不可只有環境指派／重導向）" };
  }
  const cmd = tokens[0]!;
  if (BUILTINS.has(cmd)) {
    return { error: `管線中不可使用內建命令：${cmd}` };
  }
  // xargs (JS host) is allowed in pipelines; other host cmds follow same rule.
  return {
    stage: {
      cmd,
      args: tokens.slice(1),
      redirects: redirectOrEmpty(redirects),
    },
    assigns,
    redirects,
  };
}

function dispatchExport(
  rest: string[],
  env: Record<string, string>
): ShellBuiltinResult {
  if (!rest.length) {
    return { kind: "output", text: formatShellEnv(env), exitCode: 0 };
  }
  let next = { ...env };
  for (const token of rest) {
    const parsed = parseExportAssignment(token);
    if (!parsed) {
      return {
        kind: "output",
        text: `export: 無效名稱：${token}`,
        exitCode: 1,
      };
    }
    if ("value" in parsed) {
      next[parsed.name] = parsed.value;
    } else if (!(parsed.name in next)) {
      next[parsed.name] = "";
    }
  }
  const capped = applyEnvCap(next);
  if ("error" in capped) {
    return { kind: "output", text: capped.error, exitCode: 1 };
  }
  return { kind: "output", text: "", env: capped, exitCode: 0 };
}

function dispatchUnset(
  rest: string[],
  env: Record<string, string>
): ShellBuiltinResult {
  if (!rest.length) {
    return { kind: "output", text: "unset: 需要變數名稱", exitCode: 1 };
  }
  const next = { ...env };
  for (const name of rest) {
    if (!isValidEnvName(name)) {
      return {
        kind: "output",
        text: `unset: 無效名稱：${name}`,
        exitCode: 1,
      };
    }
    delete next[name];
  }
  return { kind: "output", text: "", env: next, exitCode: 0 };
}

function withRedirects(
  result: ShellBuiltinResult,
  redirects: ShellRedirects
): ShellBuiltinResult {
  const r = redirectOrEmpty(redirects);
  if (!r) return result;
  if (result.kind === "output" || result.kind === "run") {
    return { ...result, redirects: r };
  }
  return result;
}

/**
 * Dispatch one chain segment (pipeline or simple command). Does not split `&&`／`||`／`;`.
 */
export function dispatchShellSegment(
  segment: string,
  ctx: ShellDispatchContext
): ShellBuiltinResult {
  const trimmed = segment.trim();
  if (!trimmed) return { kind: "noop" };

  const pipeParts = splitPipelineSegments(trimmed);
  if (pipeParts.length > 1) {
    if (pipeParts.length > SHELL_MAX_PIPELINE_STAGES) {
      return {
        kind: "output",
        text: `管線過長（最多 ${SHELL_MAX_PIPELINE_STAGES} 段）`,
        exitCode: 1,
      };
    }
    const stages: ShellStage[] = [];
    let pipelineEnv = { ...ctx.env };
    let pipelineRedirects: ShellRedirects = {};
    for (let i = 0; i < pipeParts.length; i++) {
      const parsed = parsePipelineStageFull(pipeParts[i]!, ctx.cwd, ctx.files);
      if ("error" in parsed) {
        return { kind: "output", text: parsed.error, exitCode: 1 };
      }
      if (Object.keys(parsed.assigns).length) {
        pipelineEnv = { ...pipelineEnv, ...parsed.assigns };
        const capped = applyEnvCap(pipelineEnv);
        if ("error" in capped) {
          return { kind: "output", text: capped.error, exitCode: 1 };
        }
        pipelineEnv = capped;
      }
      const rd = parsed.redirects;
      if (rd.stdinPath) {
        if (i !== 0) {
          return {
            kind: "output",
            text: "stdin 重導向僅能用於管線第一段",
            exitCode: 1,
          };
        }
        pipelineRedirects.stdinPath = rd.stdinPath;
      }
      if (rd.stdoutPath) {
        if (i !== pipeParts.length - 1) {
          return {
            kind: "output",
            text: "stdout 重導向僅能用於管線最後一段",
            exitCode: 1,
          };
        }
        pipelineRedirects.stdoutPath = rd.stdoutPath;
        pipelineRedirects.stdoutAppend = rd.stdoutAppend;
      }
      stages.push({ cmd: parsed.stage.cmd, args: parsed.stage.args });
    }
    return {
      kind: "pipeline",
      stages,
      env: pipelineEnv,
      redirects: redirectOrEmpty(pipelineRedirects),
    };
  }

  const parsed = tokenizeAssignsRedirectsAndGlobs(trimmed, ctx.cwd, ctx.files);
  if ("error" in parsed) {
    return { kind: "output", text: parsed.error, exitCode: 1 };
  }
  const { assigns, tokens: cmdTokens, redirects } = parsed;
  if (!cmdTokens.length && !Object.keys(assigns).length)
    return { kind: "noop" };

  if (!cmdTokens.length) {
    if (!Object.keys(assigns).length) {
      return {
        kind: "output",
        text: "重導向需要命令",
        exitCode: 1,
      };
    }
    const next = { ...ctx.env, ...assigns };
    const capped = applyEnvCap(next);
    if ("error" in capped) {
      return { kind: "output", text: capped.error, exitCode: 1 };
    }
    if (hasRedirects(redirects)) {
      return {
        kind: "output",
        text: "環境指派不可搭配重導向",
        exitCode: 1,
      };
    }
    return { kind: "output", text: "", env: capped, exitCode: 0 };
  }

  const [head, ...tail] = cmdTokens;
  const cmd = head!;

  if (cmd === "help") {
    const { commands } = listHostCmds();
    const sorted = [...commands].sort((a, b) => a.name.localeCompare(b.name));
    const lines = [
      "工作目錄＝目前工作沙盒；session 環境會傳入命令（printenv）。",
      "內建：help, clear, cd, pwd, export, unset, env",
      "環境：export NAME=value；unset NAME；env／printenv；NAME=value cmd；$VAR／${VAR}／$?",
      "鏈結／重導向／glob：&& || ;  > >> <  * ?",
      "編輯：Tab 補全；↑↓ 歷史；Ctrl+A/E／U/W/L；←→",
      "命令：",
      ...sorted.map(c => `  ${c.name}  — ${c.summary}`),
      "  xargs  — 讀 stdin，批次呼叫允許清單命令",
      "用法例：grep -n foo *.ts；find . -name '*.md' | xargs grep -l bar；awk '{print $1}' a.txt",
      "邊界：無外網、無 sockets；同一時間只跑一條命令。",
    ];
    return withRedirects(
      { kind: "output", text: lines.join("\n"), exitCode: 0 },
      redirects
    );
  }
  if (cmd === "clear") {
    if (hasRedirects(redirects)) {
      return {
        kind: "output",
        text: "clear: 不支援重導向",
        exitCode: 1,
      };
    }
    return { kind: "output", text: "", clear: true, exitCode: 0 };
  }
  if (cmd === "pwd") {
    return withRedirects(
      {
        kind: "output",
        text: ctx.cwd ? `/${ctx.cwd}` : "/",
        exitCode: 0,
      },
      redirects
    );
  }
  if (cmd === "cd") {
    if (Object.keys(assigns).length) {
      return {
        kind: "output",
        text: "cd: 不支援命令前環境指派",
        exitCode: 1,
      };
    }
    if (hasRedirects(redirects)) {
      return {
        kind: "output",
        text: "cd: 不支援重導向",
        exitCode: 1,
      };
    }
    const target = tail[0] ?? "";
    const r = resolveShellCwd(ctx.cwd, target || "/");
    if ("error" in r) {
      return { kind: "output", text: r.error, exitCode: 1 };
    }
    return {
      kind: "output",
      text: "",
      cwd: r.cwd,
      env: syncShellEnvPwd(ctx.env, r.cwd),
      exitCode: 0,
    };
  }
  if (cmd === "export") {
    if (Object.keys(assigns).length) {
      return {
        kind: "output",
        text: "export: 不支援命令前環境指派",
        exitCode: 1,
      };
    }
    return withRedirects(dispatchExport(tail, ctx.env), redirects);
  }
  if (cmd === "unset") {
    if (Object.keys(assigns).length) {
      return {
        kind: "output",
        text: "unset: 不支援命令前環境指派",
        exitCode: 1,
      };
    }
    if (hasRedirects(redirects)) {
      return {
        kind: "output",
        text: "unset: 不支援重導向",
        exitCode: 1,
      };
    }
    return dispatchUnset(tail, ctx.env);
  }
  if (cmd === "env") {
    if (tail.length) {
      return {
        kind: "output",
        text: "env: 僅支援列出環境（改用 NAME=value cmd）",
        exitCode: 1,
      };
    }
    const merged = { ...ctx.env, ...assigns };
    return withRedirects(
      { kind: "output", text: formatShellEnv(merged), exitCode: 0 },
      redirects
    );
  }

  if (BUILTINS.has(cmd)) {
    return { kind: "output", text: `${cmd}: 未實作`, exitCode: 1 };
  }

  const runEnv = { ...ctx.env, ...assigns };
  const capped = applyEnvCap(runEnv);
  if ("error" in capped) {
    return { kind: "output", text: capped.error, exitCode: 1 };
  }
  if (isShellHostCmd(cmd)) {
    return {
      kind: "host",
      cmd,
      args: tail,
      env: capped,
      redirects: redirectOrEmpty(redirects),
    };
  }
  return {
    kind: "run",
    cmd,
    args: tail,
    env: capped,
    redirects: redirectOrEmpty(redirects),
  };
}

export function dispatchShellLine(
  line: string,
  ctx: ShellDispatchContext
): ShellBuiltinResult {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "noop" };

  const expanded = expandShellVars(trimmed, ctx.env, {
    lastExit: ctx.lastExit ?? 0,
  }).trim();
  if (!expanded) return { kind: "noop" };

  const chain = splitChainSegments(expanded);
  if ("error" in chain) {
    return { kind: "output", text: chain.error, exitCode: 1 };
  }
  if (chain.segments.length > 1) {
    return {
      kind: "chain",
      segments: chain.segments,
      ops: chain.ops,
    };
  }

  return dispatchShellSegment(chain.segments[0]!, ctx);
}
