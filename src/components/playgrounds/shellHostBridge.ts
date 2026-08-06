/**
 * HostBridge implementation wired to Playgrounds shell state (DEC-017).
 */

import { hashBytes, hashUtf8 } from "./contentHash";
import {
  assertNotWritingActiveAgent,
  fileContentToUtf8,
  HostBridgeError,
  type HostBridge,
  type HostCanvasStatus,
  type HostCloneProjectOptions,
  type HostCreatePlatformInviteOptions,
  type HostCreateProjectOptions,
  type HostDomSnapshotResult,
  type HostMainTabSummary,
  type HostOpenFileOptions,
  type HostOpenMainCanvasOptions,
  type HostOpenToolOptions,
  type HostProjectSummary,
  type HostRevokePlatformInviteOptions,
  type HostToolSessionInfo,
  type HostWriteFileOptions,
} from "./hostBridge";
import { assertBinarySize, base64ToBytes, bytesToBase64 } from "./hostBinary";
import { getAgentRuntimeHub } from "./agentRuntimeHub";
import { loadFleetSnapshot, toFleetSummary } from "./fleet/loadFleetSnapshot";
import type { AgentUiPatch } from "./fleet/agentUiStore";
import { HOST_API_VERSION, HOST_CAPABILITIES } from "./hostCapabilities";
import {
  clearCheckpointsForProject,
  createCheckpoint,
  listCheckpoints as listStoredCheckpoints,
  restoreCheckpointIntoProject,
  type CheckpointMeta,
} from "./hostCheckpoint";
import { listDirFromFileMap, type ListDirOptions } from "./hostListDir";
import { BINDINGS_DIR, BINDINGS_VIRTUAL_LEAF_PATHS } from "./toolGrant";
import { searchFileMap, type HostSearchOptions } from "./hostSearch";
import {
  cloneProject,
  createDir,
  createProject,
  deleteDir,
  deleteFile,
  deleteProject as deleteOpfsProject,
  listProjectDirs,
  listProjects,
  loadFile,
  loadProjectFiles,
  readMeta,
  saveFile,
  updateProjectMeta,
} from "./sandboxAuthority";
import { isInWorkingSet } from "./workingSet";
import { clearMockKvStore } from "./mockKv";
import { clearMockDbStore } from "./mockDb";
import { getSecretStoreStatus, listSecretMetas } from "./secretStore";
import {
  hostCreatePlatformInvite,
  hostRevokePlatformInvite,
} from "./platform/platformHostProxy";
import { readSandboxIdField, readToolSandboxId } from "./sandboxIdCompat";
import { copyProjectState } from "./projectState";
import { normalizeProjectPath, sortProjectPaths } from "./pathUtils";
import {
  isAgentManagedProject,
  isBinaryContent,
  type FileMap,
  type ProjectMeta,
} from "./projectTypes";
import { listHostCmds, runHostCmd, type HostCmdRunOptions } from "./hostWasi";
import { createDefaultShellEnv } from "./shellEnv";
import {
  clearWorkConsoleBuffer,
  countWorkConsoleErrors,
  listWorkConsoleLines,
  waitWorkConsole,
  workConsoleBufferSize,
  type WaitWorkConsoleOptions,
} from "./workConsoleBuffer";
import {
  clearWorkNetworkBuffer,
  listWorkNetworkEntries,
  workNetworkBufferSize,
} from "./workNetworkBuffer";
import { clampDomSnapshotMaxChars, truncateDomSnapshot } from "./domSnapshot";
import { runHostPython, type HostPythonRunOptions } from "./hostPython";

export interface ShellHostContext {
  getActiveId: () => string | null;
  getActiveAgentId: () => string | null;
  /**
   * Persist active agent. Prefer deferring iframe reload so the in-flight
   * /api response from the previous agent can finish.
   */
  setActiveAgentId: (
    id: string | null,
    opts?: { deferReload?: boolean }
  ) => void | Promise<void>;
  getTargetOverride: () => string | null;
  setTargetOverride: (id: string | null) => void;
  /** Open project in the shell editor (sets activeId). */
  openProject: (id: string) => Promise<void>;
  /** Select a path in the shell editor / media preview (active work project). */
  openEditorFile: (path: string) => void | Promise<void>;
  /** After HOST deletes a project: clear shell selection if needed. */
  afterProjectDeleted: (id: string) => void | Promise<void>;
  /** In-memory work project files when target === activeId. */
  getWorkFiles: () => FileMap;
  /** In-memory empty dirs for the active work project. */
  getWorkDirs?: () => string[];
  patchWorkFile: (
    path: string,
    content: string | Uint8Array,
    options?: { reloadCanvas?: boolean }
  ) => void | Promise<void>;
  removeWorkPath: (path: string) => void | Promise<void>;
  reloadWorkCanvas: () => void | Promise<void>;
  refreshProjectList: () => Promise<void>;
  onProjectsChanged?: () => void | Promise<void>;
  getCanvasGeneration: () => number;
  /** After restore into the active work project, replace in-memory files. */
  replaceWorkProject?: (files: FileMap, dirs: string[]) => void | Promise<void>;
  onConsoleCleared?: () => void;
  onNetworkCleared?: () => void;
  /** Ask the work canvas iframe for a sanitized DOM summary. */
  requestDomSnapshot: (maxChars: number) => Promise<HostDomSnapshotResult>;
  /** Capture work canvas as PNG base64 (no data: prefix). */
  captureWorkCanvas: (opts?: {
    maxWidth?: number;
  }) => Promise<{ base64: string; mime: "image/png" }>;
  /** Optional viewport / canvas clip metrics for getCanvasStatus. */
  getWorkCanvasViewport?: () =>
    import("./hostBridge").HostCanvasViewport | null;
  /** Mount a Tool SAM in the Editor slot (DEC-022); host is always the work project. */
  openToolSession: (opts: {
    toolSandboxId: string;
    paths: string[];
    mode: "read" | "readwrite";
    focusPath?: string | null;
  }) => Promise<void>;
  closeToolSession: () => void | Promise<void>;
  getToolSession: () => HostToolSessionInfo | null;
  /** Main content tabs (DEC-030). */
  openMainCanvas: (opts: { sandboxId: string }) => Promise<HostMainTabSummary>;
  closeMainTab: (opts?: { tabId?: string }) => void | Promise<void>;
  setMainTab: (opts: { tabId: string }) => Promise<HostMainTabSummary>;
  listMainTabs: () =>
    | { tabs: HostMainTabSummary[]; activeTabId: string }
    | Promise<{ tabs: HostMainTabSummary[]; activeTabId: string }>;
  getMainTab: () => HostMainTabSummary | Promise<HostMainTabSummary>;
  /** Multi-agent session (DEC-023). */
  openMultiAgentSession: (opts?: {
    chatSessionId?: string;
    hostSandboxId?: string;
    targetSandboxId?: string | null;
  }) => Promise<{
    sessionId: string;
    channelName: string;
    protocolId: string;
    apiVersion: string;
    roles: string[];
    hostSandboxId?: string;
    targetSandboxId?: string;
  }>;
  closeMultiAgentSession: () => void | Promise<void>;
  pauseMultiAgentSession: () => void | Promise<void>;
  resumeMultiAgentSession: () => void | Promise<void>;
  getMultiAgentSession: () =>
    | {
        sessionId: string;
        channelName: string;
        protocolId: string;
        apiVersion: string;
        status: "open" | "paused";
        roles: string[];
      }
    | null
    | Promise<{
        sessionId: string;
        channelName: string;
        protocolId: string;
        apiVersion: string;
        status: "open" | "paused";
        roles: string[];
      } | null>;
  listMultiAgentSeats: () =>
    | {
        seatId: string;
        role: string;
        kind: "human" | "agent";
        sandboxId: string | null;
        paused: boolean;
      }[]
    | Promise<
        {
          seatId: string;
          role: string;
          kind: "human" | "agent";
          sandboxId: string | null;
          paused: boolean;
        }[]
      >;
  joinMultiAgentSeat: (opts: {
    sandboxId: string;
    role: string;
    protocolId: string;
    apiVersion: string;
    via?: "invite" | "apply";
  }) => Promise<{ seatId: string; role: string; sandboxId: string }>;
  leaveMultiAgentSeat: (seatId: string) => void | Promise<void>;
  spawnMultiAgentParticipant: (opts: {
    role?: string;
    name?: string;
    sourceSandboxId?: string;
  }) => Promise<{
    sandboxId: string;
    seatId: string;
    role: string;
    name: string;
  }>;
  /** Domain Host `/api/session/*` with event publish + fileWrites. */
  hostSessionDomainFetch: (
    path: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ) => Promise<unknown>;
}

async function resolveTargetId(ctx: ShellHostContext, sandboxId?: string) {
  if (sandboxId) return sandboxId;
  const override = ctx.getTargetOverride();
  if (override) return override;
  const active = ctx.getActiveId();
  if (!active) {
    throw new HostBridgeError("no_target", "尚未開啟工作沙盒");
  }
  return active;
}

async function loadTargetFiles(
  ctx: ShellHostContext,
  id: string
): Promise<FileMap> {
  if (id === ctx.getActiveId()) return ctx.getWorkFiles();
  return loadProjectFiles(id);
}

function parseWriteOptions(
  sandboxIdOrOptions?: string | HostWriteFileOptions
): HostWriteFileOptions {
  if (typeof sandboxIdOrOptions === "string") {
    return { sandboxId: sandboxIdOrOptions };
  }
  return sandboxIdOrOptions ?? {};
}

export function createShellHostBridge(ctx: ShellHostContext): HostBridge {
  return {
    async apiVersion() {
      return HOST_API_VERSION;
    },

    async capabilities() {
      return [...HOST_CAPABILITIES];
    },

    async listProjects(): Promise<HostProjectSummary[]> {
      const metas = await listProjects();
      return metas.map(m => ({
        id: m.id,
        name: m.name,
        updatedAt: m.updatedAt,
        source: m.source,
        agentManaged: m.agentManaged === true ? true : undefined,
        inWorkingSet: isInWorkingSet(m),
        clonedFrom: m.clonedFrom,
        cloneIntent: m.cloneIntent,
        toolKinds: m.toolKinds?.length ? [...m.toolKinds] : undefined,
        toolGlobs: m.toolGlobs?.length ? [...m.toolGlobs] : undefined,
      }));
    },

    async getProject(id: string): Promise<ProjectMeta | null> {
      try {
        return await readMeta(id);
      } catch {
        return null;
      }
    },

    async createProject(name: string, options?: HostCreateProjectOptions) {
      const trimmed = name?.trim();
      if (!trimmed) {
        throw new HostBridgeError("bad_path", "沙盒名稱不可為空");
      }
      const inWorkingSet = options?.inWorkingSet !== false;
      const meta = await createProject(trimmed, undefined, {
        agentManaged: true,
        inWorkingSet,
        cloneIntent: options?.cloneIntent ?? "steward_for_user",
      });
      await ctx.refreshProjectList();
      await ctx.onProjectsChanged?.();
      return meta;
    },

    async cloneProject(
      sourceId: string,
      newName?: string,
      options?: HostCloneProjectOptions
    ) {
      const inWorkingSet = options?.inWorkingSet === true;
      const meta = await cloneProject(sourceId, newName, {
        agentManaged: true,
        inWorkingSet,
        cloneIntent: options?.cloneIntent ?? "self_upgrade",
      });
      if (options?.state) {
        await copyProjectState(sourceId, meta.id, options.state);
      }
      await ctx.refreshProjectList();
      await ctx.onProjectsChanged?.();
      return meta;
    },

    async setWorkingSet(sandboxId: string, inWorkingSet: boolean) {
      if (typeof inWorkingSet !== "boolean") {
        throw new HostBridgeError("bad_args", "inWorkingSet 必須為 boolean");
      }
      try {
        await readMeta(sandboxId);
      } catch {
        throw new HostBridgeError("not_found", `找不到專案：${sandboxId}`);
      }
      const meta = await updateProjectMeta(sandboxId, { inWorkingSet });
      await ctx.refreshProjectList();
      await ctx.onProjectsChanged?.();
      return meta;
    },

    async deleteProject(id: string) {
      let meta: ProjectMeta;
      try {
        meta = await readMeta(id);
      } catch {
        throw new HostBridgeError("not_found", `找不到專案：${id}`);
      }
      if (!isAgentManagedProject(meta)) {
        throw new HostBridgeError(
          "forbidden",
          "只能刪除 Agent 經 HOST 建立／複製的沙盒，不可刪除使用者沙盒"
        );
      }
      if (id === ctx.getActiveAgentId()) {
        throw new HostBridgeError(
          "forbidden",
          "不可刪除總管；請先 setActiveAgent 切換到新版本"
        );
      }
      await deleteOpfsProject(id);
      await clearMockKvStore(id);
      await clearMockDbStore(id);
      await clearCheckpointsForProject(id);
      await ctx.afterProjectDeleted(id);
      await ctx.refreshProjectList();
      await ctx.onProjectsChanged?.();
      return { ok: true as const, id };
    },

    async openProject(id: string) {
      try {
        await readMeta(id);
      } catch {
        throw new HostBridgeError("not_found", `找不到專案：${id}`);
      }
      await ctx.openProject(id);
      await ctx.refreshProjectList();
      return (await readMeta(id)) as ProjectMeta;
    },

    async getActiveAgent() {
      return ctx.getActiveAgentId();
    },

    async setActiveAgent(sandboxId: string | null) {
      if (sandboxId) {
        await readMeta(sandboxId);
      }
      await ctx.setActiveAgentId(sandboxId, { deferReload: true });
    },

    async getTargetProject() {
      return resolveTargetId(ctx).catch(() => null);
    },

    async setTargetProject(sandboxId: string | null) {
      if (sandboxId) {
        await readMeta(sandboxId);
      }
      ctx.setTargetOverride(sandboxId);
    },

    async listFiles(sandboxId?: string) {
      const id = await resolveTargetId(ctx, sandboxId);
      if (id === ctx.getActiveId()) {
        return sortProjectPaths(Object.keys(ctx.getWorkFiles()));
      }
      const files = await loadProjectFiles(id);
      const dirs = await listProjectDirs(id);
      return sortProjectPaths([...Object.keys(files), ...dirs]);
    },

    async listDir(options?: ListDirOptions & { sandboxId?: string }) {
      const id = await resolveTargetId(ctx, options?.sandboxId);
      let files: FileMap;
      let dirs: string[];
      if (id === ctx.getActiveId()) {
        files = ctx.getWorkFiles();
        dirs =
          ctx.getWorkDirs?.() ?? (await listProjectDirs(id).catch(() => []));
      } else {
        files = await loadProjectFiles(id);
        dirs = await listProjectDirs(id);
      }
      try {
        const listFiles: FileMap = { ...files };
        for (const p of BINDINGS_VIRTUAL_LEAF_PATHS) {
          if (listFiles[p] === undefined) listFiles[p] = "";
        }
        return listDirFromFileMap(
          listFiles,
          {
            prefix: options?.prefix,
            depth: options?.depth,
            maxEntries: options?.maxEntries,
          },
          [...dirs, BINDINGS_DIR]
        );
      } catch (e) {
        throw new HostBridgeError(
          "bad_path",
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async readFile(path: string, sandboxId?: string) {
      const id = await resolveTargetId(ctx, sandboxId);
      const norm = normalizeProjectPath(path);
      if (!norm) {
        throw new HostBridgeError("bad_path", "路徑無效");
      }
      const files = await loadTargetFiles(ctx, id);
      const content = files[norm];
      if (content === undefined) {
        throw new HostBridgeError("not_found", `找不到檔案：${norm}`);
      }
      if (isBinaryContent(content)) {
        throw new HostBridgeError(
          "binary",
          `檔案為二進位，HOST.readFile 僅支援文字：${norm}`
        );
      }
      const text = fileContentToUtf8(content);
      return {
        path: norm,
        content: text,
        encoding: "utf-8" as const,
        hash: await hashUtf8(text),
      };
    },

    async writeFile(
      path: string,
      content: string,
      sandboxIdOrOptions?: string | HostWriteFileOptions
    ) {
      const opts = parseWriteOptions(sandboxIdOrOptions);
      const id = await resolveTargetId(ctx, opts.sandboxId);
      assertNotWritingActiveAgent(id, ctx.getActiveAgentId(), "writeFile");
      const norm = normalizeProjectPath(path);
      if (!norm) {
        throw new HostBridgeError("bad_path", "路徑無效");
      }
      if (opts.expectedHash) {
        const files = await loadTargetFiles(ctx, id);
        const existing = files[norm];
        if (existing !== undefined && !isBinaryContent(existing)) {
          const currentHash = await hashUtf8(fileContentToUtf8(existing));
          if (currentHash !== opts.expectedHash) {
            throw new HostBridgeError(
              "conflict",
              `檔案內容已變更（expectedHash 不符）：${norm}`
            );
          }
        } else if (existing === undefined && opts.expectedHash) {
          throw new HostBridgeError(
            "conflict",
            `檔案不存在，無法套用 expectedHash：${norm}`
          );
        } else if (existing !== undefined && isBinaryContent(existing)) {
          throw new HostBridgeError(
            "binary",
            `檔案為二進位，無法以 expectedHash 覆寫：${norm}`
          );
        }
      }
      if (id === ctx.getActiveId()) {
        await ctx.patchWorkFile(norm, content);
      } else {
        await saveFile(id, norm, content);
      }
      return { path: norm, hash: await hashUtf8(content) };
    },

    async mkdir(path: string, sandboxId?: string) {
      const id = await resolveTargetId(ctx, sandboxId);
      assertNotWritingActiveAgent(id, ctx.getActiveAgentId(), "mkdir");
      const norm = normalizeProjectPath(path);
      if (!norm) {
        throw new HostBridgeError("bad_path", "路徑無效");
      }
      await createDir(id, norm);
      return { path: norm };
    },

    async remove(path: string, sandboxId?: string) {
      const id = await resolveTargetId(ctx, sandboxId);
      assertNotWritingActiveAgent(id, ctx.getActiveAgentId(), "remove");
      const norm = normalizeProjectPath(path);
      if (!norm) {
        throw new HostBridgeError("bad_path", "路徑無效");
      }
      if (id === ctx.getActiveId()) {
        await ctx.removeWorkPath(norm);
      } else {
        try {
          await deleteFile(id, norm);
        } catch {
          await deleteDir(id, norm);
        }
      }
      return { path: norm };
    },

    async reloadCanvas() {
      await ctx.reloadWorkCanvas();
      return { ok: true as const };
    },

    async getConsole(since?: number) {
      return listWorkConsoleLines(since);
    },

    async clearConsole() {
      clearWorkConsoleBuffer();
      ctx.onConsoleCleared?.();
      return { ok: true as const };
    },

    async waitConsole(options: WaitWorkConsoleOptions) {
      try {
        return await waitWorkConsole(options);
      } catch (e) {
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "";
        if (code === "cancelled") {
          throw new HostBridgeError("cancelled", "waitConsole 已取消");
        }
        throw e;
      }
    },

    async getCanvasStatus(): Promise<HostCanvasStatus> {
      const sandboxId = await resolveTargetId(ctx).catch(() => null);
      const viewport = ctx.getWorkCanvasViewport?.() ?? null;
      return {
        hasTarget: Boolean(sandboxId),
        sandboxId,
        generation: ctx.getCanvasGeneration(),
        consoleSize: workConsoleBufferSize(),
        networkSize: workNetworkBufferSize(),
        recentErrorCount: countWorkConsoleErrors(),
        entry: "index.html",
        viewport,
      };
    },

    async getNetworkLog(since?: number) {
      return listWorkNetworkEntries(since);
    },

    async clearNetworkLog() {
      clearWorkNetworkBuffer();
      ctx.onNetworkCleared?.();
      return { ok: true as const };
    },

    async getDomSnapshot(options?: {
      maxChars?: number;
    }): Promise<HostDomSnapshotResult> {
      const maxChars = clampDomSnapshotMaxChars(options?.maxChars);
      try {
        const result = await ctx.requestDomSnapshot(maxChars);
        const clipped = truncateDomSnapshot(result.text, maxChars);
        return {
          text: clipped.text,
          truncated: result.truncated || clipped.truncated,
        };
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "";
        if (code === "timeout") {
          throw new HostBridgeError("timeout", "getDomSnapshot 逾時");
        }
        if (code === "no_target") {
          throw new HostBridgeError("no_target", "工作畫布尚未載入");
        }
        throw new HostBridgeError(
          "not_supported",
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async runPython(options: HostPythonRunOptions) {
      try {
        return await runHostPython(options);
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        throw new HostBridgeError(
          "python_failed",
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async runCmd(
      options: Omit<HostCmdRunOptions, "files"> & { sandboxId?: string }
    ) {
      const id = await resolveTargetId(ctx, options.sandboxId);
      assertNotWritingActiveAgent(id, ctx.getActiveAgentId(), "runCmd");
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
          projectId: id,
        });
        // Memory-mode leftovers (tests／fallback).
        for (const [path, content] of Object.entries(result.filesOut)) {
          const norm = normalizeProjectPath(path);
          if (id === ctx.getActiveId()) {
            await ctx.patchWorkFile(norm, content);
          } else {
            await saveFile(id, norm, content);
          }
        }
        // OPFS fd path: refresh UI／work buffer from authority storage.
        // Worker already mutated disk; avoid double-write via saveFile.
        for (const path of result.deletedPaths ?? []) {
          const norm = normalizeProjectPath(path);
          if (id === ctx.getActiveId()) {
            try {
              await ctx.removeWorkPath(norm);
            } catch {
              /* disk may already be gone — drop from in-memory map via reload */
              const fresh = await loadProjectFiles(id);
              if (ctx.replaceWorkProject) {
                const dirList = ctx.getWorkDirs?.() ?? [];
                await ctx.replaceWorkProject(fresh, dirList);
              }
            }
          }
        }
        for (const path of result.changedPaths ?? []) {
          const norm = normalizeProjectPath(path);
          if ((result.deletedPaths ?? []).includes(path)) continue;
          const content = await loadFile(id, norm);
          if (content === undefined || id !== ctx.getActiveId()) continue;
          if (ctx.replaceWorkProject) {
            await ctx.replaceWorkProject(
              { ...ctx.getWorkFiles(), [norm]: content },
              ctx.getWorkDirs?.() ?? []
            );
          } else {
            await ctx.patchWorkFile(norm, content, { reloadCanvas: false });
          }
        }
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          truncated: result.truncated,
        };
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        throw new HostBridgeError(
          "wasi_unavailable",
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async listCmds() {
      return listHostCmds();
    },

    async readFileBase64(path: string, sandboxId?: string) {
      const id = await resolveTargetId(ctx, sandboxId);
      const norm = normalizeProjectPath(path);
      if (!norm) {
        throw new HostBridgeError("bad_path", "路徑無效");
      }
      const files = await loadTargetFiles(ctx, id);
      const content = files[norm];
      if (content === undefined) {
        throw new HostBridgeError("not_found", `找不到檔案：${norm}`);
      }
      const bytes =
        typeof content === "string"
          ? new TextEncoder().encode(content)
          : content;
      assertBinarySize(bytes.byteLength, "readFileBase64");
      return {
        path: norm,
        base64: bytesToBase64(bytes),
        encoding: "base64" as const,
        byteLength: bytes.byteLength,
        hash: await hashBytes(bytes),
      };
    },

    async writeFileBase64(path: string, base64: string, sandboxId?: string) {
      const id = await resolveTargetId(ctx, sandboxId);
      assertNotWritingActiveAgent(
        id,
        ctx.getActiveAgentId(),
        "writeFileBase64"
      );
      const norm = normalizeProjectPath(path);
      if (!norm) {
        throw new HostBridgeError("bad_path", "路徑無效");
      }
      if (typeof base64 !== "string") {
        throw new HostBridgeError("bad_path", "需要 base64 字串");
      }
      const bytes = base64ToBytes(base64);
      assertBinarySize(bytes.byteLength, "writeFileBase64");
      if (id === ctx.getActiveId()) {
        await ctx.patchWorkFile(norm, bytes);
      } else {
        await saveFile(id, norm, bytes);
      }
      return {
        path: norm,
        byteLength: bytes.byteLength,
        hash: await hashBytes(bytes),
      };
    },

    async openFile(
      pathOrOptions: string | HostOpenFileOptions,
      sandboxId?: string
    ) {
      const opts: HostOpenFileOptions =
        typeof pathOrOptions === "string"
          ? { path: pathOrOptions, sandboxId }
          : {
              ...pathOrOptions,
              sandboxId: pathOrOptions.sandboxId ?? sandboxId,
            };
      const id = await resolveTargetId(ctx, opts.sandboxId);
      const norm = normalizeProjectPath(opts.path);
      if (!norm) {
        throw new HostBridgeError("bad_path", "路徑無效");
      }

      const activeId = ctx.getActiveId();
      if (id !== activeId) {
        throw new HostBridgeError(
          "bad_request",
          "openFile 僅作用於目前工作沙盒緩衝（終端指令）；請先 openProject，或對已開啟緩衝傳 content／focusOnly"
        );
      }

      const hasText = opts.content !== undefined;
      const hasB64 = opts.contentBase64 !== undefined;
      if (hasText && hasB64) {
        throw new HostBridgeError(
          "bad_request",
          "openFile 不可同時傳 content 與 contentBase64"
        );
      }

      if (hasText) {
        await ctx.patchWorkFile(norm, opts.content!, { reloadCanvas: false });
        await ctx.openEditorFile(norm);
        return { path: norm, sandboxId: id };
      }
      if (hasB64) {
        const bytes = base64ToBytes(opts.contentBase64!);
        assertBinarySize(bytes.byteLength, "openFile");
        await ctx.patchWorkFile(norm, bytes, { reloadCanvas: false });
        await ctx.openEditorFile(norm);
        return { path: norm, sandboxId: id };
      }

      // Terminal: only the in-memory work buffer — never authority load.
      const files = ctx.getWorkFiles();
      if (!opts.focusOnly && files[norm] === undefined) {
        throw new HostBridgeError("not_found", `找不到檔案：${norm}`);
      }
      await ctx.openEditorFile(norm);
      return { path: norm, sandboxId: id };
    },

    async openTool(options: HostOpenToolOptions) {
      const workId = ctx.getActiveId();
      if (!workId) {
        throw new HostBridgeError("no_target", "尚未開啟工作沙盒");
      }
      const toolSandboxId = readToolSandboxId(options);
      if (!toolSandboxId) {
        throw new HostBridgeError("bad_grant", "需要 toolSandboxId");
      }
      if (!Array.isArray(options.paths) || options.paths.length === 0) {
        throw new HostBridgeError("bad_grant", "需要 paths");
      }
      const mode = options.mode === "read" ? "read" : "readwrite";
      try {
        await ctx.openToolSession({
          toolSandboxId,
          paths: options.paths.map(String),
          mode,
          focusPath: options.focusPath ?? null,
        });
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "bad_grant";
        throw new HostBridgeError(
          code,
          e instanceof Error ? e.message : String(e)
        );
      }
      const session = ctx.getToolSession();
      if (!session) {
        throw new HostBridgeError("tool_inactive", "開啟工具後 session 為空");
      }
      return session;
    },

    async closeTool() {
      await ctx.closeToolSession();
      return { ok: true as const };
    },

    async getToolSession() {
      return ctx.getToolSession();
    },

    async openMainCanvas(options: HostOpenMainCanvasOptions) {
      const workId = ctx.getActiveId();
      if (!workId) {
        throw new HostBridgeError("no_target", "尚未開啟工作沙盒");
      }
      const sandboxId = readSandboxIdField(options);
      if (!sandboxId) {
        throw new HostBridgeError("bad_grant", "需要 sandboxId");
      }
      try {
        return await ctx.openMainCanvas({ sandboxId });
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "bad_grant";
        throw new HostBridgeError(
          code,
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async closeMainTab(options?: { tabId?: string }) {
      await ctx.closeMainTab(options);
      return { ok: true as const };
    },

    async setMainTab(options: { tabId: string }) {
      const tabId = String(options?.tabId ?? "").trim();
      if (!tabId) {
        throw new HostBridgeError("main_tab_not_found", "需要 tabId");
      }
      try {
        return await ctx.setMainTab({ tabId });
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "main_tab_not_found";
        throw new HostBridgeError(
          code,
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async listMainTabs() {
      return ctx.listMainTabs();
    },

    async getMainTab() {
      return ctx.getMainTab();
    },

    async openSession(options?: { chatSessionId?: string }) {
      try {
        const agentId = ctx.getActiveAgentId();
        const workId = ctx.getActiveId();
        if (!agentId) {
          throw new HostBridgeError(
            "no_agent",
            "請先設總管（總管自任 coding-orchestration Host）"
          );
        }
        return await ctx.openMultiAgentSession({
          ...(options?.chatSessionId?.trim()
            ? { chatSessionId: options.chatSessionId.trim() }
            : {}),
          hostSandboxId: agentId,
          targetSandboxId: workId,
        });
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "session_inactive";
        throw new HostBridgeError(
          code,
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async closeSession() {
      await ctx.closeMultiAgentSession();
      return { ok: true as const };
    },

    async pauseSession() {
      await ctx.pauseMultiAgentSession();
      return { ok: true as const, status: "paused" as const };
    },

    async resumeSession() {
      await ctx.resumeMultiAgentSession();
      return { ok: true as const, status: "open" as const };
    },

    async getSession() {
      return await ctx.getMultiAgentSession();
    },

    async listSeats() {
      return await ctx.listMultiAgentSeats();
    },

    async joinSeat(options: {
      sandboxId: string;
      role: string;
      protocolId: string;
      apiVersion: string;
      via?: "invite" | "apply";
    }) {
      try {
        return await ctx.joinMultiAgentSeat({
          ...options,
          via: options.via === "invite" ? "invite" : "apply",
        });
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "protocol_mismatch";
        throw new HostBridgeError(
          code,
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async leaveSeat(seatId: string) {
      await ctx.leaveMultiAgentSeat(seatId);
      return { ok: true as const };
    },

    async spawnParticipant(options?: {
      role?: string;
      name?: string;
      sourceSandboxId?: string;
    }) {
      try {
        return await ctx.spawnMultiAgentParticipant({
          role: options?.role,
          name: options?.name,
          sourceSandboxId: options?.sourceSandboxId,
        });
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "session_inactive";
        throw new HostBridgeError(
          code,
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async hostSessionFetch(
      path: string,
      init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }
    ) {
      try {
        return await ctx.hostSessionDomainFetch(path, init);
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : "act_rejected";
        throw new HostBridgeError(
          code,
          e instanceof Error ? e.message : String(e)
        );
      }
    },

    async captureCanvas(options?: { path?: string; maxWidth?: number }) {
      let capture: { base64: string; mime: "image/png" };
      try {
        capture = await ctx.captureWorkCanvas({
          maxWidth: options?.maxWidth,
        });
      } catch (e) {
        if (e instanceof HostBridgeError) throw e;
        throw new HostBridgeError(
          "capture_failed",
          e instanceof Error ? e.message : String(e)
        );
      }
      const bytes = base64ToBytes(capture.base64);
      assertBinarySize(bytes.byteLength, "captureCanvas");
      const path = options?.path?.trim();
      const note =
        "Live work canvas was not remounted. Do NOT call reload_canvas after capture_canvas — that resets SPA/game state. Screenshot may include full scrollable content; call get_canvas_status and check viewport.clipped / overflow before claiming the default preview shows everything.";
      if (path) {
        const id = await resolveTargetId(ctx);
        assertNotWritingActiveAgent(
          id,
          ctx.getActiveAgentId(),
          "captureCanvas"
        );
        const norm = normalizeProjectPath(path);
        if (!norm) {
          throw new HostBridgeError("bad_path", "路徑無效");
        }
        assertBinarySize(bytes.byteLength, "captureCanvas");
        if (id === ctx.getActiveId()) {
          await ctx.patchWorkFile(norm, bytes, { reloadCanvas: false });
        } else {
          await saveFile(id, norm, bytes);
        }
        return {
          path: norm,
          mime: "image/png" as const,
          byteLength: bytes.byteLength,
          note,
        };
      }
      return {
        base64: capture.base64,
        mime: "image/png" as const,
        byteLength: bytes.byteLength,
        note,
      };
    },

    async listSecretNames(_sandboxId?: string) {
      const secrets = await listSecretMetas();
      return { names: secrets.map(s => s.name) };
    },

    async getSecretStoreStatus() {
      return getSecretStoreStatus();
    },

    async listSecrets() {
      return { secrets: await listSecretMetas() };
    },

    async createPlatformInvite(options?: HostCreatePlatformInviteOptions) {
      return hostCreatePlatformInvite(options);
    },

    async revokePlatformInvite(options: HostRevokePlatformInviteOptions) {
      return hostRevokePlatformInvite(options);
    },

    async search(options: HostSearchOptions) {
      if (!options?.query) {
        throw new HostBridgeError("bad_path", "search 需要 query");
      }
      const id = await resolveTargetId(ctx);
      const files = await loadTargetFiles(ctx, id);
      return { matches: searchFileMap(files, options) };
    },

    async checkpoint(label?: string): Promise<CheckpointMeta> {
      const id = await resolveTargetId(ctx);
      assertNotWritingActiveAgent(id, ctx.getActiveAgentId(), "checkpoint");
      const files = await loadTargetFiles(ctx, id);
      const dirs = id === ctx.getActiveId() ? [] : await listProjectDirs(id);
      // Include empty dirs from OPFS when active; work memory may omit empty dirs.
      const opfsDirs = await listProjectDirs(id).catch(() => dirs);
      return createCheckpoint(id, files, opfsDirs, label);
    },

    async restore(checkpointId: string) {
      if (!checkpointId) {
        throw new HostBridgeError("bad_path", "缺少 checkpointId");
      }
      const id = await resolveTargetId(ctx);
      assertNotWritingActiveAgent(id, ctx.getActiveAgentId(), "restore");
      const currentFiles = Object.keys(await loadTargetFiles(ctx, id));
      const currentDirs = await listProjectDirs(id);
      const { files, dirs, meta } = await restoreCheckpointIntoProject(
        id,
        checkpointId,
        currentFiles,
        currentDirs
      );
      if (id === ctx.getActiveId() && ctx.replaceWorkProject) {
        await ctx.replaceWorkProject(files, dirs);
      }
      await ctx.refreshProjectList();
      await ctx.reloadWorkCanvas();
      return { ok: true as const, meta };
    },

    async listCheckpoints() {
      const id = await resolveTargetId(ctx);
      return listStoredCheckpoints(id);
    },

    async listFleetSummary(options?: {
      includeTraffic?: boolean;
      maxNodes?: number;
    }) {
      const metas = await listProjects();
      const includeTraffic = options?.includeTraffic === true;
      const snap = await loadFleetSnapshot({
        projects: metas,
        opts: {
          includeTraffic,
          maxNodes:
            typeof options?.maxNodes === "number" && options.maxNodes > 0
              ? Math.floor(options.maxNodes)
              : undefined,
        },
      });
      return toFleetSummary(snap, { includeTraffic });
    },

    async getAgentUi(agentId: string) {
      const id = agentId?.trim();
      if (!id) {
        throw new HostBridgeError("bad_args", "需要 agentId");
      }
      const hub = await getAgentRuntimeHub();
      return hub.agentUi.get(id);
    },

    async setAgentUi(agentId: string, patch: AgentUiPatch) {
      const id = agentId?.trim();
      if (!id) {
        throw new HostBridgeError("bad_args", "需要 agentId");
      }
      if (!patch || typeof patch !== "object") {
        throw new HostBridgeError("bad_args", "需要 patch 物件");
      }
      const hub = await getAgentRuntimeHub();
      try {
        await hub.runtime.registry.require(id);
      } catch {
        throw new HostBridgeError("not_found", `找不到 Agent：${id}`);
      }
      return hub.agentUi.set(id, patch);
    },
  };
}
