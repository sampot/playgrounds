/**
 * JS-host `xargs` for Playgrounds Shell (WASI cannot spawn child processes).
 * Reads stdin tokens and invokes an allowlisted WASI command in batches.
 */

import { isWasiAllowedCmd } from "./wasiPin";

export const SHELL_XARGS_MAX_BATCHES = 64;
export const SHELL_XARGS_DEFAULT_MAX_ARGS = 32;

export type XargsInvocation = { cmd: string; args: string[] };

export type XargsParseResult =
  | {
      ok: true;
      cmd: string;
      baseArgs: string[];
      maxArgs: number;
      nullSep: boolean;
      noRunIfEmpty: boolean;
      replace?: string;
    }
  | { ok: false; error: string };

/** Parse `xargs` argv (after the `xargs` command name). */
export function parseXargsArgv(argv: string[]): XargsParseResult {
  let maxArgs = SHELL_XARGS_DEFAULT_MAX_ARGS;
  let nullSep = false;
  let noRunIfEmpty = false;
  let replace: string | undefined;
  let i = 0;

  while (i < argv.length) {
    const a = argv[i]!;
    if (a === "--") {
      i++;
      break;
    }
    if (a === "-0" || a === "-z" || a === "--null") {
      nullSep = true;
      i++;
      continue;
    }
    if (a === "-r" || a === "--no-run-if-empty") {
      noRunIfEmpty = true;
      i++;
      continue;
    }
    if (a === "-n" || a === "--max-args") {
      const n = Number(argv[i + 1]);
      if (!Number.isFinite(n) || n < 1) {
        return { ok: false, error: "xargs: -n 需要正整數" };
      }
      maxArgs = Math.min(SHELL_XARGS_DEFAULT_MAX_ARGS, Math.floor(n));
      i += 2;
      continue;
    }
    if (a.startsWith("-n") && a.length > 2 && !a.startsWith("-n=")) {
      const n = Number(a.slice(2));
      if (!Number.isFinite(n) || n < 1) {
        return { ok: false, error: "xargs: -n 需要正整數" };
      }
      maxArgs = Math.min(SHELL_XARGS_DEFAULT_MAX_ARGS, Math.floor(n));
      i++;
      continue;
    }
    if (a === "-I" || a === "--replace") {
      const token = argv[i + 1];
      if (!token) return { ok: false, error: "xargs: -I 需要置換字串" };
      replace = token;
      maxArgs = 1;
      i += 2;
      continue;
    }
    if (a.startsWith("-I") && a.length > 2) {
      replace = a.slice(2);
      maxArgs = 1;
      i++;
      continue;
    }
    if (a.startsWith("-")) {
      return { ok: false, error: `xargs: 不支援的選項：${a}` };
    }
    break;
  }

  const rest = argv.slice(i);
  if (!rest.length) {
    return { ok: false, error: "xargs: 需要命令（例：xargs grep foo）" };
  }
  const cmd = rest[0]!;
  if (!isWasiAllowedCmd(cmd)) {
    return {
      ok: false,
      error: `xargs: 命令不在允許清單：${cmd}`,
    };
  }
  if (cmd === "xargs") {
    return { ok: false, error: "xargs: 不可巢狀" };
  }

  return {
    ok: true,
    cmd,
    baseArgs: rest.slice(1),
    maxArgs: replace ? 1 : maxArgs,
    nullSep,
    noRunIfEmpty,
    replace,
  };
}

export function splitXargsItems(stdin: string, nullSep: boolean): string[] {
  if (!stdin) return [];
  if (nullSep) {
    return stdin.split("\0").filter(s => s.length > 0);
  }
  return stdin.trim().length ? stdin.trim().split(/\s+/u) : [];
}

export function buildXargsInvocations(
  parsed: Extract<XargsParseResult, { ok: true }>,
  stdin: string
): { invocations: XargsInvocation[] } | { error: string } {
  const items = splitXargsItems(stdin, parsed.nullSep);
  if (!items.length) {
    if (parsed.noRunIfEmpty) return { invocations: [] };
    return { invocations: [{ cmd: parsed.cmd, args: [...parsed.baseArgs] }] };
  }

  const invocations: XargsInvocation[] = [];
  if (parsed.replace) {
    for (const item of items) {
      if (invocations.length >= SHELL_XARGS_MAX_BATCHES) {
        return {
          error: `xargs: 超過最多 ${SHELL_XARGS_MAX_BATCHES} 次呼叫`,
        };
      }
      const args = parsed.baseArgs.map(a =>
        a.split(parsed.replace!).join(item)
      );
      invocations.push({ cmd: parsed.cmd, args });
    }
    return { invocations };
  }

  for (let i = 0; i < items.length; i += parsed.maxArgs) {
    if (invocations.length >= SHELL_XARGS_MAX_BATCHES) {
      return {
        error: `xargs: 超過最多 ${SHELL_XARGS_MAX_BATCHES} 次呼叫`,
      };
    }
    const batch = items.slice(i, i + parsed.maxArgs);
    invocations.push({
      cmd: parsed.cmd,
      args: [...parsed.baseArgs, ...batch],
    });
  }
  return { invocations };
}
