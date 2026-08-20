/**
 * go-client canvas glue: SW register, snapshot sync, session API bridge.
 */

import {
  buildCanvasEntryUrl,
  buildCanvasSyncMessage,
  CANVAS_API_RESULT_TYPE,
  CANVAS_API_TYPE,
  CANVAS_SYNC_ACK_TYPE,
  CANVAS_SYNC_TYPE,
  injectCanvasBridge,
  type CanvasApiMessage,
  type SerializedRequest,
  type SerializedResponse,
} from "@pg/canvasSwProtocol";
import type { FileMap } from "@pg/projectTypes";
import { isTextContent } from "@pg/projectTypes";
import {
  getSessionBridge,
  getSessionSeatIdForProject,
} from "@pg/sessionBridge";
import { configurePlaygroundsPaths } from "@pg/playgroundsPaths";
import { isGoCanvasSwUsable } from "./goCanvasSupport";
import {
  handleGoFunctionsApi,
  type GoFunctionsApiContext,
} from "./goFunctionsRuntime";
import { handleGoBuiltInKv } from "./goBuiltInKv";
import { handleGoShellPlatformApi } from "./goShellPlatform";
import { handleGoShellSessionApi } from "./goShellSession";
import { GO_SW_URL } from "./registerGoSw";

configurePlaygroundsPaths({ basePath: "", mode: "standalone" });

/** Sync helper for install listener (avoid circular async import). */
function isGoCanvasSwUsableSync(): boolean {
  return isGoCanvasSwUsable();
}

function withCanvasBridge(files: FileMap, storageScope?: string): FileMap {
  const out: FileMap = { ...files };
  for (const [path, content] of Object.entries(files)) {
    const lower = path.toLowerCase();
    if (!lower.endsWith(".html") && !lower.endsWith(".htm")) continue;
    if (!isTextContent(content)) continue;
    out[path] = injectCanvasBridge(content, storageScope);
  }
  return out;
}

export async function ensureGoCanvasSw(): Promise<ServiceWorkerRegistration> {
  if (!isGoCanvasSwUsable()) {
    const { goCanvasSwUnavailableMessage } = await import("./goCanvasSupport");
    throw new Error(goCanvasSwUnavailableMessage());
  }
  const reg = await navigator.serviceWorker.register(GO_SW_URL, { scope: "/" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(
        () => reject(new Error("Service Worker 尚未控制此頁，請重新載入")),
        8000
      );
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          window.clearTimeout(t);
          resolve();
        },
        { once: true }
      );
      if (navigator.serviceWorker.controller) {
        window.clearTimeout(t);
        resolve();
      }
    });
  }
  return reg;
}

export async function syncGoCanvasSnapshot(
  sandboxId: string,
  generation: number,
  files: FileMap,
  storageScope?: string
): Promise<void> {
  const reg = await ensureGoCanvasSw();
  const worker = reg.active;
  if (!worker) throw new Error("Service Worker 尚未就緒");
  const message = buildCanvasSyncMessage(
    sandboxId,
    generation,
    withCanvasBridge(files, storageScope)
  );
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("畫布快照同步逾時"));
    }, 8000);
    channel.port1.onmessage = ev => {
      window.clearTimeout(timer);
      channel.port1.close();
      const data = ev.data;
      if (
        data?.type === CANVAS_SYNC_ACK_TYPE &&
        data.sandboxId === sandboxId &&
        Number(data.generation) === generation
      ) {
        resolve();
        return;
      }
      reject(new Error("畫布快照同步回應無效"));
    };
    try {
      // Transferables optional — structured clone of ArrayBuffers is fine.
      worker.postMessage(message, [channel.port2]);
    } catch (e) {
      window.clearTimeout(timer);
      channel.port1.close();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function jsonResponse(data: unknown, status = 200): SerializedResponse {
  const body = new TextEncoder().encode(JSON.stringify(data));
  return {
    status,
    statusText: "",
    headers: [["Content-Type", "application/json; charset=utf-8"]],
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

/** Shared by SW canvas API and memory/srcdoc canvas (LINE WebView fallback). */
export async function handleGoSessionApi(
  sandboxId: string,
  request: { method: string; url: string; body: ArrayBuffer | null }
): Promise<SerializedResponse> {
  const seatId = getSessionSeatIdForProject(sandboxId);
  let path = "/";
  try {
    path = new URL(request.url, "https://go.local").pathname.replace(/\/+$/, "") || "/";
  } catch {
    path = String(request.url || "");
  }
  const isProbe =
    request.method === "GET" &&
    (path.endsWith("/api/session/seat") ||
      path.includes("/api/session/seat") ||
      path.endsWith("/api/session/channel") ||
      path.includes("/api/session/channel") ||
      path.endsWith("/api/session/state") ||
      path.includes("/api/session/state"));

  if (!seatId) {
    if (isProbe) {
      return jsonResponse({
        ready: false,
        code: "session_inactive",
        error: "未入座",
      });
    }
    return jsonResponse(
      { error: "未入座", code: "session_inactive" },
      409
    );
  }
  const SESSION = getSessionBridge(seatId);
  if (!SESSION) {
    return jsonResponse(
      { error: "尚未入座或連線已中斷", code: "session_inactive" },
      409
    );
  }
  try {
    if (path.includes("/api/session/seat") && request.method === "GET") {
      return jsonResponse(await SESSION.getSeat());
    }
    if (path.includes("/api/session/channel") && request.method === "GET") {
      return jsonResponse(await SESSION.getEventChannel());
    }
    if (path.includes("/api/session/state") && request.method === "GET") {
      return jsonResponse(await SESSION.getState());
    }
    if (path.includes("/api/session/act") && request.method === "POST") {
      const text = request.body
        ? new TextDecoder().decode(request.body)
        : "{}";
      const payload = JSON.parse(text || "{}");
      return jsonResponse(await SESSION.act(payload));
    }
    if (path.includes("/api/session/leave") && request.method === "POST") {
      return jsonResponse(await SESSION.leave());
    }
    return jsonResponse({ error: "找不到路由", code: "not_found" }, 404);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const status = err.code === "session_inactive" ? 409 : 400;
    return jsonResponse(
      { error: err.message || String(e), code: err.code || "error" },
      status
    );
  }
}

export type GoCanvasApiListenerOptions = GoFunctionsApiContext;

/** Durable goWebKv namespace for a sandbox — mirrors `storageFor` in goFunctionsRuntime. */
export function goKvNamespaceFor(ctx: GoFunctionsApiContext): string {
  const catalogId = ctx.getCatalogId?.()?.trim() || null;
  if (catalogId) return `catalog:${catalogId}`;
  const sandboxId = ctx.getSandboxId()?.trim() || "anonymous";
  return `ephemeral:${sandboxId}`;
}

async function dispatchGoCanvasApi(
  ctx: GoCanvasApiListenerOptions,
  sandboxId: string,
  request: SerializedRequest
): Promise<SerializedResponse> {
  const shellPlatform = await handleGoShellPlatformApi(request);
  if (shellPlatform) return shellPlatform;
  const shellSession = await handleGoShellSessionApi(request);
  if (shellSession) return shellSession;
  let path = "/";
  try {
    path = new URL(request.url, "https://go.local").pathname;
  } catch {
    path = String(request.url || "");
  }
  if (path.includes("/api/session")) {
    return handleGoSessionApi(sandboxId, request);
  }
  // Shell-built-in /api/kv/*: serve from the durable goWebKv namespace
  // before delegating to the SAM's functions.js (games must not re-implement
  // KV plumbing; this also backs the localStorage→KV high-score shim).
  // Let the handler normalize both direct `/api/kv/*` URLs and the
  // `/canvas/<sandboxId>/api/kv/*` URL shape forwarded by the service worker.
  // It returns null for unrelated routes.
  const ns = goKvNamespaceFor(ctx);
  const kv = await handleGoBuiltInKv(ns, request);
  if (kv) return kv;
  return handleGoFunctionsApi(ctx, request);
}

/**
 * Listen for SW canvas API forwards:
 * `/api/session/*` → SessionBridge；其餘 → functions.js＋env.KV／DB.
 */
export function installGoCanvasApiListener(
  getSandboxIdOrOpts: (() => string | null) | GoCanvasApiListenerOptions
): () => void {
  if (!isGoCanvasSwUsableSync()) {
    return () => {};
  }
  const ctx: GoCanvasApiListenerOptions =
    typeof getSandboxIdOrOpts === "function"
      ? {
          getSandboxId: getSandboxIdOrOpts,
          getFiles: () => null,
        }
      : getSandboxIdOrOpts;

  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as CanvasApiMessage | undefined;
    if (!data || data.type !== CANVAS_API_TYPE) return;
    const port = ev.ports?.[0];
    const sandboxId = data.sandboxId;
    const active = ctx.getSandboxId();
    const reply = (payload: {
      type: typeof CANVAS_API_RESULT_TYPE;
      requestId: string;
      response?: SerializedResponse;
      error?: string;
    }) => {
      try {
        port?.postMessage(payload);
      } catch {
        /* port may be absent when SW fans out without MessageChannel */
      }
      try {
        navigator.serviceWorker.controller?.postMessage(payload);
      } catch {
        /* no controller */
      }
    };
    void (async () => {
      try {
        // Fan-out from SW may hit every /s/ tab; only the owner replies.
        if (active && sandboxId !== active) return;
        const response = await dispatchGoCanvasApi(
          ctx,
          sandboxId,
          data.request
        );
        reply({
          type: CANVAS_API_RESULT_TYPE,
          requestId: data.requestId,
          response,
        });
      } catch (e) {
        reply({
          type: CANVAS_API_RESULT_TYPE,
          requestId: data.requestId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}

export function canvasEntryUrl(sandboxId: string, generation: number): string {
  return buildCanvasEntryUrl(sandboxId, generation);
}

// silence unused import lint if bundler tree-shakes
void CANVAS_SYNC_TYPE;
