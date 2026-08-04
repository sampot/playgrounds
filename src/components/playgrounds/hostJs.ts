/**
 * Playgrounds human JavaScript REPL — isolated Worker sandbox (no npm).
 */

import { HostBridgeError } from "./hostBridge";
import type { HostJsReplResult } from "./hostJsRepl";
import {
  JS_REPL_CONTINUATION_PROMPT,
  JS_REPL_PRIMARY_PROMPT,
  parseJsRunMagic,
  resolveProjectJsScript,
} from "./hostJsRepl";

export type { HostJsReplResult } from "./hostJsRepl";
export {
  JS_REPL_CONTINUATION_PROMPT,
  JS_REPL_PRIMARY_PROMPT,
  formatJsReplBanner,
  isJsScriptPath,
  isJsSourceComplete,
  parseJsRunMagic,
  resolveProjectJsScript,
  stringifyJsResult,
} from "./hostJsRepl";

export const HOST_JS_DEFAULT_TIMEOUT_MS = 30_000;
export const HOST_JS_MAX_TIMEOUT_MS = 120_000;
export const HOST_JS_MAX_CODE_CHARS = 100_000;

export interface HostJsRunner {
  repl(
    line: string,
    options?: { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<HostJsReplResult>;
  runScript(options: {
    path: string;
    code: string;
    projectFiles: Record<string, string>;
    projectId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<HostJsReplResult>;
  reset(options?: { signal?: AbortSignal }): Promise<void>;
  cancelRepl(options?: { signal?: AbortSignal }): Promise<void>;
  ensure(options?: { signal?: AbortSignal }): Promise<void>;
  dispose?: () => void;
}

export function clampHostJsTimeoutMs(timeoutMs?: number): number {
  const n =
    timeoutMs === undefined || !Number.isFinite(timeoutMs)
      ? HOST_JS_DEFAULT_TIMEOUT_MS
      : Math.floor(timeoutMs);
  return Math.min(Math.max(n, 1_000), HOST_JS_MAX_TIMEOUT_MS);
}

export function assertHostJsCode(code: unknown): string {
  if (typeof code !== "string" || !code.trim()) {
    throw new HostBridgeError("bad_path", "JS 需要非空 code");
  }
  if (code.length > HOST_JS_MAX_CODE_CHARS) {
    throw new HostBridgeError(
      "too_large",
      `code 超過 ${HOST_JS_MAX_CODE_CHARS} 字元上限`
    );
  }
  return code;
}

let runner: HostJsRunner | null = null;

export function setHostJsRunnerForTests(next: HostJsRunner | null): void {
  runner?.dispose?.();
  runner = next;
}

export function getOrCreateHostJsRunner(): HostJsRunner {
  if (!runner) runner = createWorkerHostJsRunner();
  return runner;
}

export async function replHostJs(
  line: string,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    projectId?: string;
    projectFiles?: Record<string, string>;
  }
): Promise<HostJsReplResult> {
  const runMagic = parseJsRunMagic(line);
  if (runMagic.kind === "usage") {
    return {
      incomplete: false,
      prompt: JS_REPL_PRIMARY_PROMPT,
      stdout:
        '用法：%run path/to/script.js\n從目前工作沙盒 OPFS 讀取並執行；同沙盒可用 load("other.js")。\n',
      stderr: "",
    };
  }
  if (runMagic.kind === "error") {
    return {
      incomplete: false,
      prompt: JS_REPL_PRIMARY_PROMPT,
      stdout: "",
      stderr: "",
      error: runMagic.message,
    };
  }
  if (runMagic.kind === "path") {
    const files = options?.projectFiles ?? {};
    if (options?.projectId) {
      return runReplJsScript({
        projectId: options.projectId,
        path: runMagic.path,
        code: "",
        projectFiles: files,
        timeoutMs: options?.timeoutMs,
        signal: options?.signal,
      });
    }
    const resolved = resolveProjectJsScript(files, runMagic.path);
    if (!resolved.ok) {
      return {
        incomplete: false,
        prompt: JS_REPL_PRIMARY_PROMPT,
        stdout: "",
        stderr: "",
        error: resolved.error,
      };
    }
    try {
      assertHostJsCode(resolved.code);
    } catch (e) {
      return {
        incomplete: false,
        prompt: JS_REPL_PRIMARY_PROMPT,
        stdout: "",
        stderr: "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
    return runReplJsScript({
      path: resolved.path,
      code: resolved.code,
      projectFiles: files,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }
  return getOrCreateHostJsRunner().repl(line, options);
}

async function runReplJsScript(options: {
  path: string;
  code: string;
  projectFiles: Record<string, string>;
  projectId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<HostJsReplResult> {
  if (!options.projectId) {
    try {
      assertHostJsCode(options.code);
    } catch (e) {
      return {
        incomplete: false,
        prompt: JS_REPL_PRIMARY_PROMPT,
        stdout: "",
        stderr: "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
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
      return await getOrCreateHostJsRunner().runScript(options);
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

export async function resetHostJs(options?: {
  signal?: AbortSignal;
}): Promise<void> {
  return getOrCreateHostJsRunner().reset(options);
}

export async function cancelHostJsRepl(options?: {
  signal?: AbortSignal;
}): Promise<void> {
  return getOrCreateHostJsRunner().cancelRepl(options);
}

export async function ensureHostJs(options?: {
  signal?: AbortSignal;
}): Promise<void> {
  return getOrCreateHostJsRunner().ensure(options);
}

export function disposeHostJsRunner(): void {
  runner?.dispose?.();
  runner = null;
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

type PendingSlot = {
  onMessage: (data: WorkerOut) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
};

function createWorkerHostJsRunner(): HostJsRunner {
  if (typeof Worker === "undefined") {
    const err = () =>
      new HostBridgeError(
        "not_supported",
        "此環境不支援 Web Worker，無法執行 JavaScript REPL"
      );
    return {
      async repl(): Promise<HostJsReplResult> {
        throw err();
      },
      async runScript(): Promise<HostJsReplResult> {
        throw err();
      },
      async reset(): Promise<void> {
        throw err();
      },
      async cancelRepl(): Promise<void> {
        throw err();
      },
      async ensure(): Promise<void> {
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
    worker = new Worker(new URL("./hostJs.worker.ts", import.meta.url), {
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
        new HostBridgeError("python_failed", ev.message || "JS Worker 錯誤")
      );
      worker?.terminate();
      worker = null;
    };
    worker.onmessageerror = () => {
      failAll(new HostBridgeError("python_failed", "JS Worker 訊息無法解碼"));
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
        reject(new HostBridgeError("timeout", "JavaScript 執行逾時"));
      }, timeoutMs);
      const onAbort = () => {
        clearTimeout(timer);
        pending.delete(id);
        cleanup();
        w.terminate();
        worker = null;
        reject(new HostBridgeError("cancelled", "JavaScript 已取消"));
      };
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(new HostBridgeError("cancelled", "JavaScript 已取消"));
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
        reject: e => {
          cleanup();
          reject(e);
        },
        timer,
        cleanup,
      });
      w.postMessage(msg);
    });
  };

  return {
    async repl(line, options) {
      const timeoutMs = clampHostJsTimeoutMs(options?.timeoutMs);
      const id = `js-repl-${++nextId}`;
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
              data.prompt === JS_REPL_CONTINUATION_PROMPT
                ? JS_REPL_CONTINUATION_PROMPT
                : JS_REPL_PRIMARY_PROMPT,
            stdout: data.stdout || "",
            stderr: data.stderr || "",
            result: data.result,
            error: data.error,
          };
        }
      );
    },

    async runScript(options) {
      const timeoutMs = clampHostJsTimeoutMs(options.timeoutMs);
      const id = `js-script-${++nextId}`;
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
              prompt: JS_REPL_PRIMARY_PROMPT,
              stdout: data.stdout || "",
              stderr: data.stderr || "",
              error: data.error || "腳本執行失敗",
            };
          }
          return {
            incomplete: false,
            prompt: JS_REPL_PRIMARY_PROMPT,
            stdout: data.stdout || "",
            stderr: data.stderr || "",
            result: data.result,
          };
        }
      );
    },

    async reset(options) {
      const id = `js-reset-${++nextId}`;
      return request(
        { type: "reset", id },
        clampHostJsTimeoutMs(10_000),
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
      const id = `js-cancel-${++nextId}`;
      return request(
        { type: "cancel_repl", id },
        clampHostJsTimeoutMs(10_000),
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
      const w = ensureWorker();
      // Readiness ping — fail fast if the worker never loads/answers.
      const id = `js-ensure-${++nextId}`;
      const timeoutMs = 5_000;
      return request(
        { type: "ensure", id },
        timeoutMs,
        options?.signal,
        data => {
          if (data.type === "error") {
            throw new HostBridgeError("python_failed", data.error);
          }
          if (data.type !== "ready") {
            throw new HostBridgeError("python_failed", "非預期的 Worker 回應");
          }
        }
      ).catch(err => {
        try {
          w.terminate();
        } catch {
          /* ignore */
        }
        worker = null;
        if (err instanceof HostBridgeError && err.code === "timeout") {
          throw new HostBridgeError(
            "timeout",
            "JS Worker 啟動逾時（請按「載入」重試，或檢查瀏覽器主控台）"
          );
        }
        throw err instanceof HostBridgeError
          ? err
          : new HostBridgeError(
              "python_failed",
              err instanceof Error ? err.message : String(err)
            );
      });
    },

    dispose() {
      failAll(new HostBridgeError("cancelled", "JavaScript 已卸載"));
      worker?.terminate();
      worker = null;
    },
  };
}
