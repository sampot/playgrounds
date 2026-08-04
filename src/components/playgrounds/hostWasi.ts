/**
 * Playgrounds HOST.runCmd — WASI preview1 CLI runner (DEC-021／039).
 * Also drives the human Shell panel (same Worker).
 *
 * Prefer `projectId` → Worker OPFS SyncAccessHandle preopen (no full FileMap mirror).
 * `files` is **ForTests only** (memory preopen when `projectId` omitted).
 */

import { HostBridgeError } from "./hostBridge";
import {
  diffFileMaps,
  entriesToFileMap,
  fileMapToEntries,
  joinFilesWithCwd,
  normalizeWasiCwd,
  sliceFilesForCwd,
  truncateUtf8,
} from "./hostWasiFs";
import type { HostWasiWorkerIn, HostWasiWorkerOut } from "./hostWasi.worker";
import { resolveRunEnv, shellEnvToWasi } from "./shellEnv";
import type { FileMap } from "./projectTypes";
import {
  WASI_ALLOWED_CMDS,
  getWasiCmdInfo,
  isWasiAllowedCmd,
  type WasiCmdInfo,
} from "./wasiPin";

export {
  WASI_ALLOWED_CMDS,
  WASI_JQ_VERSION,
  WASI_JQ_WASM_URL,
  WASI_UUTILS_VERSION,
  WASI_UUTILS_WASM_URL,
  WASI_UUTILS_UTIL_NAMES,
  getWasiCmdInfo,
  isWasiAllowedCmd,
  isWasiUutilsCmd,
} from "./wasiPin";
export type { WasiCmdInfo };

export const HOST_WASI_DEFAULT_TIMEOUT_MS = 30_000;
export const HOST_WASI_MAX_TIMEOUT_MS = 120_000;
export const HOST_WASI_MAX_OUTPUT_CHARS = 256 * 1024;
/** Max argv entries (cmd excluded). */
export const HOST_WASI_MAX_ARGS = 64;
/** Max stdin characters passed into a WASI process. */
export const HOST_WASI_MAX_STDIN_CHARS = 256 * 1024;

/**
 * @deprecated DEC-039 — mirror budget retired; kept only so old imports／docs grep still resolve.
 * Do not use for product limits.
 */
export const HOST_WASI_MAX_FS_BYTES = 16 * 1024 * 1024;

export interface HostCmdRunOptions {
  cmd: string;
  args?: string[];
  stdin?: string;
  /** Relative to project root; default "." */
  cwd?: string;
  /**
   * Environment for this run (`KEY` → value). When omitted, defaults apply
   * (HOME／USER／PATH／PWD／TERM). When set, used as-is (normalized); PWD
   * is always synced from `cwd`.
   */
  env?: Record<string, string>;
  /**
   * OPFS sandbox id (DEC-039 product path). Worker opens SyncAccessHandle
   * preopen; `files` is ignored for WASI FS.
   */
  projectId?: string;
  /**
   * **ForTests only** — in-memory FileMap preopen when `projectId` is omitted.
   * Product Shell／HOST must pass `projectId`.
   */
  files?: FileMap;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HostCmdRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated?: boolean;
  /**
   * Changed/new file contents (memory mode／small write-back).
   * OPFS mode usually empty — use `changedPaths`／`deletedPaths` and reload.
   */
  filesOut: FileMap;
  /** Project-relative paths mutated on OPFS (DEC-039). */
  changedPaths?: string[];
  /** Project-relative paths removed on OPFS (DEC-039). */
  deletedPaths?: string[];
}

/** Low-level runner. */
export interface HostWasiRunner {
  run(options: {
    cmd: string;
    args: string[];
    env: string[];
    stdin: string;
    entries?: ReturnType<typeof fileMapToEntries>;
    projectId?: string;
    cwd?: string;
    wasmUrl: string;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    entriesOut?: ReturnType<typeof fileMapToEntries>;
    changedPaths?: string[];
    deletedPaths?: string[];
  }>;
}

let injectedRunner: HostWasiRunner | null = null;
let defaultRunner: HostWasiRunner | null = null;
/** Serialize human Shell + Agent runCmd so they share one Worker safely. */
let runChain: Promise<unknown> = Promise.resolve();

export function setHostWasiRunnerForTests(runner: HostWasiRunner | null): void {
  injectedRunner = runner;
}

export function disposeHostWasiRunner(): void {
  defaultRunner = null;
  runChain = Promise.resolve();
}

function enqueueHostCmd<T>(fn: () => Promise<T>): Promise<T> {
  const run = runChain.then(fn, fn);
  runChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function listHostCmds(): { commands: WasiCmdInfo[] } {
  return { commands: [...WASI_ALLOWED_CMDS] };
}

export function clampHostWasiTimeoutMs(timeoutMs?: number): number {
  if (timeoutMs == null || !Number.isFinite(timeoutMs)) {
    return HOST_WASI_DEFAULT_TIMEOUT_MS;
  }
  return Math.min(HOST_WASI_MAX_TIMEOUT_MS, Math.max(1, Math.floor(timeoutMs)));
}

function getOrCreateHostWasiRunner(): HostWasiRunner {
  if (injectedRunner) return injectedRunner;
  if (defaultRunner) return defaultRunner;
  defaultRunner = createWorkerHostWasiRunner();
  return defaultRunner;
}

type PendingSlot = {
  onMessage: (data: HostWasiWorkerOut) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
};

function createWorkerHostWasiRunner(): HostWasiRunner {
  if (typeof Worker === "undefined") {
    const err = () =>
      new HostBridgeError(
        "wasi_unavailable",
        "此環境不支援 Web Worker，無法執行 WASI 命令"
      );
    return {
      async run() {
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
    worker = new Worker(new URL("./hostWasi.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (ev: MessageEvent<HostWasiWorkerOut>) => {
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
      const detail = [ev.message, ev.filename && `at ${ev.filename}`]
        .filter(Boolean)
        .join(" ");
      failAll(
        new HostBridgeError(
          "wasi_unavailable",
          detail || "WASI Worker 錯誤（常為依賴尚未預打包完成，請硬重新載入）"
        )
      );
      worker?.terminate();
      worker = null;
    };
    worker.onmessageerror = () => {
      failAll(
        new HostBridgeError("wasi_unavailable", "WASI Worker 訊息無法解碼")
      );
      worker?.terminate();
      worker = null;
    };
    return worker;
  };

  const request = (
    msg: HostWasiWorkerIn,
    timeoutMs: number,
    signal: AbortSignal | undefined
  ): Promise<HostWasiWorkerOut> => {
    const id = msg.id;
    const w = ensureWorker();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };

      const timer = setTimeout(() => {
        pending.delete(id);
        cleanup();
        w.terminate();
        worker = null;
        reject(new HostBridgeError("timeout", "WASI 命令執行逾時"));
      }, timeoutMs);

      const onAbort = () => {
        clearTimeout(timer);
        pending.delete(id);
        cleanup();
        w.terminate();
        worker = null;
        reject(new HostBridgeError("cancelled", "WASI 命令已取消"));
      };

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(new HostBridgeError("cancelled", "WASI 命令已取消"));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      pending.set(id, {
        onMessage: data => resolve(data),
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
      const id = `wasi-${++nextId}`;
      const data = await request(
        {
          type: "run",
          id,
          cmd: options.cmd,
          args: options.args,
          env: options.env,
          stdin: options.stdin,
          entries: options.entries,
          projectId: options.projectId,
          cwd: options.cwd,
          wasmUrl: options.wasmUrl,
        },
        options.timeoutMs,
        options.signal
      );

      if (!data.ok) {
        throw new HostBridgeError(
          (data.code as "not_supported" | "wasi_unavailable") ||
            "wasi_unavailable",
          data.error || "WASI 執行失敗"
        );
      }

      return {
        stdout: data.stdout || "",
        stderr: data.stderr || "",
        exitCode: data.exitCode,
        entriesOut: data.entriesOut || [],
        changedPaths: data.changedPaths,
        deletedPaths: data.deletedPaths,
      };
    },
  };
}

async function runHostCmdUnlocked(
  options: HostCmdRunOptions
): Promise<HostCmdRunResult> {
  const cmd = String(options.cmd || "").trim();
  if (!cmd || !isWasiAllowedCmd(cmd)) {
    throw new HostBridgeError(
      "not_supported",
      `不支援的命令：${cmd || "(空)"}`
    );
  }
  const info = getWasiCmdInfo(cmd)!;
  let cwd: string;
  try {
    cwd = normalizeWasiCwd(options.cwd);
  } catch {
    throw new HostBridgeError("bad_path", "cwd 路徑無效");
  }

  const args = Array.isArray(options.args)
    ? options.args.map(a => String(a))
    : [];
  if (args.length > HOST_WASI_MAX_ARGS) {
    throw new HostBridgeError(
      "too_large",
      `參數過多（最多 ${HOST_WASI_MAX_ARGS}）`
    );
  }

  let stdin = typeof options.stdin === "string" ? options.stdin : "";
  if (stdin.length > HOST_WASI_MAX_STDIN_CHARS) {
    stdin = stdin.slice(0, HOST_WASI_MAX_STDIN_CHARS);
  }

  const envMap = resolveRunEnv({ cwd, env: options.env });
  const env = shellEnvToWasi(envMap);
  const projectId =
    typeof options.projectId === "string" && options.projectId.trim()
      ? options.projectId.trim()
      : undefined;

  const scoped = projectId ? null : sliceFilesForCwd(options.files ?? {}, cwd);
  const entries = scoped ? fileMapToEntries(scoped) : undefined;

  const raw = await getOrCreateHostWasiRunner().run({
    cmd,
    args,
    env,
    stdin,
    entries,
    projectId,
    cwd: projectId ? cwd : undefined,
    wasmUrl: info.wasmUrl,
    timeoutMs: clampHostWasiTimeoutMs(options.timeoutMs),
    signal: options.signal,
  });

  let filesOut: FileMap = {};
  if (!projectId && scoped) {
    const afterScoped = entriesToFileMap(raw.entriesOut || []);
    const changedScoped = diffFileMaps(scoped, afterScoped);
    filesOut = joinFilesWithCwd(changedScoped, cwd);
  }

  const stdoutCut = truncateUtf8(raw.stdout || "", HOST_WASI_MAX_OUTPUT_CHARS);
  const stderrCut = truncateUtf8(raw.stderr || "", HOST_WASI_MAX_OUTPUT_CHARS);

  return {
    stdout: stdoutCut.text,
    stderr: stderrCut.text,
    exitCode: raw.exitCode,
    truncated:
      stdoutCut.truncated ||
      stderrCut.truncated ||
      (typeof options.stdin === "string" &&
        options.stdin.length > HOST_WASI_MAX_STDIN_CHARS) ||
      undefined,
    filesOut,
    changedPaths: raw.changedPaths,
    deletedPaths: raw.deletedPaths,
  };
}

export async function runHostCmd(
  options: HostCmdRunOptions
): Promise<HostCmdRunResult> {
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
      return await enqueueHostCmd(() => runHostCmdUnlocked(options));
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
