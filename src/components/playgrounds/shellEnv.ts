/**
 * Session environment helpers for Playgrounds Shell / WASI runCmd.
 */

export const SHELL_MAX_ENV_VARS = 64;
export const SHELL_MAX_ENV_VALUE_CHARS = 4096;

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export function isValidEnvName(name: string): boolean {
  return ENV_NAME_RE.test(name);
}

export function pwdFromCwd(cwd: string): string {
  const t = cwd.trim();
  return t ? `/${t.replace(/^\/+/u, "")}` : "/";
}

/** Default env for a new Shell session or Agent runCmd without overrides. */
export function createDefaultShellEnv(cwd = ""): Record<string, string> {
  return {
    HOME: "/",
    USER: "playground",
    PATH: "/bin",
    PWD: pwdFromCwd(cwd),
    TERM: "xterm-256color",
  };
}

export function syncShellEnvPwd(
  env: Record<string, string>,
  cwd: string
): Record<string, string> {
  return { ...env, PWD: pwdFromCwd(cwd) };
}

export function formatShellEnv(env: Record<string, string>): string {
  return Object.keys(env)
    .sort()
    .map(k => `${k}=${env[k] ?? ""}`)
    .join("\n");
}

/** WASI preview1 env strings (`KEY=VALUE`), sorted for stability. */
export function shellEnvToWasi(env: Record<string, string>): string[] {
  return Object.keys(env)
    .sort()
    .map(k => `${k}=${env[k] ?? ""}`);
}

/**
 * Validate / clamp an env map for hostWasi.
 * Invalid names dropped; values truncated; excess keys dropped (sorted).
 */
export function normalizeShellEnv(
  input: Record<string, string> | undefined | null
): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  const keys = Object.keys(input).filter(isValidEnvName).sort();
  for (const key of keys.slice(0, SHELL_MAX_ENV_VARS)) {
    let value = String(input[key] ?? "");
    if (value.length > SHELL_MAX_ENV_VALUE_CHARS) {
      value = value.slice(0, SHELL_MAX_ENV_VALUE_CHARS);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Resolve env for a WASI run.
 * - omit `env` → defaults (HOME／USER／PATH／PWD／TERM)
 * - provide `env` → authoritative map (normalized), PWD synced from cwd
 */
export function resolveRunEnv(options: {
  cwd?: string;
  env?: Record<string, string> | null;
}): Record<string, string> {
  const cwd = options.cwd ?? "";
  if (options.env == null) {
    return createDefaultShellEnv(cwd);
  }
  return syncShellEnvPwd(normalizeShellEnv(options.env), cwd);
}

export type ExpandShellVarsOptions = {
  /** Last command exit status for `$?`. */
  lastExit?: number;
};

/** Expand `$VAR` / `${VAR}` / `$?` outside single quotes (quotes preserved for tokenize). */
export function expandShellVars(
  input: string,
  env: Record<string, string>,
  options?: ExpandShellVarsOptions
): string {
  let out = "";
  let quote: '"' | "'" | null = null;
  const lastExit = options?.lastExit ?? 0;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (quote === "'") {
      out += ch;
      if (ch === "'") quote = null;
      continue;
    }

    if (quote === '"') {
      if (ch === '"') {
        out += ch;
        quote = null;
        continue;
      }
      if (ch === "\\" && i + 1 < input.length) {
        const n = input[i + 1]!;
        if (n === '"' || n === "\\" || n === "$" || n === "`") {
          out += n;
          i++;
          continue;
        }
      }
      if (ch === "$") {
        const read = readEnvRef(input, i + 1, env, lastExit);
        out += read.value;
        i = read.next - 1;
        continue;
      }
      out += ch;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "$") {
      const read = readEnvRef(input, i + 1, env, lastExit);
      out += read.value;
      i = read.next - 1;
      continue;
    }
    out += ch;
  }

  return out;
}

function readEnvRef(
  input: string,
  start: number,
  env: Record<string, string>,
  lastExit: number
): { value: string; next: number } {
  if (start >= input.length) return { value: "$", next: start };

  if (input[start] === "?") {
    return { value: String(lastExit), next: start + 1 };
  }

  if (input[start] === "{") {
    const end = input.indexOf("}", start + 1);
    if (end < 0) return { value: "${", next: start + 1 };
    const name = input.slice(start + 1, end);
    if (name === "?") {
      return { value: String(lastExit), next: end + 1 };
    }
    if (!isValidEnvName(name)) {
      return { value: `\${${name}}`, next: end + 1 };
    }
    return { value: env[name] ?? "", next: end + 1 };
  }

  if (/[A-Za-z_]/u.test(input[start]!)) {
    let j = start + 1;
    while (j < input.length && /[A-Za-z0-9_]/u.test(input[j]!)) j++;
    const name = input.slice(start, j);
    return { value: env[name] ?? "", next: j };
  }

  return { value: "$", next: start };
}

const ASSIGN_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u;

/** Peel leading `NAME=value` tokens (bash one-shot assignments). */
export function peelEnvAssignments(tokens: string[]): {
  assigns: Record<string, string>;
  rest: string[];
} {
  const assigns: Record<string, string> = {};
  let i = 0;
  while (i < tokens.length) {
    const m = ASSIGN_RE.exec(tokens[i]!);
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

export function parseExportAssignment(
  token: string
): { name: string; value: string } | { name: string } | null {
  const eq = ASSIGN_RE.exec(token);
  if (eq) {
    let value = eq[2]!;
    if (value.length > SHELL_MAX_ENV_VALUE_CHARS) {
      value = value.slice(0, SHELL_MAX_ENV_VALUE_CHARS);
    }
    return { name: eq[1]!, value };
  }
  if (isValidEnvName(token)) return { name: token };
  return null;
}
