/**
 * Playgrounds HOST.runPython — package allowlist, limits, and injectable runner (Phase 7).
 * Also drives the human Python REPL panel (same singleton Worker / Pyodide).
 * Pyodide version is pinned via DEC-015 (`pythonRunnerShare.ts`).
 */

import { PYODIDE_VERSION } from "../tools/pythonRunnerShare";
import { HostBridgeError } from "./hostBridge";
import type { HostPythonReplResult } from "./hostPythonRepl";
import {
  REPL_CONTINUATION_PROMPT,
  REPL_PRIMARY_PROMPT,
  parsePipMagic,
  parseRunMagic,
  resolveProjectScript,
} from "./hostPythonRepl";

export { PYODIDE_VERSION };
export {
  PYODIDE_INDEX_URL,
  PYODIDE_MODULE_URL,
} from "../tools/pythonRunnerShare";
export type { HostPythonReplResult } from "./hostPythonRepl";
export {
  REPL_CONTINUATION_PROMPT,
  REPL_PRIMARY_PROMPT,
  REPL_PROJECT_FS_ROOT,
  appendReplLine,
  formatReplBanner,
  isBlankPrimaryLine,
  isPythonScriptPath,
  parsePipMagic,
  parseRunMagic,
  resolveProjectScript,
} from "./hostPythonRepl";
export type { PipMagicParse, RunMagicParse } from "./hostPythonRepl";

export const HOST_PYTHON_ALLOWED_PACKAGES = [
  "numpy",
  "pandas",
  "scipy",
  "matplotlib",
] as const;

export type HostPythonAllowedPackage =
  (typeof HOST_PYTHON_ALLOWED_PACKAGES)[number];

export const HOST_PYTHON_DEFAULT_TIMEOUT_MS = 30_000;
export const HOST_PYTHON_MAX_TIMEOUT_MS = 120_000;
export const HOST_PYTHON_MAX_CODE_CHARS = 100_000;
export const HOST_PYTHON_REPL_TIMEOUT_MS = 60_000;

export interface HostPythonRunOptions {
  code: string;
  packages?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HostPythonRunResult {
  ok: true;
  stdout: string;
  stderr: string;
  /** Stringified return value of the last expression when available. */
  result?: string;
  packages: string[];
  pyodideVersion: string;
}

export interface HostPythonRunner {
  run(options: HostPythonRunOptions): Promise<HostPythonRunResult>;
  /** Interactive REPL line (may keep incomplete buffer inside the worker). */
  repl(
    line: string,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<HostPythonReplResult>;
  /** Install allowlisted packages (micropip / loadPackage). */
  installPackages(
    packages: string[],
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<{ stdout: string; stderr: string }>;
  /**
   * Sync project `.py` files into the worker FS and exec a script (`%run`).
   */
  runScript(options: {
    path: string;
    code: string;
    projectFiles: Record<string, string>;
    projectId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<HostPythonReplResult>;
  /** Clear __main__ user bindings and REPL buffer (keeps loaded packages). */
  reset(options?: { signal?: AbortSignal }): Promise<void>;
  /** Clear incomplete REPL buffer only (Ctrl+C). */
  cancelRepl(options?: { signal?: AbortSignal }): Promise<void>;
  /** Warm-load Pyodide (first open of the REPL panel). */
  ensure(options?: {
    signal?: AbortSignal;
  }): Promise<{ pyodideVersion: string }>;
  /** Tear down worker (optional; used on shell unmount). */
  dispose?: () => void;
}

const allowedSet = new Set<string>(HOST_PYTHON_ALLOWED_PACKAGES);

export function normalizeHostPythonPackages(
  packages: string[] | undefined
): string[] {
  if (!packages?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of packages) {
    const name = String(raw || "")
      .trim()
      .toLowerCase();
    if (!name || seen.has(name)) continue;
    if (!allowedSet.has(name)) {
      throw new HostBridgeError(
        "forbidden",
        `套件「${raw}」不在允許清單（${HOST_PYTHON_ALLOWED_PACKAGES.join(", ")}）`
      );
    }
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function clampHostPythonTimeoutMs(timeoutMs?: number): number {
  const n =
    timeoutMs === undefined || !Number.isFinite(timeoutMs)
      ? HOST_PYTHON_DEFAULT_TIMEOUT_MS
      : Math.floor(timeoutMs);
  return Math.min(Math.max(n, 1_000), HOST_PYTHON_MAX_TIMEOUT_MS);
}

export function assertHostPythonCode(code: unknown): string {
  if (typeof code !== "string" || !code.trim()) {
    throw new HostBridgeError("bad_path", "runPython 需要非空 code");
  }
  if (code.length > HOST_PYTHON_MAX_CODE_CHARS) {
    throw new HostBridgeError(
      "too_large",
      `code 超過 ${HOST_PYTHON_MAX_CODE_CHARS} 字元上限`
    );
  }
  return code;
}

let runner: HostPythonRunner | null = null;

export function setHostPythonRunnerForTests(
  next: HostPythonRunner | null
): void {
  runner?.dispose?.();
  runner = next;
}

export function getOrCreateHostPythonRunner(): HostPythonRunner {
  if (!runner) {
    runner = createWorkerHostPythonRunner();
  }
  return runner;
}

export async function runHostPython(
  options: HostPythonRunOptions
): Promise<HostPythonRunResult> {
  const code = assertHostPythonCode(options.code);
  const packages = normalizeHostPythonPackages(options.packages);
  const timeoutMs = clampHostPythonTimeoutMs(options.timeoutMs);
  return getOrCreateHostPythonRunner().run({
    code,
    packages,
    timeoutMs,
    signal: options.signal,
  });
}

export async function replHostPython(
  line: string,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Work sandbox id — `%run` reads／writes OPFS in the REPL worker. */
    projectId?: string;
    /** Normalized path → UTF-8 text for work-project `.py` files (memory fallback). */
    projectFiles?: Record<string, string>;
  }
): Promise<HostPythonReplResult> {
  const runMagic = parseRunMagic(line);
  if (runMagic.kind === "usage") {
    return {
      incomplete: false,
      prompt: REPL_PRIMARY_PROMPT,
      stdout:
        "用法：%run path/to/script.py\n從目前工作沙盒 OPFS 讀取並執行；同沙盒其它 .py 會一併掛進解譯器以便 import。\n",
      stderr: "",
    };
  }
  if (runMagic.kind === "error") {
    return {
      incomplete: false,
      prompt: REPL_PRIMARY_PROMPT,
      stdout: "",
      stderr: "",
      error: runMagic.message,
    };
  }
  if (runMagic.kind === "path") {
    const files = options?.projectFiles ?? {};
    if (options?.projectId) {
      return runReplPythonScript({
        projectId: options.projectId,
        path: runMagic.path,
        code: "",
        projectFiles: files,
        timeoutMs: options?.timeoutMs,
        signal: options?.signal,
      });
    }
    const resolved = resolveProjectScript(files, runMagic.path);
    if (!resolved.ok) {
      return {
        incomplete: false,
        prompt: REPL_PRIMARY_PROMPT,
        stdout: "",
        stderr: "",
        error: resolved.error,
      };
    }
    try {
      assertHostPythonCode(resolved.code);
    } catch (e) {
      return {
        incomplete: false,
        prompt: REPL_PRIMARY_PROMPT,
        stdout: "",
        stderr: "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
    return runReplPythonScript({
      path: resolved.path,
      code: resolved.code,
      projectFiles: files,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  const magic = parsePipMagic(line);
  if (magic.kind === "usage") {
    return {
      incomplete: false,
      prompt: REPL_PRIMARY_PROMPT,
      stdout: `用法：%pip install <套件…>\n允許：${HOST_PYTHON_ALLOWED_PACKAGES.join(", ")}\n`,
      stderr: "",
    };
  }
  if (magic.kind === "error") {
    return {
      incomplete: false,
      prompt: REPL_PRIMARY_PROMPT,
      stdout: "",
      stderr: "",
      error: magic.message,
    };
  }
  if (magic.kind === "packages") {
    try {
      const packages = normalizeHostPythonPackages(magic.names);
      const { stdout, stderr } =
        await getOrCreateHostPythonRunner().installPackages(packages, options);
      return {
        incomplete: false,
        prompt: REPL_PRIMARY_PROMPT,
        stdout:
          stdout || (packages.length ? `已安裝：${packages.join(", ")}\n` : ""),
        stderr,
      };
    } catch (e) {
      const message =
        e instanceof HostBridgeError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      return {
        incomplete: false,
        prompt: REPL_PRIMARY_PROMPT,
        stdout: "",
        stderr: "",
        error: message,
      };
    }
  }
  return getOrCreateHostPythonRunner().repl(line, options);
}

export async function resetHostPython(options?: {
  signal?: AbortSignal;
}): Promise<void> {
  return getOrCreateHostPythonRunner().reset(options);
}

export async function cancelHostPythonRepl(options?: {
  signal?: AbortSignal;
}): Promise<void> {
  return getOrCreateHostPythonRunner().cancelRepl(options);
}

export async function ensureHostPython(options?: {
  signal?: AbortSignal;
}): Promise<{ pyodideVersion: string }> {
  return getOrCreateHostPythonRunner().ensure(options);
}

export function disposeHostPythonRunner(): void {
  runner?.dispose?.();
  runner = null;
}

async function runReplPythonScript(options: {
  path: string;
  code: string;
  projectFiles: Record<string, string>;
  projectId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<HostPythonReplResult> {
  const sandboxId =
    typeof options.projectId === "string" && options.projectId.trim()
      ? options.projectId.trim()
      : null;

  const run = async () => {
    const { acquireBackendFsHold, releaseBackendFsHold, isBackendRuntimeLive } =
      await import("./backendHost");
    const held = Boolean(sandboxId && isBackendRuntimeLive());
    if (held) await acquireBackendFsHold(sandboxId!);
    try {
      return await getOrCreateHostPythonRunner().runScript(options);
    } finally {
      if (held) {
        try {
          await releaseBackendFsHold(sandboxId!);
        } catch {
          /* best-effort */
        }
      }
    }
  };

  if (!sandboxId) return run();
  const { withSandboxFsGate } = await import("./sandboxFsGate");
  return withSandboxFsGate(sandboxId, run);
}

type WorkerIn =
  | { type: "run"; id: string; code: string; packages: string[] }
  | { type: "repl"; id: string; line: string }
  | { type: "install"; id: string; packages: string[] }
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
      type: "result";
      id: string;
      ok: true;
      stdout: string;
      stderr: string;
      result?: string;
    }
  | {
      type: "result";
      id: string;
      ok: false;
      error: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      type: "repl_result";
      id: string;
      incomplete: boolean;
      prompt: ">>> " | "... ";
      stdout: string;
      stderr: string;
      result?: string;
      error?: string;
    }
  | {
      type: "install_result";
      id: string;
      ok: true;
      stdout: string;
      stderr: string;
    }
  | {
      type: "install_result";
      id: string;
      ok: false;
      error: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      type: "run_script_result";
      id: string;
      ok: true;
      stdout: string;
      stderr: string;
      changedPaths?: string[];
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
  | { type: "ready"; id: string; pyodideVersion: string }
  | { type: "error"; id: string; error: string };

type PendingSlot = {
  onMessage: (data: WorkerOut) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
};

function createWorkerHostPythonRunner(): HostPythonRunner {
  if (typeof Worker === "undefined") {
    const err = () =>
      new HostBridgeError(
        "not_supported",
        "此環境不支援 Web Worker，無法執行 Python"
      );
    return {
      async run(): Promise<HostPythonRunResult> {
        throw err();
      },
      async repl(): Promise<HostPythonReplResult> {
        throw err();
      },
      async installPackages(): Promise<{ stdout: string; stderr: string }> {
        throw err();
      },
      async runScript(): Promise<HostPythonReplResult> {
        throw err();
      },
      async reset(): Promise<void> {
        throw err();
      },
      async cancelRepl(): Promise<void> {
        throw err();
      },
      async ensure(): Promise<{ pyodideVersion: string }> {
        throw err();
      },
    };
  }

  let worker: Worker | null = null;
  let nextId = 0;
  const pending = new Map<string, PendingSlot>();

  const failAll = (err: unknown) => {
    for (const [id, slot] of pending) {
      clearTimeout(slot.timer);
      slot.cleanup();
      pending.delete(id);
      slot.reject(err);
    }
  };

  const ensureWorker = () => {
    if (worker) return worker;
    worker = new Worker(new URL("./hostPython.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const data = ev.data;
      if (!data || typeof data !== "object" || !("id" in data)) return;
      const slot = pending.get(data.id);
      if (!slot) return;
      clearTimeout(slot.timer);
      slot.cleanup();
      pending.delete(data.id);
      slot.onMessage(data);
    };
    worker.onerror = ev => {
      failAll(
        new HostBridgeError("python_failed", ev.message || "Python Worker 錯誤")
      );
      worker?.terminate();
      worker = null;
    };
    return worker;
  };

  const request = <T>(
    msg: WorkerIn,
    timeoutMs: number,
    signal: AbortSignal | undefined,
    interpret: (data: WorkerOut) => T
  ): Promise<T> => {
    const id = msg.id;
    const w = ensureWorker();
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };

      const timer = setTimeout(() => {
        pending.delete(id);
        cleanup();
        w.terminate();
        worker = null;
        reject(new HostBridgeError("timeout", "Python 執行逾時"));
      }, timeoutMs);

      const onAbort = () => {
        clearTimeout(timer);
        pending.delete(id);
        cleanup();
        w.terminate();
        worker = null;
        reject(new HostBridgeError("cancelled", "Python 已取消"));
      };

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(new HostBridgeError("cancelled", "Python 已取消"));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      pending.set(id, {
        onMessage: data => {
          try {
            resolve(interpret(data));
          } catch (e) {
            reject(e);
          }
        },
        reject: err => {
          cleanup();
          reject(err);
        },
        timer,
        cleanup,
      });

      w.postMessage(msg);
    });
  };

  return {
    async run(options) {
      const packages = options.packages ?? [];
      const timeoutMs = clampHostPythonTimeoutMs(options.timeoutMs);
      const id = `py-${++nextId}`;
      return request(
        { type: "run", id, code: options.code!, packages },
        timeoutMs,
        options.signal,
        data => {
          if (data.type !== "result") {
            throw new HostBridgeError("python_failed", "非預期的 Worker 回應");
          }
          if (!data.ok) {
            throw new HostBridgeError(
              "python_failed",
              data.error || "Python 執行失敗"
            );
          }
          return {
            ok: true as const,
            stdout: data.stdout || "",
            stderr: data.stderr || "",
            result: data.result,
            packages,
            pyodideVersion: PYODIDE_VERSION,
          };
        }
      );
    },

    async repl(line, options) {
      const timeoutMs = clampHostPythonTimeoutMs(
        options?.timeoutMs ?? HOST_PYTHON_REPL_TIMEOUT_MS
      );
      const id = `repl-${++nextId}`;
      return request(
        { type: "repl", id, line: String(line ?? "") },
        timeoutMs,
        options?.signal,
        data => {
          if (data.type === "error") {
            throw new HostBridgeError("python_failed", data.error);
          }
          if (data.type !== "repl_result") {
            throw new HostBridgeError("python_failed", "非預期的 Worker 回應");
          }
          return {
            incomplete: Boolean(data.incomplete),
            prompt:
              data.prompt === REPL_CONTINUATION_PROMPT
                ? REPL_CONTINUATION_PROMPT
                : REPL_PRIMARY_PROMPT,
            stdout: data.stdout || "",
            stderr: data.stderr || "",
            result: data.result,
            error: data.error,
          };
        }
      );
    },

    async installPackages(packages, options) {
      const timeoutMs = clampHostPythonTimeoutMs(
        options?.timeoutMs ?? HOST_PYTHON_REPL_TIMEOUT_MS
      );
      const id = `install-${++nextId}`;
      return request(
        { type: "install", id, packages },
        timeoutMs,
        options?.signal,
        data => {
          if (data.type === "error") {
            throw new HostBridgeError("python_failed", data.error);
          }
          if (data.type !== "install_result") {
            throw new HostBridgeError("python_failed", "非預期的 Worker 回應");
          }
          if (!data.ok) {
            throw new HostBridgeError(
              "python_failed",
              data.error || "套件安裝失敗"
            );
          }
          return {
            stdout: data.stdout || "",
            stderr: data.stderr || "",
          };
        }
      );
    },

    async runScript(options) {
      const timeoutMs = clampHostPythonTimeoutMs(
        options.timeoutMs ?? HOST_PYTHON_REPL_TIMEOUT_MS
      );
      const id = `script-${++nextId}`;
      return request(
        {
          type: "run_script",
          id,
          path: options.path,
          code: options.code,
          projectFiles: options.projectFiles,
          projectId: options.projectId,
        },
        timeoutMs,
        options.signal,
        data => {
          if (data.type === "error") {
            throw new HostBridgeError("python_failed", data.error);
          }
          if (data.type !== "run_script_result") {
            throw new HostBridgeError("python_failed", "非預期的 Worker 回應");
          }
          if (!data.ok) {
            return {
              incomplete: false,
              prompt: REPL_PRIMARY_PROMPT,
              stdout: data.stdout || "",
              stderr: data.stderr || "",
              error: data.error || "腳本執行失敗",
            };
          }
          return {
            incomplete: false,
            prompt: REPL_PRIMARY_PROMPT,
            stdout: data.stdout || "",
            stderr: data.stderr || "",
            changedPaths: data.changedPaths,
          };
        }
      );
    },

    async reset(options) {
      const id = `reset-${++nextId}`;
      return request(
        { type: "reset", id },
        clampHostPythonTimeoutMs(30_000),
        options?.signal,
        data => {
          if (data.type === "error") {
            throw new HostBridgeError("python_failed", data.error);
          }
          if (data.type !== "reset_done") {
            throw new HostBridgeError("python_failed", "非預期的 Worker 回應");
          }
        }
      );
    },

    async cancelRepl(options) {
      const id = `cancel-${++nextId}`;
      return request(
        { type: "cancel_repl", id },
        clampHostPythonTimeoutMs(10_000),
        options?.signal,
        data => {
          if (data.type === "error") {
            throw new HostBridgeError("python_failed", data.error);
          }
          if (data.type !== "cancel_done") {
            throw new HostBridgeError("python_failed", "非預期的 Worker 回應");
          }
        }
      );
    },

    async ensure(options) {
      const id = `ensure-${++nextId}`;
      return request(
        { type: "ensure", id },
        clampHostPythonTimeoutMs(120_000),
        options?.signal,
        data => {
          if (data.type === "error") {
            throw new HostBridgeError("python_failed", data.error);
          }
          if (data.type !== "ready") {
            throw new HostBridgeError("python_failed", "非預期的 Worker 回應");
          }
          return { pyodideVersion: data.pyodideVersion || PYODIDE_VERSION };
        }
      );
    },

    dispose() {
      failAll(new HostBridgeError("cancelled", "Python 已卸載"));
      worker?.terminate();
      worker = null;
    },
  };
}
