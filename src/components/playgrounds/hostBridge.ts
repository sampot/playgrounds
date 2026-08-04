/**
 * Shell-registered host API for the active Agent's functions.js (DEC-017).
 * Injected as env.HOST only when sandboxId === activeAgentSandboxId.
 */

import type { FileContent } from "./fileContent";
import {
  HOST_API_VERSION,
  HOST_CAPABILITIES,
  type HostCapability,
} from "./hostCapabilities";
import type { CheckpointMeta } from "./hostCheckpoint";
import type { ListDirOptions, ListDirResult } from "./hostListDir";
import type { HostSearchMatch, HostSearchOptions } from "./hostSearch";
import type { CloneIntent, ProjectMeta } from "./projectTypes";
import type { HostPythonRunOptions, HostPythonRunResult } from "./hostPython";
import type {
  HostCmdRunOptions,
  HostCmdRunResult,
  WasiCmdInfo,
} from "./hostWasi";
import type { ToolGrantMode } from "./toolGrant";
import type {
  WaitWorkConsoleOptions,
  WaitWorkConsoleResult,
  WorkConsoleLine,
} from "./workConsoleBuffer";
import type { WorkNetworkEntry } from "./workNetworkBuffer";

export interface HostOpenToolOptions {
  toolSandboxId?: string;
  /** @deprecated use toolSandboxId */
  toolProjectId?: string;
  /** Paths or directory prefixes to grant on the work project. */
  paths: string[];
  mode?: ToolGrantMode;
  focusPath?: string;
}

/**
 * Terminal openFile payload (DEC-038). Content avoids shell→authority fetch.
 */
export interface HostOpenFileOptions {
  path: string;
  sandboxId?: string;
  /** Text content to place in the work buffer before focusing. */
  content?: string;
  /** Binary content (base64) to place in the work buffer before focusing. */
  contentBase64?: string;
  /** Focus path already in the active work buffer; do not require presence check via authority. */
  focusOnly?: boolean;
}

export interface HostToolSessionInfo {
  toolSandboxId: string;
  hostSandboxId: string;
  paths: string[];
  mode: ToolGrantMode;
  focusPath?: string;
}

/** Main content canvas tab (DEC-030); plain unless later upgraded via openTool. */
export interface HostOpenMainCanvasOptions {
  sandboxId?: string;
  /** @deprecated use sandboxId */
  projectId?: string;
}

export interface HostMainTabSummary {
  tabId: string;
  kind: "editor" | "canvas";
  sandboxId?: string;
  hasGrant: boolean;
  focusPath?: string;
  label: string;
}

export class HostBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HostBridgeError";
    this.code = code;
  }
}

export interface HostProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  source?: string;
  /** When true, HOST.deleteProject is allowed. */
  agentManaged?: boolean;
  /**
   * Effective working-set membership (Picker). Always resolved via
   * `isInWorkingSet` (DEC-028 migration for missing meta).
   */
  inWorkingSet: boolean;
  /** Direct clone source sandboxId when present. */
  clonedFrom?: string;
  /** Clone / steward-create intent when present. */
  cloneIntent?: CloneIntent;
  /** Tool discovery: kinds when mounted as a Tool SAM (e.g. `editor:text`). */
  toolKinds?: string[];
  /** Tool discovery: preferred path/basename globs (e.g. `*.md`). */
  toolGlobs?: string[];
}

/** Options for HOST.createProject (DEC-028). */
export interface HostCreateProjectOptions {
  inWorkingSet?: boolean;
  cloneIntent?: CloneIntent;
}

/** Options for HOST.cloneProject (DEC-028 + durable state). */
export interface HostCloneProjectOptions {
  /** Copy selected durable state (KV / DB / Secrets). Default: none. */
  state?: {
    kv?: boolean;
    db?: boolean;
    /** @deprecated use db */
    d1?: boolean;
    secrets?: boolean;
  };
  inWorkingSet?: boolean;
  cloneIntent?: CloneIntent;
}

export interface HostCanvasViewportCanvas {
  id: string;
  backingWidth: number;
  backingHeight: number;
  clientWidth: number;
  clientHeight: number;
  visibleWidthRatio: number;
  visibleHeightRatio: number;
  clipped: boolean;
}

export interface HostCanvasViewport {
  iframeWidth: number;
  iframeHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  scrollX: number;
  scrollY: number;
  overflowX: boolean;
  overflowY: boolean;
  canvases: HostCanvasViewportCanvas[];
  clipped: boolean;
  note: string;
}

export interface HostCanvasStatus {
  hasTarget: boolean;
  sandboxId: string | null;
  generation: number;
  consoleSize: number;
  networkSize: number;
  recentErrorCount: number;
  entry: string;
  /** Layout fit of the work preview iframe (overflow / clipped canvases). */
  viewport?: HostCanvasViewport | null;
}

export interface HostDomSnapshotResult {
  text: string;
  truncated: boolean;
}

export interface HostWriteFileOptions {
  sandboxId?: string;
  expectedHash?: string;
}

export interface HostBridge {
  apiVersion(): Promise<string>;
  capabilities(): Promise<HostCapability[]>;
  listProjects(): Promise<HostProjectSummary[]>;
  getProject(id: string): Promise<ProjectMeta | null>;
  createProject(
    name: string,
    options?: HostCreateProjectOptions
  ): Promise<ProjectMeta>;
  cloneProject(
    sourceId: string,
    newName?: string,
    options?: HostCloneProjectOptions
  ): Promise<ProjectMeta>;
  /** Add / remove from user working set (Picker). Does not change agentManaged. */
  setWorkingSet(sandboxId: string, inWorkingSet: boolean): Promise<ProjectMeta>;
  /** Only agentManaged projects; cannot delete the active agent. */
  deleteProject(id: string): Promise<{ ok: true; id: string }>;
  /** Open a project in the shell editor / work canvas (activeId). */
  openProject(id: string): Promise<ProjectMeta>;
  getActiveAgent(): Promise<string | null>;
  setActiveAgent(sandboxId: string | null): Promise<void>;
  getTargetProject(): Promise<string | null>;
  setTargetProject(sandboxId: string | null): Promise<void>;
  listFiles(sandboxId?: string): Promise<string[]>;
  /** Truncated directory listing (DEC-027); prefer over listFiles for large projects. */
  listDir(
    options?: ListDirOptions & { sandboxId?: string }
  ): Promise<ListDirResult>;
  readFile(
    path: string,
    sandboxId?: string
  ): Promise<{
    path: string;
    content: string;
    encoding: "utf-8";
    hash: string;
  }>;
  writeFile(
    path: string,
    content: string,
    sandboxIdOrOptions?: string | HostWriteFileOptions
  ): Promise<{ path: string; hash: string }>;
  mkdir(path: string, sandboxId?: string): Promise<{ path: string }>;
  remove(path: string, sandboxId?: string): Promise<{ path: string }>;
  reloadCanvas(): Promise<{ ok: true }>;
  getConsole(since?: number): Promise<WorkConsoleLine[]>;
  clearConsole(): Promise<{ ok: true }>;
  waitConsole(options: WaitWorkConsoleOptions): Promise<WaitWorkConsoleResult>;
  getCanvasStatus(): Promise<HostCanvasStatus>;
  getNetworkLog(since?: number): Promise<WorkNetworkEntry[]>;
  clearNetworkLog(): Promise<{ ok: true }>;
  getDomSnapshot(options?: {
    maxChars?: number;
  }): Promise<HostDomSnapshotResult>;
  runPython(options: HostPythonRunOptions): Promise<HostPythonRunResult>;
  /**
   * Run an allowlisted WASI CLI against the target project FS (DEC-021).
   * File writes from the command are applied to the project; not returned here.
   */
  runCmd(
    options: Omit<HostCmdRunOptions, "files"> & { sandboxId?: string }
  ): Promise<Omit<HostCmdRunResult, "filesOut">>;
  listCmds(): Promise<{ commands: WasiCmdInfo[] }>;
  readFileBase64(
    path: string,
    sandboxId?: string
  ): Promise<{
    path: string;
    base64: string;
    encoding: "base64";
    byteLength: number;
    hash: string;
  }>;
  writeFileBase64(
    path: string,
    base64: string,
    sandboxId?: string
  ): Promise<{ path: string; byteLength: number; hash: string }>;
  /**
   * Open a path in the shell editor / media preview (DEC-038 terminal).
   * Must complete without Runtime／OPFS authority round-trip:
   * - pass `content`／`contentBase64`, or
   * - path already in the active work buffer (`focusOnly`／in-memory files).
   */
  openFile(
    pathOrOptions: string | HostOpenFileOptions,
    sandboxId?: string
  ): Promise<{ path: string; sandboxId: string }>;
  /**
   * Mount another SAM as a tool in the Editor slot (DEC-022).
   * Does not change the work project; grant host is always the current work project.
   */
  openTool(options: HostOpenToolOptions): Promise<HostToolSessionInfo>;
  closeTool(): Promise<{ ok: true }>;
  getToolSession(): Promise<HostToolSessionInfo | null>;
  /** Open another SAM canvas in main content tabs (DEC-030); no grant. */
  openMainCanvas(
    options: HostOpenMainCanvasOptions
  ): Promise<HostMainTabSummary>;
  closeMainTab(options?: { tabId?: string }): Promise<{ ok: true }>;
  setMainTab(options: { tabId: string }): Promise<HostMainTabSummary>;
  listMainTabs(): Promise<{
    tabs: HostMainTabSummary[];
    activeTabId: string;
  }>;
  getMainTab(): Promise<HostMainTabSummary>;
  /** Multi-agent session (DEC-023); Host = current work project. */
  openSession(options?: { chatSessionId?: string }): Promise<{
    sessionId: string;
    channelName: string;
    protocolId: string;
    apiVersion: string;
    roles: string[];
  }>;
  closeSession(): Promise<{ ok: true }>;
  pauseSession(): Promise<{ ok: true; status: "paused" }>;
  resumeSession(): Promise<{ ok: true; status: "open" }>;
  /** Current multi-agent channel, or null when inactive. */
  getSession(): Promise<{
    sessionId: string;
    channelName: string;
    protocolId: string;
    apiVersion: string;
    status: "open" | "paused";
    roles: string[];
  } | null>;
  listSeats(): Promise<
    {
      seatId: string;
      role: string;
      kind: "human" | "agent";
      sandboxId: string | null;
      paused: boolean;
    }[]
  >;
  joinSeat(options: {
    sandboxId: string;
    role: string;
    protocolId: string;
    apiVersion: string;
    /** Default apply; Host spawn uses invite. */
    via?: "invite" | "apply";
  }): Promise<{ seatId: string; role: string; sandboxId: string }>;
  leaveSeat(seatId: string): Promise<{ ok: true }>;
  /** Clone/create participant then join via invite (Host / Steward). */
  spawnParticipant(options?: {
    role?: string;
    name?: string;
    sourceSandboxId?: string;
  }): Promise<{
    sandboxId: string;
    seatId: string;
    role: string;
    name: string;
  }>;
  /**
   * Call work Host `functions.js` `/api/session/*` (assign／state／…).
   * Shell publishes returned `events` and persists `fileWrites`.
   */
  hostSessionFetch(
    path: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<unknown>;
  captureCanvas(options?: { path?: string; maxWidth?: number }): Promise<{
    path?: string;
    base64?: string;
    mime: "image/png";
    byteLength: number;
    /** Reminder for agents: capture does not remount; do not reload afterwards. */
    note?: string;
  }>;
  /**
   * @deprecated Prefer listSecrets(). Names from playground SecretStore (no values).
   * sandboxId ignored (store is playground-level).
   */
  listSecretNames(sandboxId?: string): Promise<{ names: string[] }>;
  /** SecretStore status (no values; unlock only via shell UI). */
  getSecretStoreStatus(): Promise<{
    state: "absent" | "locked" | "unlocked";
    secretCount?: number;
    webauthnRegistered?: boolean;
  }>;
  /** Secret metas from SecretStore (no values). */
  listSecrets(): Promise<{
    secrets: {
      name: string;
      kind?: "bearer" | "header" | "basic";
      allowedHosts?: string[];
      defaultBaseUrl?: string;
      updatedAt: number;
    }[];
  }>;
  search(options: HostSearchOptions): Promise<{ matches: HostSearchMatch[] }>;
  checkpoint(label?: string): Promise<CheckpointMeta>;
  restore(checkpointId: string): Promise<{ ok: true; meta: CheckpointMeta }>;
  listCheckpoints(): Promise<CheckpointMeta[]>;
  /**
   * Read-only Agent fleet summary (DEC-032). No message payloads / secrets.
   */
  listFleetSummary(options?: {
    includeTraffic?: boolean;
    maxNodes?: number;
  }): Promise<{
    leader: { isLeader: boolean; epoch: number };
    counts: Record<string, number>;
    pressure: {
      mailboxDepthTotal: number;
      nearFullCount: number;
      poisonTotal: number;
    };
    attention: {
      agentId: string;
      reason: string;
      severity: "warn" | "error";
      detail?: string;
    }[];
    agents: {
      agentId: string;
      sandboxId: string;
      name: string;
      status: string;
      mailboxDepth: number;
      poisonCount: number;
      inFlight: boolean;
      inWorkingSet: boolean;
      agentManaged: boolean;
      clonedFrom?: string;
      cloneIntent?: string;
      roleLabel?: string;
      health?: "ok" | "warn" | "error";
      healthDetail?: string;
    }[];
    traffic?: { from: string; to: string; weight: number }[];
    generatedAt: number;
  }>;
  /** Read agent.ui annotation (display hints only). */
  getAgentUi(agentId: string): Promise<{
    roleLabel?: string;
    groupId?: string;
    health?: "ok" | "warn" | "error";
    healthDetail?: string;
    successorOf?: string;
  } | null>;
  /** Merge agent.ui annotation; null field clears. */
  setAgentUi(
    agentId: string,
    patch: {
      roleLabel?: string | null;
      groupId?: string | null;
      health?: "ok" | "warn" | "error" | null;
      healthDetail?: string | null;
      successorOf?: string | null;
    }
  ): Promise<{
    roleLabel?: string;
    groupId?: string;
    health?: "ok" | "warn" | "error";
    healthDetail?: string;
    successorOf?: string;
  } | null>;
}

let bridge: HostBridge | null = null;

export function registerHostBridge(impl: HostBridge | null): void {
  bridge = impl;
}

export function getHostBridge(): HostBridge | null {
  return bridge;
}

/** Thin object exposed on env.HOST (methods bound to the registered bridge). */
export function createHostBinding(): HostBridge {
  return {
    apiVersion: async (...args) => requireBridge().apiVersion(...args),
    capabilities: async (...args) => requireBridge().capabilities(...args),
    listProjects: async (...args) => requireBridge().listProjects(...args),
    getProject: async (...args) => requireBridge().getProject(...args),
    createProject: async (...args) => requireBridge().createProject(...args),
    cloneProject: async (...args) => requireBridge().cloneProject(...args),
    setWorkingSet: async (...args) => requireBridge().setWorkingSet(...args),
    deleteProject: async (...args) => requireBridge().deleteProject(...args),
    openProject: async (...args) => requireBridge().openProject(...args),
    getActiveAgent: async (...args) => requireBridge().getActiveAgent(...args),
    setActiveAgent: async (...args) => requireBridge().setActiveAgent(...args),
    getTargetProject: async (...args) =>
      requireBridge().getTargetProject(...args),
    setTargetProject: async (...args) =>
      requireBridge().setTargetProject(...args),
    listFiles: async (...args) => requireBridge().listFiles(...args),
    listDir: async (...args) => requireBridge().listDir(...args),
    readFile: async (...args) => requireBridge().readFile(...args),
    writeFile: async (...args) => requireBridge().writeFile(...args),
    mkdir: async (...args) => requireBridge().mkdir(...args),
    remove: async (...args) => requireBridge().remove(...args),
    reloadCanvas: async (...args) => requireBridge().reloadCanvas(...args),
    getConsole: async (...args) => requireBridge().getConsole(...args),
    clearConsole: async (...args) => requireBridge().clearConsole(...args),
    waitConsole: async (...args) => requireBridge().waitConsole(...args),
    getCanvasStatus: async (...args) =>
      requireBridge().getCanvasStatus(...args),
    getNetworkLog: async (...args) => requireBridge().getNetworkLog(...args),
    clearNetworkLog: async (...args) =>
      requireBridge().clearNetworkLog(...args),
    getDomSnapshot: async (...args) => requireBridge().getDomSnapshot(...args),
    runPython: async (...args) => requireBridge().runPython(...args),
    runCmd: async (...args) => requireBridge().runCmd(...args),
    listCmds: async (...args) => requireBridge().listCmds(...args),
    readFileBase64: async (...args) => requireBridge().readFileBase64(...args),
    writeFileBase64: async (...args) =>
      requireBridge().writeFileBase64(...args),
    openFile: async (...args) => requireBridge().openFile(...args),
    openTool: async (...args) => requireBridge().openTool(...args),
    closeTool: async (...args) => requireBridge().closeTool(...args),
    getToolSession: async (...args) => requireBridge().getToolSession(...args),
    openMainCanvas: async (...args) => requireBridge().openMainCanvas(...args),
    closeMainTab: async (...args) => requireBridge().closeMainTab(...args),
    setMainTab: async (...args) => requireBridge().setMainTab(...args),
    listMainTabs: async (...args) => requireBridge().listMainTabs(...args),
    getMainTab: async (...args) => requireBridge().getMainTab(...args),
    openSession: async (...args) => requireBridge().openSession(...args),
    closeSession: async (...args) => requireBridge().closeSession(...args),
    pauseSession: async (...args) => requireBridge().pauseSession(...args),
    resumeSession: async (...args) => requireBridge().resumeSession(...args),
    getSession: async (...args) => requireBridge().getSession(...args),
    listSeats: async (...args) => requireBridge().listSeats(...args),
    joinSeat: async (...args) => requireBridge().joinSeat(...args),
    leaveSeat: async (...args) => requireBridge().leaveSeat(...args),
    spawnParticipant: async (...args) =>
      requireBridge().spawnParticipant(...args),
    hostSessionFetch: async (...args) =>
      requireBridge().hostSessionFetch(...args),
    captureCanvas: async (...args) => requireBridge().captureCanvas(...args),
    listSecretNames: async (...args) =>
      requireBridge().listSecretNames(...args),
    getSecretStoreStatus: async (...args) =>
      requireBridge().getSecretStoreStatus(...args),
    listSecrets: async (...args) => requireBridge().listSecrets(...args),
    search: async (...args) => requireBridge().search(...args),
    checkpoint: async (...args) => requireBridge().checkpoint(...args),
    restore: async (...args) => requireBridge().restore(...args),
    listCheckpoints: async (...args) =>
      requireBridge().listCheckpoints(...args),
    listFleetSummary: async (...args) =>
      requireBridge().listFleetSummary(...args),
    getAgentUi: async (...args) => requireBridge().getAgentUi(...args),
    setAgentUi: async (...args) => requireBridge().setAgentUi(...args),
  };
}

function requireBridge(): HostBridge {
  if (!bridge) {
    throw new HostBridgeError(
      "host_unavailable",
      "Playgrounds host bridge 尚未就緒"
    );
  }
  return bridge;
}

/** Guard: refuse writes when target is the active agent project. */
export function assertNotWritingActiveAgent(
  targetSandboxId: string,
  activeAgentSandboxId: string | null,
  op: string
): void {
  if (activeAgentSandboxId && targetSandboxId === activeAgentSandboxId) {
    throw new HostBridgeError(
      "agent_readonly",
      `不可對總管沙盒執行 ${op}；請先複製沙盒後再改`
    );
  }
}

export function fileContentToUtf8(content: FileContent): string {
  if (typeof content === "string") return content;
  return new TextDecoder().decode(content);
}

export { HOST_API_VERSION, HOST_CAPABILITIES };
export type { HostCapability };
