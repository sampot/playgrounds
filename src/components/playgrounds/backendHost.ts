/**
 * Shell-side Backend Runtime adapter (DEC-038).
 * Owns the Dedicated Worker lifecycle and env RPC to shell bridges.
 */

import { getAdmittedCapabilities } from "./admittedCapabilities";
import {
  deserializeResponse,
  serializeRequest,
  type SerializedResponse,
} from "./canvasSwProtocol";
import { readDotEnvTextFromFiles } from "./dotenvParse";
import { getHostBridge, HostBridgeError } from "./hostBridge";
import { withHostCaller } from "./hostCallerContext";
import { admitsHostBinding, methodAllowedByScopes } from "./hostScopeMap";
import { RUNTIME_LOCAL_HOST_METHODS } from "./backendRuntimeRpc";
import { effectiveCapabilities } from "./samCapabilities";
import {
  exportUnlockedSecretMaterial,
  isSecretStoreUnlocked,
} from "./secretStore";
import { registerSecretRuntimeBridge } from "./secretStoreRuntimeBridge";
import {
  createSessionBinding,
  getSessionSeatIdForProject,
} from "./sessionBridge";
import { getScopedDelegateHost, getToolBridge } from "./toolBridge";
import { getDelegateGrant } from "./delegateGrantRegistry";
import { cloneFileMapForTransfer, type FileMap } from "./projectTypes";
import type {
  BackendRuntimeIn,
  BackendRuntimeOut,
  DelegateGrantSnapshot,
} from "./backendRuntimeProtocol";
import { isBackendRuntimeOut } from "./backendRuntimeProtocol";
import { getAgentRuntimeHub } from "./agentRuntimeHub";

type FetchResult =
  { ok: true; response: SerializedResponse } | { ok: false; error: string };

type FsOpResult =
  { ok: true; result?: unknown } | { ok: false; error: string; code?: string };

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let leaderEpoch = 0;
let seq = 0;

/** Optional shell hook when Runtime persists a file (editor work buffer sync). */
let fsChangedListener:
  | ((ev: {
      sandboxId: string;
      op: "write" | "mkdir" | "remove";
      path: string;
      content?: string;
    }) => void)
  | null = null;

const pendingFetch = new Map<
  string,
  {
    resolve: (r: FetchResult) => void;
  }
>();

const pendingController = new Map<
  string,
  {
    resolve: (
      r:
        | {
            ok: true;
            result?: unknown;
          }
        | {
            ok: false;
            error: string;
            code?: string;
          }
    ) => void;
  }
>();

const pendingFs = new Map<
  string,
  {
    resolve: (r: FsOpResult) => void;
  }
>();

const pendingFsHold = new Map<
  string,
  {
    resolve: () => void;
    reject: (e: Error) => void;
  }
>();

function nextId(prefix: string): string {
  return `${prefix}-${++seq}-${Date.now()}`;
}

export function setBackendFsChangedListener(
  listener:
    | ((ev: {
        sandboxId: string;
        op: "write" | "mkdir" | "remove";
        path: string;
        content?: string;
      }) => void)
    | null
): void {
  fsChangedListener = listener;
}

async function handleEnvRpc(
  msg: Extract<BackendRuntimeOut, { type: "envRpc" }>
): Promise<void> {
  const reply = (payload: {
    ok: boolean;
    result?: unknown;
    error?: { code?: string; message: string };
  }) => {
    postToWorker({
      type: "envRpcResult",
      rpcId: msg.rpcId,
      ...payload,
    });
  };

  try {
    if (msg.binding === "HOST") {
      if (RUNTIME_LOCAL_HOST_METHODS.has(msg.method)) {
        reply({
          ok: false,
          error: {
            code: "runtime_local_method",
            message: `HOST.${msg.method} must run in Backend Runtime (DEC-038)`,
          },
        });
        return;
      }
      const host = getHostBridge();
      if (!host) {
        reply({
          ok: false,
          error: { code: "host_unavailable", message: "HOST bridge 未註冊" },
        });
        return;
      }
      const agentId =
        typeof (host as { getActiveAgent?: () => Promise<string | null> })
          .getActiveAgent === "function"
          ? await (
              host as { getActiveAgent: () => Promise<string | null> }
            ).getActiveAgent()
          : null;
      const isSteward = Boolean(agentId && msg.sandboxId === agentId);
      const effective = effectiveCapabilities({
        admitted: getAdmittedCapabilities(msg.sandboxId),
        isSteward,
      });
      if (!isSteward && !methodAllowedByScopes(msg.method, effective)) {
        reply({
          ok: false,
          error: {
            code: "capability_not_granted",
            message: `未準入所需 scope，無法呼叫 HOST.${msg.method}`,
          },
        });
        return;
      }
      const fn = (host as unknown as Record<string, unknown>)[msg.method];
      if (typeof fn !== "function") {
        reply({
          ok: false,
          error: { message: `HOST.${msg.method} 不存在` },
        });
        return;
      }
      try {
        const result = await withHostCaller(msg.sandboxId, () =>
          (fn as (...a: unknown[]) => Promise<unknown>).apply(host, msg.args)
        );
        reply({ ok: true, result });
      } catch (e) {
        if (e instanceof HostBridgeError) {
          reply({
            ok: false,
            error: { code: e.code, message: e.message },
          });
          return;
        }
        throw e;
      }
      return;
    }

    if (msg.binding === "DELEGATE") {
      const scoped = getScopedDelegateHost();
      const bridge = scoped
        ? scoped.forSandbox(msg.sandboxId)
        : getToolBridge();
      if (!bridge) {
        reply({
          ok: false,
          error: {
            code: "host_unavailable",
            message: "DELEGATE bridge 未註冊",
          },
        });
        return;
      }
      const fn = (bridge as unknown as Record<string, unknown>)[msg.method];
      if (typeof fn !== "function") {
        reply({
          ok: false,
          error: { message: `DELEGATE.${msg.method} 不存在` },
        });
        return;
      }
      const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(
        bridge,
        msg.args
      );
      reply({ ok: true, result });
      return;
    }

    if (msg.binding === "SESSION") {
      const session = createSessionBinding(msg.sandboxId);
      const fn = (session as unknown as Record<string, unknown>)[msg.method];
      if (typeof fn !== "function") {
        reply({
          ok: false,
          error: { message: `SESSION.${msg.method} 不存在` },
        });
        return;
      }
      const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(
        session,
        msg.args
      );
      reply({ ok: true, result });
      return;
    }

    reply({ ok: false, error: { message: `unknown binding ${msg.binding}` } });
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : undefined;
    reply({
      ok: false,
      error: {
        code,
        message: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

async function handleRuntimeRpc(
  msg: Extract<BackendRuntimeOut, { type: "runtimeRpc" }>
): Promise<void> {
  const reply = (payload: {
    ok: boolean;
    result?: unknown;
    error?: { code?: string; message: string };
  }) => {
    postToWorker({
      type: "runtimeRpcResult",
      rpcId: msg.rpcId,
      ...payload,
    });
  };
  try {
    const hub = await getAgentRuntimeHub();
    if (msg.method === "send") {
      const input = msg.args[0] as {
        to: string;
        type: string;
        payload?: unknown;
        from?: string;
        id?: string;
        replyTo?: string;
      };
      const result = await hub.runtime.send(input);
      reply({ ok: true, result });
      return;
    }
    if (msg.method === "sendSelf") {
      const agentId = String(msg.args[0]);
      const options = msg.args[1] as {
        type: string;
        payload?: unknown;
        id?: string;
        replyTo?: string;
      };
      const result = await hub.runtime.sendSelf(agentId, options);
      reply({ ok: true, result });
      return;
    }
    if (msg.method === "schedule") {
      const agentId = String(msg.args[0]);
      const options = msg.args[1] as {
        delayMs?: number;
        when?: number;
        replace?: boolean;
        at?: number;
        intervalMs?: number;
      };
      const result = hub.runtime.schedule(agentId, options);
      // cancel is not structured-cloneable — return id only.
      reply({ ok: true, result: { id: result.id } });
      return;
    }
    if (msg.method === "scheduleCancel") {
      const alarmId = String(msg.args[0] ?? "");
      try {
        hub.runtime.alarms.cancelById(alarmId);
      } catch {
        /* best-effort */
      }
      reply({ ok: true, result: { ok: true } });
      return;
    }
    reply({
      ok: false,
      error: { message: `unknown runtime method ${msg.method}` },
    });
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : undefined;
    reply({
      ok: false,
      error: {
        code,
        message: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

function onWorkerMessage(ev: MessageEvent<unknown>): void {
  const data = ev.data;
  if (!isBackendRuntimeOut(data)) return;

  switch (data.type) {
    case "ready":
    case "bootstrapped":
    case "shutdownAck":
    case "secretsMaterialAck":
      break;
    case "functionsFetchResult": {
      const pending = pendingFetch.get(data.requestId);
      if (!pending) break;
      pendingFetch.delete(data.requestId);
      if (data.ok) pending.resolve({ ok: true, response: data.response });
      else pending.resolve({ ok: false, error: data.error });
      break;
    }
    case "controllerResult": {
      const pending = pendingController.get(data.requestId);
      if (!pending) break;
      pendingController.delete(data.requestId);
      if (data.ok) pending.resolve({ ok: true, result: data.result });
      else
        pending.resolve({
          ok: false,
          error: data.error,
          code: data.code,
        });
      break;
    }
    case "fsOpResult": {
      const pending = pendingFs.get(data.requestId);
      if (!pending) break;
      pendingFs.delete(data.requestId);
      if (data.ok) pending.resolve({ ok: true, result: data.result });
      else
        pending.resolve({
          ok: false,
          error: data.error,
          code: data.code,
        });
      break;
    }
    case "fsHoldAck":
    case "fsReleaseAck": {
      const pending = pendingFsHold.get(data.requestId);
      if (!pending) break;
      pendingFsHold.delete(data.requestId);
      pending.resolve();
      break;
    }
    case "fsChanged":
      fsChangedListener?.({
        sandboxId: data.sandboxId,
        op: data.op,
        path: data.path,
        content: data.content,
      });
      break;
    case "envRpc":
      void handleEnvRpc(data);
      break;
    case "runtimeRpc":
      void handleRuntimeRpc(data);
      break;
    default:
      break;
  }
}

function postToWorker(
  msg: BackendRuntimeIn,
  transfer: Transferable[] = []
): void {
  if (!worker) throw new Error("Backend Runtime Worker 未啟動");
  worker.postMessage(msg, transfer);
}

/** Push unlocked plaintext into Runtime memory (DEC-038 §6.3-A). */
export async function pushSecretsMaterialToBackendRuntime(
  secrets?: Record<string, string>
): Promise<void> {
  if (!worker) return;
  const material = secrets ?? exportUnlockedSecretMaterial();
  postToWorker({ type: "secretsMaterial", secrets: material });
}

export async function clearSecretsMaterialOnBackendRuntime(): Promise<void> {
  if (!worker) return;
  postToWorker({ type: "secretsMaterial", secrets: {} });
}

function ensureSecretBridgeRegistered(): void {
  registerSecretRuntimeBridge({
    push: async secrets => {
      await pushSecretsMaterialToBackendRuntime(secrets);
    },
    clear: async () => {
      await clearSecretsMaterialOnBackendRuntime();
    },
  });
}

function ensureWorker(): Promise<void> {
  if (ready) return ready;
  ensureSecretBridgeRegistered();
  ready = new Promise<void>((resolve, reject) => {
    try {
      worker = new Worker(
        new URL("./backendRuntime.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch (e) {
      ready = null;
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const onReady = (ev: MessageEvent<unknown>) => {
      if (!isBackendRuntimeOut(ev.data) || ev.data.type !== "ready") return;
      worker?.removeEventListener("message", onReady);
      worker?.addEventListener("message", onWorkerMessage);
      resolve();
    };
    worker.addEventListener("message", onReady);
    worker.addEventListener("error", ev => {
      ready = null;
      reject(ev.error ?? new Error("Backend Runtime Worker error"));
    });
  });
  return ready;
}

/** Ensure the Runtime Worker exists (for Safari OPFS writes without full Leader bootstrap). */
export async function ensureBackendRuntimeWorker(): Promise<void> {
  await ensureWorker();
}

/** Start Runtime for the Leader tab (idempotent). */
export async function startBackendRuntime(epoch: number): Promise<void> {
  leaderEpoch = epoch;
  await ensureWorker();
  postToWorker({ type: "bootstrap", leaderEpoch: epoch });
  pushDrainGateToBackendRuntime({
    canDrain: true,
    isLeader: true,
    epoch,
  });
  if (isSecretStoreUnlocked()) {
    await pushSecretsMaterialToBackendRuntime();
  }
}

/** Push Leader drain gate into Worker AgentRuntime. */
export function pushDrainGateToBackendRuntime(gate: {
  canDrain: boolean;
  isLeader: boolean;
  epoch: number;
}): void {
  if (!worker) return;
  postToWorker({
    type: "drainGate",
    canDrain: gate.canDrain,
    isLeader: gate.isLeader,
    epoch: gate.epoch,
  });
}

/** Ask Worker AgentRuntime to drain mailbox／alarms. */
export function backendKickDrain(): void {
  if (!worker) return;
  try {
    postToWorker({ type: "kickDrain" });
  } catch {
    /* ignore */
  }
}

/** Shell→Runtime FS authority op (DEC-038). */
export async function backendFsOp(
  op: string,
  args: unknown[]
): Promise<unknown> {
  await ensureWorker();
  const requestId = nextId("fs");
  const result = await new Promise<FsOpResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFs.delete(requestId);
      reject(new Error("Backend Runtime fsOp 逾時"));
    }, 120_000);
    pendingFs.set(requestId, {
      resolve: r => {
        clearTimeout(timer);
        resolve(r);
      },
    });
    try {
      postToWorker({ type: "fsOp", requestId, op, args });
    } catch (e) {
      clearTimeout(timer);
      pendingFs.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
  if (!result.ok) {
    const err = new Error(result.error) as Error & { code?: string };
    if (result.code) err.code = result.code;
    throw err;
  }
  return result.result;
}

/**
 * Ask Runtime to pause OPFS fsOp／HOST local writes for one sandbox (DEC-039).
 * No-op when Worker is not live.
 */
export async function acquireBackendFsHold(sandboxId: string): Promise<void> {
  if (!worker) return;
  const id = sandboxId.trim();
  if (!id) throw new Error("acquireBackendFsHold requires sandboxId");
  const requestId = nextId("fshold");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFsHold.delete(requestId);
      reject(new Error("Backend Runtime fsHold 逾時"));
    }, 30_000);
    pendingFsHold.set(requestId, {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: err => {
        clearTimeout(timer);
        reject(err);
      },
    });
    try {
      postToWorker({ type: "fsHold", requestId, sandboxId: id });
    } catch (e) {
      clearTimeout(timer);
      pendingFsHold.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Release a prior `acquireBackendFsHold` for the same sandbox. */
export async function releaseBackendFsHold(sandboxId: string): Promise<void> {
  if (!worker) return;
  const id = sandboxId.trim();
  if (!id) return;
  const requestId = nextId("fsrel");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFsHold.delete(requestId);
      reject(new Error("Backend Runtime fsRelease 逾時"));
    }, 30_000);
    pendingFsHold.set(requestId, {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: err => {
        clearTimeout(timer);
        reject(err);
      },
    });
    try {
      postToWorker({ type: "fsRelease", requestId, sandboxId: id });
    } catch (e) {
      clearTimeout(timer);
      pendingFsHold.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Terminate Runtime (Leader degrade／close). Secret bridge stays (push no-ops). */
export async function stopBackendRuntime(): Promise<void> {
  if (!worker) {
    ready = null;
    return;
  }
  const w = worker;
  worker = null;
  ready = null;
  for (const [, p] of pendingFetch) {
    p.resolve({ ok: false, error: "runtime shutdown" });
  }
  pendingFetch.clear();
  for (const [, p] of pendingController) {
    p.resolve({ ok: false, error: "runtime shutdown" });
  }
  pendingController.clear();
  for (const [, p] of pendingFs) {
    p.resolve({ ok: false, error: "runtime shutdown" });
  }
  pendingFs.clear();
  for (const [, p] of pendingFsHold) {
    p.reject(new Error("runtime shutdown"));
  }
  pendingFsHold.clear();
  try {
    w.postMessage({ type: "shutdown" } satisfies BackendRuntimeIn);
  } catch {
    /* ignore */
  }
  w.terminate();
}

export function isBackendRuntimeLive(): boolean {
  return worker !== null;
}

export function getBackendRuntimeLeaderEpoch(): number {
  return leaderEpoch;
}

function injectFlags(
  sandboxId: string,
  agentId: string | null,
  toolId: string | null,
  hasDelegateGrant: boolean
): {
  injectHost: boolean;
  injectDelegate: boolean;
  injectSession: boolean;
} {
  const registryGrant = getDelegateGrant(sandboxId);
  // Grant in registry／payload is enough — DB／getGrant are Runtime-local (DEC-038).
  // Do not require shell bridgeReady (tool grant used to live only in UI tabs).
  const injectDelegate = Boolean(
    hasDelegateGrant ||
    registryGrant ||
    (toolId &&
      sandboxId === toolId &&
      Boolean(getToolBridge() || getScopedDelegateHost()))
  );
  const isSteward = Boolean(
    agentId && sandboxId === agentId && getHostBridge()
  );
  const effective = effectiveCapabilities({
    admitted: getAdmittedCapabilities(sandboxId),
    isSteward,
  });
  const injectHost = Boolean(
    !injectDelegate &&
      getHostBridge() &&
      (isSteward || admitsHostBinding(effective))
  );
  const injectSession = Boolean(getSessionSeatIdForProject(sandboxId));
  return { injectHost, injectDelegate, injectSession };
}

/**
 * Run functions.js fetch inside the Backend Runtime Worker.
 * Falls back to throwing if Worker cannot start (callers may catch).
 */
export async function backendRuntimeFunctionsFetch(options: {
  sandboxId: string;
  files: FileMap;
  request: Request;
  activeAgentSandboxId?: string | null;
  activeToolSandboxId?: string | null;
  /** Tool／worker grant for this sandbox (DEC-037); enables DELEGATE.DB／KV in Runtime. */
  delegateGrant?: DelegateGrantSnapshot | null;
}): Promise<Response> {
  await ensureWorker();
  if (isSecretStoreUnlocked()) {
    await pushSecretsMaterialToBackendRuntime();
  }
  const agentId = options.activeAgentSandboxId ?? null;
  const toolId = options.activeToolSandboxId ?? null;
  const workerEntry = getDelegateGrant(options.sandboxId);
  const delegateGrant: DelegateGrantSnapshot | null =
    options.delegateGrant ??
    (workerEntry
      ? {
          hostSandboxId: workerEntry.grant.hostSandboxId,
          paths: [...workerEntry.grant.paths],
          mode: workerEntry.grant.mode,
          ...(workerEntry.focusPath
            ? { focusPath: workerEntry.focusPath }
            : {}),
        }
      : null);
  const flags = injectFlags(
    options.sandboxId,
    agentId,
    toolId,
    Boolean(delegateGrant)
  );
  const requestId = nextId("fetch");
  const serialized = await serializeRequest(options.request);
  const dotenvText = readDotEnvTextFromFiles(options.files);
  const admitted = getAdmittedCapabilities(options.sandboxId);

  const result = await new Promise<FetchResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFetch.delete(requestId);
      reject(new Error("Backend Runtime functionsFetch 逾時"));
    }, 120_000);
    pendingFetch.set(requestId, {
      resolve: r => {
        clearTimeout(timer);
        resolve(r);
      },
    });
    try {
      postToWorker({
        type: "functionsFetch",
        requestId,
        sandboxId: options.sandboxId,
        files: cloneFileMapForTransfer(options.files),
        request: serialized,
        activeAgentSandboxId: agentId,
        activeToolSandboxId: toolId,
        dotenvText: dotenvText ?? null,
        admittedCapabilities: admitted ? [...admitted] : null,
        ...(flags.injectDelegate && delegateGrant
          ? { delegateGrant }
          : { delegateGrant: null }),
        ...flags,
      });
    } catch (e) {
      clearTimeout(timer);
      pendingFetch.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });

  if (!result.ok) {
    throw new Error(result.error);
  }
  return deserializeResponse(result.response);
}

async function controllerRequest(
  build: (requestId: string) => BackendRuntimeIn
): Promise<unknown> {
  await ensureWorker();
  const requestId = nextId("ctrl");
  const result = await new Promise<
    | {
        ok: true;
        result?: unknown;
      }
    | {
        ok: false;
        error: string;
        code?: string;
      }
  >((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingController.delete(requestId);
      reject(new Error("Backend Runtime controller 逾時"));
    }, 120_000);
    pendingController.set(requestId, {
      resolve: r => {
        clearTimeout(timer);
        resolve(r);
      },
    });
    try {
      postToWorker(build(requestId));
    } catch (e) {
      clearTimeout(timer);
      pendingController.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
  if (!result.ok) {
    const err = new Error(result.error) as Error & { code?: string };
    if (result.code) err.code = result.code;
    throw err;
  }
  return result.result;
}

export async function backendControllerAttach(opts: {
  sandboxId: string;
  files: FileMap;
  withHost: boolean;
  activeAgentSandboxId: string | null;
  admittedCapabilities?: readonly string[] | null;
}): Promise<{ meta?: Record<string, unknown> }> {
  const injectSession = Boolean(getSessionSeatIdForProject(opts.sandboxId));
  const files = cloneFileMapForTransfer(opts.files);
  const admitted =
    opts.admittedCapabilities !== undefined
      ? opts.admittedCapabilities
      : getAdmittedCapabilities(opts.sandboxId);
  const isSteward = Boolean(
    opts.activeAgentSandboxId &&
      opts.sandboxId === opts.activeAgentSandboxId
  );
  const effective = effectiveCapabilities({
    admitted,
    isSteward,
  });
  // withHost true = steward full HOST; also attach subset when scopes admit HOST.
  const withHost = Boolean(
    opts.withHost || admitsHostBinding(effective)
  );
  const result = await controllerRequest(requestId => ({
    type: "controllerAttach",
    requestId,
    sandboxId: opts.sandboxId,
    files,
    withHost,
    activeAgentSandboxId: opts.activeAgentSandboxId,
    admittedCapabilities: admitted ? [...admitted] : null,
    injectSession,
  }));
  return (result as { meta?: Record<string, unknown> }) ?? {};
}

export async function backendControllerDetach(
  sandboxId: string
): Promise<void> {
  await controllerRequest(requestId => ({
    type: "controllerDetach",
    requestId,
    sandboxId,
  }));
}

export async function backendControllerDispatch(
  sandboxId: string,
  message: unknown
): Promise<void> {
  await controllerRequest(requestId => ({
    type: "controllerDispatch",
    requestId,
    sandboxId,
    message,
  }));
}

export async function backendControllerCommand(
  sandboxId: string,
  command: unknown
): Promise<unknown> {
  return controllerRequest(requestId => ({
    type: "controllerCommand",
    requestId,
    sandboxId,
    command,
  }));
}

export async function backendControllerPause(sandboxId: string): Promise<void> {
  await controllerRequest(requestId => ({
    type: "controllerPause",
    requestId,
    sandboxId,
  }));
}

export async function backendControllerResume(
  sandboxId: string
): Promise<void> {
  await controllerRequest(requestId => ({
    type: "controllerResume",
    requestId,
    sandboxId,
  }));
}

export async function backendControllerSyncFiles(
  sandboxId: string,
  files: FileMap
): Promise<void> {
  const plain = cloneFileMapForTransfer(files);
  await controllerRequest(requestId => ({
    type: "controllerSyncFiles",
    requestId,
    sandboxId,
    files: plain,
  }));
}

/** Test helper: reset module state. */
export async function resetBackendRuntimeForTests(): Promise<void> {
  await stopBackendRuntime();
  seq = 0;
  leaderEpoch = 0;
}

// Keep bridge registered so unlock／lock can push when Worker is live.
ensureSecretBridgeRegistered();
