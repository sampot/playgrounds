/**
 * Ensure the site Service Worker (/sw.js) is active for canvas virtual origin;
 * handle /api/* forwards from the SW into functions.js.
 */

import {
  CANVAS_API_TYPE,
  CANVAS_SCOPE,
  CANVAS_SW_SCRIPT,
  CANVAS_SYNC_ACK_TYPE,
  buildCanvasEntryUrl,
  buildCanvasSyncMessage,
  deserializeRequest,
  functionsNoLeaderBody,
  functionsUnavailableBody,
  projectNotReadyBody,
  serializeResponse,
  serializedResponseTransferables,
  syncFilesTransferables,
  type CanvasApiMessage,
  type CanvasSyncMessage,
  type SerializedRequest,
  type SerializedResponse,
} from "./canvasSwProtocol";
import { backendRuntimeFunctionsFetch } from "./backendHost";
import type { DelegateGrantSnapshot } from "./backendRuntimeProtocol";
import {
  FunctionsApiRelay,
  type FunctionsApiForwardMessage,
} from "./functionsApiRelay";
import { getAgentRuntimeHub } from "./agentRuntimeHub";
import { omitGitFromFileMap } from "./gitPathUtils";
import { readSandboxIdField } from "./sandboxIdCompat";
import { getSessionSeatIdForProject } from "./sessionBridge";
import {
  handleShellSessionHttp,
  isShellSessionApiPath,
  type ShellSessionHttpHandlers,
} from "./shellSessionHttp";
import {
  handleShellPlatformHttp,
  isShellPlatformApiPath,
  type ShellPlatformHttpHandlers,
} from "./shellPlatformHttp";
import type { FileMap } from "./projectTypes";

const SESSION_PROBE_PATH = /\/api\/session\/(?:seat|channel|state)\/?$/i;

/** 200 so DevTools does not log "Failed to load resource" for an expected idle state. */
function jsonOkSerializedResponse(body: string): SerializedResponse {
  const bytes = new TextEncoder().encode(body);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return {
    status: 200,
    statusText: "OK",
    headers: [["content-type", "application/json; charset=utf-8"]],
    body: copy.buffer,
  };
}

function sessionInactiveSerializedResponse(): SerializedResponse {
  return jsonOkSerializedResponse(
    JSON.stringify({
      ready: false,
      code: "session_inactive",
      error: "此沙盒未入座 multi-agent session",
    })
  );
}

function projectNotReadySerializedResponse(): SerializedResponse {
  return jsonOkSerializedResponse(projectNotReadyBody());
}

function isUsableFileMap(files: FileMap | null | undefined): files is FileMap {
  return Boolean(files && Object.keys(files).length > 0);
}

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export type CanvasApiConsoleSink = (line: {
  level: string;
  text: string;
}) => void;

export interface CanvasApiHandlerContext {
  getSandboxId: () => string | null;
  getFiles: () => FileMap;
  /** Active agent project id for env.HOST injection (DEC-017). */
  getActiveAgentSandboxId?: () => string | null;
  /** Mounted tool project id for env.TOOL／DELEGATE injection (DEC-022／037). */
  getActiveToolSandboxId?: () => string | null;
  /**
   * Delegate grant for a sandbox (Tool tab or worker). When present, Backend
   * Runtime injects env.DELEGATE with optional host DB／KV (DEC-037／038).
   */
  getDelegateGrantFor?: (sandboxId: string) => DelegateGrantSnapshot | null;
  /**
   * Resolve files for a canvas project id (work, agent, tool, or session seat).
   * Defaults to getFiles() when omitted (work-only). Presence also authorizes /api/*.
   */
  getFilesForProject?: (sandboxId: string) => FileMap | null;
  /**
   * Async fallback when sync lookup misses (DEC-031 Leader serving follower
   * canvases / fleet Agents whose FileMap is not the open work pane).
   */
  resolveFilesForProject?: (sandboxId: string) => Promise<FileMap | null>;
  /**
   * Multi-agent session channel API for the Host work project only (DEC-023).
   * Domain UX stays in the Host SAM; shell only exposes the channel.
   */
  shellSessionHttp?: ShellSessionHttpHandlers;
  /**
   * Platform invite mint for Host work-canvas SAMs (DEC-047／PG-INVITE-E2E-MVP).
   */
  shellPlatformHttp?: ShellPlatformHttpHandlers;
  /**
   * When Host ≠ work sandbox (coding-orchestration: steward Host), session
   * protocol routes live in that Host's functions.js — do not short-circuit
   * GET /api/session/state as "unseated participant".
   */
  getSessionHostSandboxId?: () => string | null;
  onConsole?: CanvasApiConsoleSink;
}

async function resolveApiFiles(
  ctx: CanvasApiHandlerContext,
  sandboxId: string
): Promise<FileMap | null> {
  const workId = ctx.getSandboxId();
  const sync =
    ctx.getFilesForProject?.(sandboxId) ??
    (sandboxId === workId ? ctx.getFiles() : null);
  if (isUsableFileMap(sync)) return sync;
  if (!ctx.resolveFilesForProject) return null;
  try {
    const loaded = await ctx.resolveFilesForProject(sandboxId);
    return isUsableFileMap(loaded) ? loaded : null;
  } catch {
    return null;
  }
}

let apiHandlerCtx: CanvasApiHandlerContext | null = null;
let apiListenerAttached = false;
let functionsRelay: FunctionsApiRelay | null = null;
let functionsRelayReady: Promise<FunctionsApiRelay | null> | null = null;

async function waitForActiveWorker(
  reg: ServiceWorkerRegistration
): Promise<ServiceWorker> {
  if (reg.active) return reg.active;

  const pending = reg.installing || reg.waiting;
  if (!pending) {
    throw new Error("畫布 Service Worker 無法啟動");
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("畫布 Service Worker 啟動逾時"));
    }, 10000);

    const onState = () => {
      if (pending.state === "activated" && reg.active) {
        window.clearTimeout(timer);
        pending.removeEventListener("statechange", onState);
        resolve(reg.active);
        return;
      }
      if (pending.state === "redundant") {
        window.clearTimeout(timer);
        pending.removeEventListener("statechange", onState);
        reject(new Error("畫布 Service Worker 啟動失敗"));
      }
    };
    pending.addEventListener("statechange", onState);
    onState();
  });
}

export async function ensureCanvasServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error(
      "此瀏覽器不支援 Service Worker（畫布需要 SW 提供虛擬站台）"
    );
  }
  if (!registrationPromise) {
    registrationPromise = (async () => {
      const existing = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        existing.map(reg => {
          const script =
            reg.active?.scriptURL ||
            reg.installing?.scriptURL ||
            reg.waiting?.scriptURL ||
            "";
          // Remove legacy canvas-only SW (scope /playgrounds/).
          return script.includes("sw-canvas.js")
            ? reg.unregister()
            : Promise.resolve(false);
        })
      );

      const reg = await navigator.serviceWorker.register(CANVAS_SW_SCRIPT, {
        scope: CANVAS_SCOPE,
        updateViaCache: "none",
      });
      void reg.update();
      await waitForActiveWorker(reg);
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(
            () =>
              reject(
                new Error(
                  "畫布 Service Worker 已啟動但尚未控制此頁；請硬重新載入"
                )
              ),
            5000
          );
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => {
              window.clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
          reg.active?.postMessage({ type: "playgrounds-canvas-claim" });
          if (navigator.serviceWorker.controller) {
            window.clearTimeout(timer);
            resolve();
          }
        });
      }
      return reg;
    })().catch(err => {
      registrationPromise = null;
      throw err instanceof Error
        ? err
        : new Error(String(err || "canvas SW register failed"));
    });
  }
  return registrationPromise;
}

function replyApi(
  port: MessagePort,
  requestId: string,
  payload: { response?: SerializedResponse; error?: string }
): void {
  const transfer = payload.response
    ? serializedResponseTransferables(payload.response)
    : [];
  port.postMessage(
    { type: "playgrounds-canvas-api-result", requestId, ...payload },
    transfer
  );
  port.close();
}

function noLeaderSerializedResponse(): SerializedResponse {
  return jsonOkSerializedResponse(functionsNoLeaderBody());
}

async function executeFunctionsOnThisTab(
  sandboxId: string,
  files: FileMap,
  request: Request,
  agentId: string | null,
  toolId: string | null,
  delegateGrant: DelegateGrantSnapshot | null
): Promise<SerializedResponse> {
  try {
    const response = await backendRuntimeFunctionsFetch({
      sandboxId,
      files,
      request,
      activeAgentSandboxId: agentId,
      activeToolSandboxId: toolId,
      delegateGrant,
    });
    return serializeResponse(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/unavailable|functions\.js/i.test(message)) {
      const bytes = new TextEncoder().encode(functionsUnavailableBody());
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return {
        status: 503,
        statusText: "Service Unavailable",
        headers: [["content-type", "application/json; charset=utf-8"]],
        body: copy.buffer,
      };
    }
    throw e;
  }
}

async function ensureFunctionsRelay(): Promise<FunctionsApiRelay | null> {
  if (functionsRelay) return functionsRelay;
  if (!functionsRelayReady) {
    functionsRelayReady = (async () => {
      try {
        const hub = await getAgentRuntimeHub();
        const relay = new FunctionsApiRelay({
          peerId: hub.peerId,
          getStatus: () => {
            const s = hub.getStatus();
            return {
              epoch: s.epoch,
              canDrain: s.canDrain,
              isLeader: hub.isLeader(),
            };
          },
          execute: async (fwd: FunctionsApiForwardMessage) => {
            const ctx = apiHandlerCtx;
            if (!ctx) {
              return {
                error: {
                  code: "functions_error" as const,
                  message: "遊樂場尚未就緒",
                },
              };
            }
            const filesRaw = await resolveApiFiles(ctx, fwd.sandboxId);
            if (!isUsableFileMap(filesRaw)) {
              return { response: projectNotReadySerializedResponse() };
            }
            const request = deserializeRequest(fwd.request);
            const serialized = await executeFunctionsOnThisTab(
              fwd.sandboxId,
              filesRaw,
              request,
              ctx.getActiveAgentSandboxId?.() ?? null,
              ctx.getActiveToolSandboxId?.() ?? null,
              ctx.getDelegateGrantFor?.(fwd.sandboxId) ?? null
            );
            return { response: serialized };
          },
        });
        relay.start();
        functionsRelay = relay;
        return relay;
      } catch {
        return null;
      }
    })();
  }
  return functionsRelayReady;
}

function stopFunctionsRelay(): void {
  functionsRelay?.stop();
  functionsRelay = null;
  functionsRelayReady = null;
}

async function handleCanvasApiMessage(
  data: CanvasApiMessage,
  port: MessagePort
): Promise<void> {
  const ctx = apiHandlerCtx;
  if (!ctx) {
    replyApi(port, data.requestId, {
      error: "遊樂場尚未就緒",
    });
    return;
  }

  const workId = ctx.getSandboxId();
  const agentId = ctx.getActiveAgentSandboxId?.() ?? null;
  const toolId = ctx.getActiveToolSandboxId?.() ?? null;
  // Prefer sandboxId; accept deprecated projectId during SW/client skew
  const requestSandboxId = readSandboxIdField(data);
  const delegateGrant = ctx.getDelegateGrantFor?.(requestSandboxId) ?? null;

  try {
    // Authority: shell-exposed file maps (work / agent / tool / session seats),
    // then async OPFS / fleet desired (Leader may not have the open pane).
    // Do not hard-code only work|agent|tool — seated Participant projects (DEC-023)
    // must reach functions.js + env.SESSION.
    const filesRaw = await resolveApiFiles(ctx, requestSandboxId);
    // Empty map = designation without files loaded yet (boot / HMR). A hard 403/503
    // here spams the Agent canvas console on every hostFetch during openingContext.
    if (!isUsableFileMap(filesRaw)) {
      replyApi(port, data.requestId, {
        response: projectNotReadySerializedResponse(),
      });
      return;
    }
    const files = filesRaw;
    const request = deserializeRequest(data.request);
    const reqUrl = new URL(request.url);

    // Host work project → shell session channel API (not functions.js).
    if (
      ctx.shellSessionHttp &&
      workId &&
      requestSandboxId === workId &&
      isShellSessionApiPath(reqUrl.pathname)
    ) {
      const response = await handleShellSessionHttp(
        request,
        ctx.shellSessionHttp
      );
      const serialized = await serializeResponse(response);
      replyApi(port, data.requestId, { response: serialized });
      return;
    }

    // Host work project → Platform invite mint (answer loop via invite shell).
    if (
      ctx.shellPlatformHttp &&
      workId &&
      requestSandboxId === workId &&
      isShellPlatformApiPath(reqUrl.pathname)
    ) {
      const response = await handleShellPlatformHttp(
        request,
        ctx.shellPlatformHttp
      );
      const serialized = await serializeResponse(response);
      replyApi(port, data.requestId, { response: serialized });
      return;
    }

    // Participant canvases may boot before the shell registers env.SESSION
    // (or after leave). Answer probes here so dogfood functions.js never
    // returns a noisy 503 for an expected inactive seat.
    // Skip when this sandbox is the session Host (protocol state in Host
    // functions.js — e.g. steward coding-orchestration.v1).
    const sessionHostId = ctx.getSessionHostSandboxId?.() ?? null;
    if (
      request.method === "GET" &&
      SESSION_PROBE_PATH.test(reqUrl.pathname) &&
      !getSessionSeatIdForProject(requestSandboxId) &&
      !(sessionHostId && requestSandboxId === sessionHostId)
    ) {
      replyApi(port, data.requestId, {
        response: sessionInactiveSerializedResponse(),
      });
      return;
    }

    // DEC-031: UI ← network → functions.js. Leader runs functions; followers
    // forward SerializedRequest over BroadcastChannel (epoch-fenced).
    const hub = await getAgentRuntimeHub();
    if (hub.isLeader()) {
      const serialized = await executeFunctionsOnThisTab(
        requestSandboxId,
        files,
        request,
        agentId,
        toolId,
        delegateGrant
      );
      replyApi(port, data.requestId, { response: serialized });
      return;
    }

    const relay = await ensureFunctionsRelay();
    if (!relay) {
      replyApi(port, data.requestId, {
        response: noLeaderSerializedResponse(),
      });
      return;
    }
    const status = hub.getStatus();
    const result = await relay.forward({
      requestId: data.requestId,
      sandboxId: requestSandboxId,
      request: data.request as SerializedRequest,
      leaderEpoch: status.epoch,
    });
    if (result.response) {
      replyApi(port, data.requestId, { response: result.response });
      return;
    }
    const code = result.error?.code;
    if (
      code === "no_leader" ||
      code === "timeout" ||
      code === "epoch_mismatch" ||
      code === "not_leader"
    ) {
      replyApi(port, data.requestId, {
        response: noLeaderSerializedResponse(),
      });
      return;
    }
    replyApi(port, data.requestId, {
      error: result.error?.message || "functions relay failed",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.onConsole?.({ level: "error", text: `[functions] ${message}` });
    replyApi(port, data.requestId, { error: message });
  }
}

function onServiceWorkerMessage(ev: MessageEvent): void {
  const data = ev.data;
  if (!data || typeof data !== "object") return;
  if (data.type !== CANVAS_API_TYPE) return;
  const port = ev.ports?.[0];
  if (!port) return;
  void handleCanvasApiMessage(data as CanvasApiMessage, port);
}

/**
 * Register the shell as the handler for canvas /api/* SW forwards.
 */
export function registerCanvasApiHandler(
  ctx: CanvasApiHandlerContext
): () => void {
  apiHandlerCtx = ctx;
  if (!apiListenerAttached) {
    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    apiListenerAttached = true;
  }
  void ensureFunctionsRelay();
  return () => {
    if (apiHandlerCtx === ctx) {
      apiHandlerCtx = null;
    }
    stopFunctionsRelay();
  };
}

export function invalidateFunctionsModuleCache(): void {
  // Worker module cache is fingerprint-keyed; callers use this after file edits.
  // Restart is owned by Leader role handlers via stopBackendRuntime／startBackendRuntime.
}

export async function syncCanvasSnapshot(
  sandboxId: string,
  generation: number,
  files: FileMap
): Promise<void> {
  const reg = await ensureCanvasServiceWorker();
  const worker = reg.active;
  if (!worker) {
    throw new Error("畫布 Service Worker 尚未就緒");
  }
  // §8.4: do not serve `.git/**` as canvas static assets.
  const message: CanvasSyncMessage = buildCanvasSyncMessage(
    sandboxId,
    generation,
    omitGitFromFileMap(files)
  );
  const transfer = syncFilesTransferables(message.files);

  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("畫布快照同步逾時"));
    }, 8000);

    channel.port1.onmessage = ev => {
      const data = ev.data;
      window.clearTimeout(timer);
      channel.port1.close();
      if (
        data &&
        data.type === CANVAS_SYNC_ACK_TYPE &&
        data.sandboxId === sandboxId &&
        Number(data.generation) === generation
      ) {
        resolve();
        return;
      }
      reject(new Error("畫布快照同步回應無效"));
    };

    try {
      worker.postMessage(message, [channel.port2, ...transfer]);
    } catch (e) {
      window.clearTimeout(timer);
      channel.port1.close();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export async function assertCanvasEntryServed(
  sandboxId: string,
  generation: number,
  entry = "index.html"
): Promise<void> {
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(
          new Error(
            "畫布 Service Worker 尚未控制此頁；請硬重新載入遊樂場分頁"
          )
        );
      }, 5000);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      if (navigator.serviceWorker.controller) {
        window.clearTimeout(timer);
        resolve();
      }
    });
  }

  const url = buildCanvasEntryUrl(sandboxId, generation, entry);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `畫布入口回應 ${res.status}：Service Worker 可能未攔截請求`
    );
  }
  if (
    text.includes("Playgrounds canvas Service Worker did not intercept") ||
    text.includes("Canvas snapshot not ready") ||
    text.includes("/src/components/") ||
    text.length > 50_000
  ) {
    throw new Error(
      "畫布收到站台頁面而非沙盒檔；請硬重新載入後再試（Service Worker 未生效）"
    );
  }
}

export { buildCanvasEntryUrl };
