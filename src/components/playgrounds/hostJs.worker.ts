/// <reference lib="webworker" />

/**
 * Isolated JS worker for the human JavaScript REPL panel.
 * Persistent sandbox; no npm / no DOM.
 * Helpers are inlined (avoid importing shared modules that can break worker boot).
 */

declare const self: DedicatedWorkerGlobalScope;

import {
  listReplProjectFiles,
  readReplProjectBytes,
  replProjectBytesToText,
} from "./replOpfsProject";

// Keep this file a module (avoids DOM/`self` redeclaration under check).
export {};

function isJsSourceComplete(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return true;
  if (!bracketsBalanced(source)) return false;
  try {
    // eslint-disable-next-line no-new-func -- completeness probe
    new Function(source);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unexpected end of input|expected/iu.test(msg)) return false;
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
    if (brace < 0 || paren < 0 || bracket < 0) return true;
  }
  return brace === 0 && paren === 0 && bracket === 0 && quote === null;
}

function looksLikeEsModule(code: string): boolean {
  return /(?:^|[\n;])\s*(?:import|export)\b/u.test(code);
}

function stringifyJsResult(value: unknown): string | undefined {
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

function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\\/gu, "/").replace(/\/+$/u, "");
  const noLead = trimmed.replace(/^(\.\/)+/u, "").replace(/^\/+/u, "");
  const parts: string[] = [];
  for (const part of noLead.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) throw new Error("路徑不可超出沙盒根目錄");
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function parentDir(path: string): string {
  const n = normalizePath(path);
  const i = n.lastIndexOf("/");
  return i === -1 ? "" : n.slice(0, i);
}

function resolveJsImportPath(
  fromPath: string,
  specifier: string
): string | null {
  const spec = specifier.trim();
  if (!spec.startsWith("./") && !spec.startsWith("../")) return null;
  try {
    const base = parentDir(fromPath);
    return normalizePath(base ? `${base}/${spec}` : spec);
  } catch {
    return null;
  }
}

function rewriteRelativeJsImports(
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

type WorkerIn =
  | { type: "repl"; id: string; line: string }
  | {
      type: "run_script";
      id: string;
      path: string;
      code: string;
      projectFiles: Record<string, string>;
      projectId?: string;
    }
  | { type: "reset"; id: string }
  | { type: "cancel_repl"; id: string }
  | { type: "ensure"; id: string };

type WorkerOut =
  | {
      type: "repl_result";
      id: string;
      incomplete: boolean;
      prompt: "> " | "... ";
      stdout: string;
      stderr: string;
      result?: string;
      error?: string;
    }
  | {
      type: "run_script_result";
      id: string;
      ok: true;
      stdout: string;
      stderr: string;
      result?: string;
    }
  | {
      type: "run_script_result";
      id: string;
      ok: false;
      error: string;
      stdout?: string;
      stderr?: string;
    }
  | { type: "reset_done"; id: string }
  | { type: "cancel_done"; id: string }
  | { type: "ready"; id: string }
  | { type: "error"; id: string; error: string };

let replBuffer = "";
let projectFiles: Record<string, string> = {};
let queue: Promise<void> = Promise.resolve();

type Sandbox = Record<string | symbol, unknown> & {
  console: {
    log: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  load: (path: string) => Promise<unknown>;
  __module?: unknown;
};

let sandbox: Sandbox | null = null;
let stdoutParts: string[] = [];
let stderrParts: string[] = [];
/** path → blob: URL for ESM graph */
const moduleUrlCache = new Map<string, string>();
const moduleBlobUrls: string[] = [];

function enqueue(task: () => Promise<void>): void {
  queue = queue.then(task, task);
}

function revokeModuleUrls(): void {
  for (const url of moduleBlobUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
  moduleBlobUrls.length = 0;
  moduleUrlCache.clear();
}

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map(a => {
      if (typeof a === "string") return a;
      const s = stringifyJsResult(a);
      return s === undefined ? String(a) : s;
    })
    .join(" ");
}

function ensureExt(path: string): string {
  if (/\.(js|mjs|cjs)$/iu.test(path)) return path;
  if (projectFiles[path]) return path;
  if (projectFiles[`${path}.js`]) return `${path}.js`;
  if (projectFiles[`${path}.mjs`]) return `${path}.mjs`;
  return path;
}

/** Build blob URL for a project module, rewriting relative imports. */
function moduleUrlFor(path: string, visiting = new Set<string>()): string {
  const key = ensureExt(path);
  const cached = moduleUrlCache.get(key);
  if (cached) return cached;
  if (visiting.has(key)) {
    throw new Error(`循環 import：${key}`);
  }
  const code = projectFiles[key];
  if (code === undefined) {
    throw new Error(`找不到模組：${key}`);
  }
  visiting.add(key);
  const rewritten = rewriteRelativeJsImports(code, key, dep => {
    const resolved = ensureExt(dep);
    if (!(resolved in projectFiles)) {
      throw new Error(`找不到模組：${resolved}（自 ${key}）`);
    }
    return moduleUrlFor(resolved, visiting);
  });
  visiting.delete(key);
  const url = URL.createObjectURL(
    new Blob([rewritten], { type: "text/javascript" })
  );
  moduleUrlCache.set(key, url);
  moduleBlobUrls.push(url);
  return url;
}

async function importProjectModule(path: string): Promise<unknown> {
  const url = moduleUrlFor(path);
  return import(/* @vite-ignore */ url);
}

function createSandbox(): Sandbox {
  const box: Sandbox = {
    console: {
      log: (...args: unknown[]) => {
        stdoutParts.push(`${formatConsoleArgs(args)}\n`);
      },
      info: (...args: unknown[]) => {
        stdoutParts.push(`${formatConsoleArgs(args)}\n`);
      },
      warn: (...args: unknown[]) => {
        stderrParts.push(`${formatConsoleArgs(args)}\n`);
      },
      error: (...args: unknown[]) => {
        stderrParts.push(`${formatConsoleArgs(args)}\n`);
      },
    },
    load: async (path: string) => {
      const norm = String(path || "")
        .replace(/^\/+/u, "")
        .replace(/\\/gu, "/");
      const code = projectFiles[norm] ?? projectFiles[ensureExt(norm)];
      if (code === undefined) {
        throw new Error(`load: 找不到 ${norm}`);
      }
      if (looksLikeEsModule(code)) {
        const mod = await importProjectModule(ensureExt(norm));
        box.__module = mod;
        return mod;
      }
      return runCode(code, { asExpression: false });
    },
  };
  return box;
}

function ensureSandbox(): Sandbox {
  if (!sandbox) sandbox = createSandbox();
  return sandbox;
}

async function runCode(
  code: string,
  opts: { asExpression: boolean }
): Promise<unknown> {
  const box = ensureSandbox();
  const AsyncFunction = Object.getPrototypeOf(async function () {})
    .constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;

  if (opts.asExpression) {
    try {
      const fn = new AsyncFunction(
        "sandbox",
        `with (sandbox) { return await (async () => (${code}))(); }`
      );
      return await fn(box);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      // Fall through to statement mode.
    }
  }

  const fn = new AsyncFunction(
    "sandbox",
    `with (sandbox) { return await (async () => { ${code} \n})(); }`
  );
  return await fn(box);
}

async function evaluateSource(source: string): Promise<{
  stdout: string;
  stderr: string;
  result?: string;
  error?: string;
}> {
  stdoutParts = [];
  stderrParts = [];
  try {
    let value: unknown;
    try {
      value = await runCode(source, { asExpression: true });
    } catch (e) {
      if (e instanceof SyntaxError) {
        value = await runCode(source, { asExpression: false });
      } else {
        throw e;
      }
    }
    return {
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
      result: stringifyJsResult(value),
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    return {
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
      error: message,
    };
  }
}

async function replOne(
  msg: Extract<WorkerIn, { type: "repl" }>
): Promise<void> {
  if (!replBuffer && !msg.line.trim()) {
    self.postMessage({
      type: "repl_result",
      id: msg.id,
      incomplete: false,
      prompt: "> ",
      stdout: "",
      stderr: "",
    } satisfies WorkerOut);
    return;
  }

  replBuffer += `${msg.line}\n`;
  if (!isJsSourceComplete(replBuffer)) {
    self.postMessage({
      type: "repl_result",
      id: msg.id,
      incomplete: true,
      prompt: "... ",
      stdout: "",
      stderr: "",
    } satisfies WorkerOut);
    return;
  }

  const source = replBuffer;
  replBuffer = "";
  const out = await evaluateSource(source);
  self.postMessage({
    type: "repl_result",
    id: msg.id,
    incomplete: false,
    prompt: "> ",
    stdout: out.stdout,
    stderr: out.stderr,
    result: out.result,
    error: out.error,
  } satisfies WorkerOut);
}

async function loadProjectFilesFromOpfs(
  projectId: string
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const { path, bytes } of await listReplProjectFiles(projectId)) {
    out[path] = replProjectBytesToText(bytes);
  }
  return out;
}

async function runScriptOne(
  msg: Extract<WorkerIn, { type: "run_script" }>
): Promise<void> {
  let scriptCode = msg.code;
  if (msg.projectId) {
    projectFiles = await loadProjectFilesFromOpfs(msg.projectId);
    const bytes = await readReplProjectBytes(msg.projectId, msg.path);
    if (!bytes) {
      self.postMessage({
        type: "run_script_result",
        id: msg.id,
        ok: false,
        error: `找不到檔案：${msg.path}`,
      } satisfies WorkerOut);
      return;
    }
    scriptCode = replProjectBytesToText(bytes);
  } else {
    projectFiles = { ...(msg.projectFiles || {}) };
    if (!(msg.path in projectFiles)) {
      projectFiles[msg.path] = msg.code;
    }
  }
  // Fresh module graph per %run so OPFS edits are picked up.
  revokeModuleUrls();
  ensureSandbox();
  stdoutParts = [];
  stderrParts = [];
  try {
    let value: unknown;
    if (looksLikeEsModule(scriptCode)) {
      value = await importProjectModule(msg.path);
      ensureSandbox().__module = value;
    } else {
      const out = await evaluateSource(scriptCode);
      if (out.error) {
        self.postMessage({
          type: "run_script_result",
          id: msg.id,
          ok: false,
          error: out.error,
          stdout: out.stdout,
          stderr: out.stderr,
        } satisfies WorkerOut);
        return;
      }
      self.postMessage({
        type: "run_script_result",
        id: msg.id,
        ok: true,
        stdout: out.stdout,
        stderr: out.stderr,
        result: out.result,
      } satisfies WorkerOut);
      return;
    }
    self.postMessage({
      type: "run_script_result",
      id: msg.id,
      ok: true,
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
      result: stringifyJsResult(value),
    } satisfies WorkerOut);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    self.postMessage({
      type: "run_script_result",
      id: msg.id,
      ok: false,
      error: message,
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
    } satisfies WorkerOut);
  }
}

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const data = event.data;
  if (!data || typeof data !== "object" || !data.id) return;
  if (data.type === "repl") {
    enqueue(() => replOne(data));
    return;
  }
  if (data.type === "run_script") {
    enqueue(() => runScriptOne(data));
    return;
  }
  if (data.type === "reset") {
    enqueue(async () => {
      replBuffer = "";
      sandbox = null;
      projectFiles = {};
      revokeModuleUrls();
      self.postMessage({ type: "reset_done", id: data.id } satisfies WorkerOut);
    });
    return;
  }
  if (data.type === "cancel_repl") {
    enqueue(async () => {
      replBuffer = "";
      self.postMessage({
        type: "cancel_done",
        id: data.id,
      } satisfies WorkerOut);
    });
    return;
  }
  if (data.type === "ensure") {
    enqueue(async () => {
      ensureSandbox();
      self.postMessage({ type: "ready", id: data.id } satisfies WorkerOut);
    });
  }
};
