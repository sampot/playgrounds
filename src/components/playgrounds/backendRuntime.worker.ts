/// <reference lib="webworker" />
/**
 * Backend Runtime Dedicated Worker (DEC-038).
 * functions.js + Controllers + mailbox drain + FS authority off UI main thread.
 */

import { AgentRuntime, createMemoryStorage } from "../../sam-runtime/index.ts";
import { SamInstance } from "../../sam-runtime/instance.ts";
import type { AgentMessage } from "../../sam-runtime/message.ts";
import {
  deserializeRequest,
  serializeResponse,
  serializedResponseTransferables,
} from "./canvasSwProtocol";
import { createEnvVarsNamespace, readDotEnvTextFromFiles } from "./dotenvParse";
import {
  functionsSourceFingerprint,
  invokeFunctionsFetch,
  loadFunctionsModule,
  type LoadedFunctionsModule,
} from "./functionsRuntime";
import { createMockDb } from "./mockDb";
import { createMockKvNamespace, type MockKvNamespace } from "./mockKv";
import { createOpfsRuntimeStorage } from "./opfsRuntimeStorage";
import {
  cloneProject,
  createDir,
  createProject,
  deleteDir,
  deleteFile,
  deleteProject,
  isOpfsSupported,
  listProjectDirs,
  listProjects,
  loadFile,
  loadProjectFiles,
  readMeta,
  renameDir,
  renameFile,
  saveFile,
  syncProjectToolMetaFromHead,
  updateProjectMeta,
  writeAllFiles,
  writeFiles,
} from "./opfsStore";
import { browserSamEsmLoader, fileMapToSamFiles } from "./samBrowserLoader";
import type { FileMap } from "./projectTypes";
import type {
  BackendRuntimeIn,
  BackendRuntimeOut,
} from "./backendRuntimeProtocol";
import {
  createCachedSecretsNamespace,
  createRpcDelegateBinding,
  createRpcDelegateBindingWithGrant,
  createRpcSessionBinding,
  createSplitHostBinding,
} from "./backendRuntimeRpc";
import { createComputeBinding } from "./computeBridge";
import { admitsHostBinding } from "./hostScopeMap";
import type { FsChangedEvent } from "./runtimeLocalHostFs";
import {
  admitsCompute,
  admitsSecretsGet,
  effectiveCapabilities,
} from "./samCapabilities";
import { createScopedHostBinding } from "./scopedHostBinding";
import { grantAllowsBinding } from "./toolGrant";

declare const self: DedicatedWorkerGlobalScope;

const cachedFunctions = new Map<
  string,
  { fingerprint: string; mod: LoadedFunctionsModule }
>();

const controllers = new Map<string, SamInstance>();
const controllerOpts = new Map<
  string,
  {
    withHost: boolean;
    activeAgentSandboxId: string | null;
    injectSession: boolean;
    admittedCapabilities: string[] | null;
  }
>();

/** Unlocked secret plaintext (shell pushes on unlock; cleared on lock／shutdown). */
const secretMaterial = new Map<string, string>();

const pendingRpc = new Map<
  string,
  {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
  }
>();

let rpcSeq = 0;
let agentRuntime: AgentRuntime | null = null;
let drainGate = { canDrain: false, isLeader: false };

/** >0 while shell holds exclusive OPFS (WASI SyncAccessHandle) per sandbox. */
const fsHoldCounts = new Map<string, number>();
const fsHoldWaiters = new Map<string, Array<() => void>>();

function fsHoldCount(sandboxId: string): number {
  return fsHoldCounts.get(sandboxId) ?? 0;
}

function sandboxIdFromFsOp(op: string, args: unknown[]): string | null {
  switch (op) {
    case "listProjects":
    case "isOpfsSupported":
    case "createProject":
      return null;
    default:
      return typeof args[0] === "string" && args[0].trim()
        ? args[0].trim()
        : null;
  }
}

async function waitFsUnlocked(sandboxId: string | null): Promise<void> {
  if (!sandboxId) return;
  while (fsHoldCount(sandboxId) > 0) {
    await new Promise<void>(resolve => {
      let waiters = fsHoldWaiters.get(sandboxId);
      if (!waiters) {
        waiters = [];
        fsHoldWaiters.set(sandboxId, waiters);
      }
      waiters.push(resolve);
    });
  }
}

function wakeFsHoldWaiters(sandboxId: string): void {
  const pending = fsHoldWaiters.get(sandboxId)?.splice(0) ?? [];
  for (const w of pending) w();
}

function wakeAllFsHoldWaiters(): void {
  for (const sandboxId of fsHoldWaiters.keys()) {
    wakeFsHoldWaiters(sandboxId);
  }
}

const FS_OPS: Record<string, (...args: never[]) => Promise<unknown>> = {
  cloneProject,
  createDir,
  createProject,
  deleteDir,
  deleteFile,
  deleteProject,
  listProjectDirs,
  listProjects,
  loadFile,
  loadProjectFiles,
  readMeta,
  renameDir,
  renameFile,
  saveFile,
  syncProjectToolMetaFromHead,
  updateProjectMeta,
  writeAllFiles,
  writeFiles,
  isOpfsSupported: async () => isOpfsSupported(),
};

function post(msg: BackendRuntimeOut, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function notifyFsChanged(ev: FsChangedEvent): void {
  post({
    type: "fsChanged",
    sandboxId: ev.sandboxId,
    op: ev.op,
    path: ev.path,
    content: ev.content,
  });
}

function rpc(
  binding: "HOST" | "DELEGATE" | "SESSION",
  sandboxId: string,
  method: string,
  args: unknown[]
): Promise<unknown> {
  const rpcId = `rpc-${++rpcSeq}`;
  return new Promise((resolve, reject) => {
    pendingRpc.set(rpcId, { resolve, reject });
    post({
      type: "envRpc",
      rpcId,
      binding,
      sandboxId,
      method,
      args,
    });
  });
}

async function ensureAgentRuntime(): Promise<AgentRuntime> {
  if (agentRuntime) return agentRuntime;
  let storage;
  try {
    storage = isOpfsSupported()
      ? await createOpfsRuntimeStorage()
      : createMemoryStorage();
  } catch {
    storage = createMemoryStorage();
  }
  agentRuntime = new AgentRuntime({
    storage,
    autoDrain: true,
    election: {
      canDrain: () => drainGate.canDrain,
      isLeader: () => drainGate.isLeader,
    },
  });
  agentRuntime.setLeader(drainGate.isLeader);
  return agentRuntime;
}

async function getFunctionsModule(
  sandboxId: string,
  files: FileMap
): Promise<LoadedFunctionsModule | null> {
  const fingerprint = functionsSourceFingerprint(files);
  const existing = cachedFunctions.get(sandboxId);
  if (existing && existing.fingerprint === fingerprint) {
    return existing.mod;
  }
  if (existing) {
    await existing.mod.dispose();
    cachedFunctions.delete(sandboxId);
  }
  const mod = await loadFunctionsModule(files);
  if (mod) {
    cachedFunctions.set(sandboxId, { fingerprint, mod });
  }
  return mod;
}

function disposeAllModules(): void {
  for (const entry of cachedFunctions.values()) {
    void entry.mod.dispose();
  }
  cachedFunctions.clear();
}

async function disposeAllControllers(): Promise<void> {
  const runtime = agentRuntime;
  for (const [id, inst] of controllers) {
    try {
      if (runtime) await runtime.detach(id);
      else inst.detachRuntime();
      await inst.stop();
    } catch {
      /* ignore */
    }
  }
  controllers.clear();
  controllerOpts.clear();
}

function clearSecretMaterial(): void {
  secretMaterial.clear();
}

function applySecretMaterial(secrets: Record<string, string>): void {
  secretMaterial.clear();
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof k === "string" && typeof v === "string") {
      secretMaterial.set(k, v);
    }
  }
}

function hostBindingOptions(
  sandboxId: string,
  files: FileMap,
  activeAgentSandboxId: string | null
) {
  const call = (
    binding: "HOST" | "DELEGATE" | "SESSION",
    method: string,
    args: unknown[]
  ) => rpc(binding, sandboxId, method, args);

  return createSplitHostBinding(call, files, {
    sandboxId,
    activeAgentSandboxId,
    persistLocalWrites: true,
    onFsChanged: notifyFsChanged,
    beforeFsAccess: () => waitFsUnlocked(sandboxId),
  });
}

function wrapKvForReadMode(kv: MockKvNamespace): MockKvNamespace {
  return {
    get: (key, type) => kv.get(key, type),
    list: options => kv.list(options),
    put: async () => {
      throw Object.assign(new Error("授權為唯讀，不可寫入 KV"), {
        code: "forbidden",
      });
    },
    delete: async () => {
      throw Object.assign(new Error("授權為唯讀，不可刪除 KV"), {
        code: "forbidden",
      });
    },
  };
}

function buildHostForEnv(
  sandboxId: string,
  files: FileMap,
  activeAgentSandboxId: string | null,
  admitted: readonly string[] | null | undefined,
  forceFullHost: boolean
): Record<string, unknown> | null {
  const isSteward = Boolean(
    activeAgentSandboxId && sandboxId === activeAgentSandboxId
  );
  const effective = effectiveCapabilities({ admitted, isSteward });
  if (!forceFullHost && !isSteward && !admitsHostBinding(effective)) {
    return null;
  }
  const full = hostBindingOptions(sandboxId, files, activeAgentSandboxId);
  if (isSteward || forceFullHost) return full;
  return createScopedHostBinding(full, { effectiveScopes: effective });
}

function buildEnv(
  sandboxId: string,
  msg: Extract<BackendRuntimeIn, { type: "functionsFetch" }>
): Record<string, unknown> {
  const call = (
    binding: "HOST" | "DELEGATE" | "SESSION",
    method: string,
    args: unknown[]
  ) => rpc(binding, sandboxId, method, args);

  const env: Record<string, unknown> = {
    KV: createMockKvNamespace(sandboxId),
    DB: createMockDb(sandboxId),
    vars: createEnvVarsNamespace(msg.dotenvText),
    secrets: Object.freeze({}) as Readonly<Record<string, unknown>>,
  };

  const isSteward = Boolean(
    msg.activeAgentSandboxId && sandboxId === msg.activeAgentSandboxId
  );
  const effective = effectiveCapabilities({
    admitted: msg.admittedCapabilities,
    isSteward,
  });

  if (msg.injectDelegate) {
    const grant = msg.delegateGrant;
    const durable: { DB?: unknown; KV?: unknown } = {};
    if (grant && grantAllowsBinding(grant, "db")) {
      durable.DB = createMockDb(grant.hostSandboxId);
    }
    if (grant && grantAllowsBinding(grant, "kv")) {
      const raw = createMockKvNamespace(grant.hostSandboxId);
      durable.KV = grant.mode === "readwrite" ? raw : wrapKvForReadMode(raw);
    }
    const delegate = grant
      ? createRpcDelegateBindingWithGrant(call, grant, durable)
      : createRpcDelegateBinding(call);
    env.DELEGATE = delegate;
    env.TOOL = delegate;
  } else if (msg.injectHost) {
    const host = buildHostForEnv(
      sandboxId,
      msg.files,
      msg.activeAgentSandboxId,
      msg.admittedCapabilities,
      isSteward
    );
    if (host) env.HOST = host;
  }
  if (msg.injectSession) {
    env.SESSION = createRpcSessionBinding(call);
  }
  if (admitsCompute(effective)) {
    env.COMPUTE = createComputeBinding(sandboxId, effective);
  }
  if (!msg.injectDelegate && admitsSecretsGet(effective)) {
    env.secrets = Object.freeze(
      createCachedSecretsNamespace(() => secretMaterial)
    );
  }
  return env;
}

function buildControllerEnv(
  sandboxId: string,
  files: FileMap,
  withHost: boolean,
  activeAgentSandboxId: string | null,
  injectSession: boolean,
  admittedCapabilities: string[] | null
): Record<string, unknown> {
  const call = (
    binding: "HOST" | "DELEGATE" | "SESSION",
    method: string,
    args: unknown[]
  ) => rpc(binding, sandboxId, method, args);

  const dotenvText = readDotEnvTextFromFiles(files);
  const isSteward = Boolean(
    activeAgentSandboxId && sandboxId === activeAgentSandboxId
  );
  const effective = effectiveCapabilities({
    admitted: admittedCapabilities,
    isSteward,
  });
  const env: Record<string, unknown> = {
    KV: createMockKvNamespace(sandboxId),
    DB: createMockDb(sandboxId),
    vars: createEnvVarsNamespace(dotenvText),
    secrets: Object.freeze({}) as Readonly<Record<string, unknown>>,
  };

  if (withHost || admitsHostBinding(effective)) {
    const host = buildHostForEnv(
      sandboxId,
      files,
      activeAgentSandboxId,
      admittedCapabilities,
      isSteward
    );
    if (host) env.HOST = host;
  }
  if (injectSession) {
    env.SESSION = createRpcSessionBinding(call);
  }
  if (admitsCompute(effective)) {
    env.COMPUTE = createComputeBinding(sandboxId, effective);
  }
  if (admitsSecretsGet(effective)) {
    env.secrets = Object.freeze(
      createCachedSecretsNamespace(() => secretMaterial)
    );
  }
  return env;
}

async function handleFunctionsFetch(
  msg: Extract<BackendRuntimeIn, { type: "functionsFetch" }>
): Promise<void> {
  try {
    const mod = await getFunctionsModule(msg.sandboxId, msg.files);
    if (!mod) {
      post({
        type: "functionsFetchResult",
        requestId: msg.requestId,
        ok: false,
        error: "functions.js unavailable",
      });
      return;
    }
    const request = deserializeRequest(msg.request);
    const env = buildEnv(msg.sandboxId, msg);
    const response = await invokeFunctionsFetch(mod, request, env);
    const serialized = await serializeResponse(response);
    post(
      {
        type: "functionsFetchResult",
        requestId: msg.requestId,
        ok: true,
        response: serialized,
      },
      serializedResponseTransferables(serialized)
    );
  } catch (e) {
    post({
      type: "functionsFetchResult",
      requestId: msg.requestId,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function controllerOk(requestId: string, result?: unknown): void {
  post({ type: "controllerResult", requestId, ok: true, result });
}

function controllerErr(requestId: string, e: unknown): void {
  const err = e as { code?: string; message?: string };
  post({
    type: "controllerResult",
    requestId,
    ok: false,
    error: e instanceof Error ? e.message : String(e),
    code: typeof err?.code === "string" ? err.code : undefined,
  });
}

async function handleControllerAttach(
  msg: Extract<BackendRuntimeIn, { type: "controllerAttach" }>
): Promise<void> {
  try {
    const runtime = await ensureAgentRuntime();
    const existing = controllers.get(msg.sandboxId);
    if (existing) {
      try {
        await runtime.detach(msg.sandboxId);
      } catch {
        /* ignore */
      }
      await existing.stop();
      controllers.delete(msg.sandboxId);
      controllerOpts.delete(msg.sandboxId);
    }
    const samFiles = fileMapToSamFiles(msg.files);
    const activeAgentSandboxId = msg.withHost
      ? msg.activeAgentSandboxId ?? msg.sandboxId
      : msg.activeAgentSandboxId;
    const injectSession = Boolean(msg.injectSession);
    const admittedCapabilities = msg.admittedCapabilities ?? null;
    const opts = {
      withHost: msg.withHost,
      activeAgentSandboxId,
      injectSession,
      admittedCapabilities,
    };
    const inst = new SamInstance({
      id: msg.sandboxId,
      files: samFiles,
      loadEsm: browserSamEsmLoader,
      createEnv: () =>
        buildControllerEnv(
          msg.sandboxId,
          msg.files,
          opts.withHost,
          opts.activeAgentSandboxId,
          opts.injectSession,
          opts.admittedCapabilities
        ),
    });
    await inst.start();
    await runtime.attach(inst);
    controllers.set(msg.sandboxId, inst);
    controllerOpts.set(msg.sandboxId, opts);
    controllerOk(msg.requestId, { meta: inst.getMeta() });
  } catch (e) {
    controllerErr(msg.requestId, e);
  }
}

async function handleControllerDetach(
  msg: Extract<BackendRuntimeIn, { type: "controllerDetach" }>
): Promise<void> {
  try {
    const inst = controllers.get(msg.sandboxId);
    if (inst) {
      if (agentRuntime) {
        try {
          await agentRuntime.detach(msg.sandboxId);
        } catch {
          inst.detachRuntime();
        }
      } else {
        inst.detachRuntime();
      }
      await inst.stop();
      controllers.delete(msg.sandboxId);
      controllerOpts.delete(msg.sandboxId);
    }
    controllerOk(msg.requestId);
  } catch (e) {
    controllerErr(msg.requestId, e);
  }
}

async function handleControllerDispatch(
  msg: Extract<BackendRuntimeIn, { type: "controllerDispatch" }>
): Promise<void> {
  try {
    const inst = controllers.get(msg.sandboxId);
    if (!inst) throw new Error("controller_not_attached");
    await inst.dispatchMessage(msg.message as AgentMessage);
    controllerOk(msg.requestId);
  } catch (e) {
    controllerErr(msg.requestId, e);
  }
}

async function handleControllerCommand(
  msg: Extract<BackendRuntimeIn, { type: "controllerCommand" }>
): Promise<void> {
  try {
    const inst = controllers.get(msg.sandboxId);
    if (!inst) throw new Error("controller_not_attached");
    const result = await inst.command(msg.command);
    controllerOk(msg.requestId, result);
  } catch (e) {
    controllerErr(msg.requestId, e);
  }
}

async function handleControllerPause(
  msg: Extract<BackendRuntimeIn, { type: "controllerPause" }>
): Promise<void> {
  try {
    const inst = controllers.get(msg.sandboxId);
    if (!inst) throw new Error("controller_not_attached");
    await inst.pauseProcess();
    controllerOk(msg.requestId);
  } catch (e) {
    controllerErr(msg.requestId, e);
  }
}

async function handleControllerResume(
  msg: Extract<BackendRuntimeIn, { type: "controllerResume" }>
): Promise<void> {
  try {
    const inst = controllers.get(msg.sandboxId);
    if (!inst) throw new Error("controller_not_attached");
    await inst.resumeProcess();
    controllerOk(msg.requestId);
  } catch (e) {
    controllerErr(msg.requestId, e);
  }
}

async function handleControllerSyncFiles(
  msg: Extract<BackendRuntimeIn, { type: "controllerSyncFiles" }>
): Promise<void> {
  try {
    const prevOpts = controllerOpts.get(msg.sandboxId) ?? {
      withHost: false,
      activeAgentSandboxId: null,
      injectSession: false,
      admittedCapabilities: null,
    };
    const prev = controllers.get(msg.sandboxId);
    if (prev) {
      if (agentRuntime) {
        try {
          await agentRuntime.detach(msg.sandboxId);
        } catch {
          prev.detachRuntime();
        }
      } else {
        prev.detachRuntime();
      }
      await prev.stop();
      controllers.delete(msg.sandboxId);
      controllerOpts.delete(msg.sandboxId);
    }
    await handleControllerAttach({
      type: "controllerAttach",
      requestId: msg.requestId,
      sandboxId: msg.sandboxId,
      files: msg.files,
      withHost: prevOpts.withHost,
      activeAgentSandboxId: prevOpts.activeAgentSandboxId,
      admittedCapabilities: prevOpts.admittedCapabilities,
      injectSession: prevOpts.injectSession,
    });
  } catch (e) {
    controllerErr(msg.requestId, e);
  }
}

async function handleFsOp(
  msg: Extract<BackendRuntimeIn, { type: "fsOp" }>
): Promise<void> {
  try {
    await waitFsUnlocked(sandboxIdFromFsOp(msg.op, msg.args));
    const fn = FS_OPS[msg.op];
    if (!fn) {
      post({
        type: "fsOpResult",
        requestId: msg.requestId,
        ok: false,
        error: `unknown fs op: ${msg.op}`,
      });
      return;
    }
    const result = await (fn as (...a: unknown[]) => Promise<unknown>)(
      ...msg.args
    );
    post({ type: "fsOpResult", requestId: msg.requestId, ok: true, result });
  } catch (e) {
    const err = e as { code?: string };
    post({
      type: "fsOpResult",
      requestId: msg.requestId,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: typeof err?.code === "string" ? err.code : undefined,
    });
  }
}

function resolvePendingRpc(
  rpcId: string,
  ok: boolean,
  result?: unknown,
  error?: { code?: string; message: string }
): void {
  const pending = pendingRpc.get(rpcId);
  if (!pending) return;
  pendingRpc.delete(rpcId);
  if (ok) pending.resolve(result);
  else {
    const err = new Error(error?.message ?? "rpc failed") as Error & {
      code?: string;
    };
    if (error?.code) err.code = error.code;
    pending.reject(err);
  }
}

self.onmessage = (ev: MessageEvent<BackendRuntimeIn>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== "object") return;

  switch (msg.type) {
    case "bootstrap":
      void (async () => {
        await ensureAgentRuntime();
        post({ type: "bootstrapped", leaderEpoch: msg.leaderEpoch });
      })();
      break;
    case "drainGate":
      drainGate = {
        canDrain: msg.canDrain,
        isLeader: msg.isLeader,
      };
      if (agentRuntime) {
        agentRuntime.setLeader(msg.isLeader);
        if (msg.canDrain) void agentRuntime.kickDrain();
      }
      break;
    case "kickDrain":
      void ensureAgentRuntime().then(rt => rt.kickDrain());
      break;
    case "secretsMaterial":
      applySecretMaterial(msg.secrets);
      post({ type: "secretsMaterialAck" });
      break;
    case "shutdown":
      void (async () => {
        await disposeAllControllers();
        disposeAllModules();
        clearSecretMaterial();
        agentRuntime = null;
        drainGate = { canDrain: false, isLeader: false };
        fsHoldCounts.clear();
        fsHoldWaiters.clear();
        wakeAllFsHoldWaiters();
        for (const [, p] of pendingRpc) {
          p.reject(new Error("runtime shutdown"));
        }
        pendingRpc.clear();
        post({ type: "shutdownAck" });
      })();
      break;
    case "functionsFetch":
      void handleFunctionsFetch(msg);
      break;
    case "controllerAttach":
      void handleControllerAttach(msg);
      break;
    case "controllerDetach":
      void handleControllerDetach(msg);
      break;
    case "controllerDispatch":
      void handleControllerDispatch(msg);
      break;
    case "controllerCommand":
      void handleControllerCommand(msg);
      break;
    case "controllerPause":
      void handleControllerPause(msg);
      break;
    case "controllerResume":
      void handleControllerResume(msg);
      break;
    case "controllerSyncFiles":
      void handleControllerSyncFiles(msg);
      break;
    case "fsOp":
      void handleFsOp(msg);
      break;
    case "fsHold": {
      const sandboxId = msg.sandboxId.trim();
      fsHoldCounts.set(sandboxId, fsHoldCount(sandboxId) + 1);
      post({ type: "fsHoldAck", requestId: msg.requestId });
      break;
    }
    case "fsRelease": {
      const sandboxId = msg.sandboxId.trim();
      const next = Math.max(0, fsHoldCount(sandboxId) - 1);
      if (next === 0) {
        fsHoldCounts.delete(sandboxId);
        wakeFsHoldWaiters(sandboxId);
      } else {
        fsHoldCounts.set(sandboxId, next);
      }
      post({ type: "fsReleaseAck", requestId: msg.requestId });
      break;
    }
    case "envRpcResult":
      resolvePendingRpc(msg.rpcId, msg.ok, msg.result, msg.error);
      break;
    case "runtimeRpcResult":
      resolvePendingRpc(msg.rpcId, msg.ok, msg.result, msg.error);
      break;
    default:
      break;
  }
};

post({ type: "ready" });
