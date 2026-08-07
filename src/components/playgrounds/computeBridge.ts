/**
 * Narrow env.COMPUTE binding for admitted runPython / runCmd (DEC-036).
 */

import { HostBridgeError } from "./hostBridge";
import { runHostPython, type HostPythonRunOptions } from "./hostPython";
import { createDefaultShellEnv } from "./shellEnv";
import {
  runHostCmd,
  type HostCmdRunOptions,
  type HostCmdRunResult,
} from "./hostWasi";
import { loadProjectFiles, saveFile } from "./sandboxAuthority";
import { normalizeProjectPath } from "./pathUtils";
import {
  filterKnownCapabilities,
  type KnownCapability,
} from "./samCapabilities";
import type { FileMap } from "./projectTypes";

export const COMPUTE_API_VERSION = "1";

export class ComputeBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ComputeBridgeError";
    this.code = code;
  }
}

export interface ComputeFilesAccess {
  loadFiles(sandboxId: string): Promise<FileMap>;
  writeFile(
    sandboxId: string,
    path: string,
    content: FileMap[string]
  ): Promise<void>;
}

let filesAccess: ComputeFilesAccess | null = null;

/** Optional shell wiring so runCmd sees in-memory work buffers. */
export function registerComputeFilesAccess(
  access: ComputeFilesAccess | null
): void {
  filesAccess = access;
}

async function loadFiles(sandboxId: string): Promise<FileMap> {
  if (filesAccess) return filesAccess.loadFiles(sandboxId);
  return loadProjectFiles(sandboxId);
}

async function writeFile(
  sandboxId: string,
  path: string,
  content: FileMap[string]
): Promise<void> {
  if (filesAccess) {
    await filesAccess.writeFile(sandboxId, path, content);
    return;
  }
  await saveFile(sandboxId, path, content);
}

function wrapRunnerError(e: unknown): never {
  if (e instanceof ComputeBridgeError) throw e;
  if (e instanceof HostBridgeError) {
    throw new ComputeBridgeError(e.code || "binding_unavailable", e.message);
  }
  throw new ComputeBridgeError(
    "binding_unavailable",
    e instanceof Error ? e.message : String(e)
  );
}

export function createComputeBinding(
  sandboxId: string,
  admitted: readonly string[]
): Record<string, unknown> {
  const caps = filterKnownCapabilities(admitted).filter(
    (t): t is KnownCapability =>
      t === "compute:python" || t === "compute:cmd"
  );
  const has = new Set(caps);

  const binding: Record<string, unknown> = {
    async apiVersion() {
      return COMPUTE_API_VERSION;
    },
    async capabilities() {
      return [...caps];
    },
  };

  if (has.has("compute:python")) {
    binding.runPython = async (options: HostPythonRunOptions) => {
      try {
        return await runHostPython(options);
      } catch (e) {
        wrapRunnerError(e);
      }
    };
  }

  if (has.has("compute:cmd")) {
    binding.runCmd = async (
      options: Omit<HostCmdRunOptions, "files"> & { sandboxId?: string }
    ): Promise<Omit<HostCmdRunResult, "filesOut">> => {
      if (options.sandboxId && options.sandboxId !== sandboxId) {
        throw new ComputeBridgeError(
          "capability_not_granted",
          "env.COMPUTE.runCmd 僅能操作本沙盒檔案樹"
        );
      }
      try {
        const result = await runHostCmd({
          cmd: options.cmd,
          args: options.args,
          stdin: options.stdin,
          cwd: options.cwd,
          env:
            options.env != null
              ? { ...createDefaultShellEnv(options.cwd ?? ""), ...options.env }
              : undefined,
          timeoutMs: options.timeoutMs,
          signal: options.signal,
          projectId: sandboxId,
        });
        for (const [path, content] of Object.entries(result.filesOut)) {
          const norm = normalizeProjectPath(path);
          await writeFile(sandboxId, norm, content);
        }
        // OPFS mode mutations already on disk; optionally refresh shell work cache.
        if (
          filesAccess &&
          (result.changedPaths?.length || result.deletedPaths?.length)
        ) {
          await loadFiles(sandboxId);
        }
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          truncated: result.truncated,
        };
      } catch (e) {
        wrapRunnerError(e);
      }
    };
  }

  return binding;
}
