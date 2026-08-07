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
  type SerializedResponse,
} from "@pg/canvasSwProtocol";
import type { FileMap } from "@pg/projectTypes";
import { isTextContent } from "@pg/projectTypes";
import {
  getSessionBridge,
  getSessionSeatIdForProject,
} from "@pg/sessionBridge";
import { configurePlaygroundsPaths } from "@pg/playgroundsPaths";

configurePlaygroundsPaths({ basePath: "", mode: "standalone" });

/** Bump with go-client/static/sw.js GO_SW_REV so phones pick up bridge fixes. */
const SW_URL = "/sw.js?v=2";

function withCanvasBridge(files: FileMap): FileMap {
  const out: FileMap = { ...files };
  for (const [path, content] of Object.entries(files)) {
    const lower = path.toLowerCase();
    if (!lower.endsWith(".html") && !lower.endsWith(".htm")) continue;
    if (!isTextContent(content)) continue;
    out[path] = injectCanvasBridge(content);
  }
  return out;
}

export async function ensureGoCanvasSw(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("此瀏覽器不支援 Service Worker（無法載入小品）");
  }
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
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
  files: FileMap
): Promise<void> {
  const reg = await ensureGoCanvasSw();
  const worker = reg.active;
  if (!worker) throw new Error("Service Worker 尚未就緒");
  const message = buildCanvasSyncMessage(
    sandboxId,
    generation,
    withCanvasBridge(files)
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

async function handleSessionApi(
  sandboxId: string,
  request: { method: string; url: string; body: ArrayBuffer | null }
): Promise<SerializedResponse> {
  const seatId = getSessionSeatIdForProject(sandboxId);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const isProbe =
    request.method === "GET" &&
    (path.endsWith("/api/session/seat") ||
      path.endsWith("/api/session/channel") ||
      path.endsWith("/api/session/state"));

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
    return jsonResponse({ error: "座位橋遺失", code: "session_inactive" }, 409);
  }
  try {
    if (path.endsWith("/api/session/seat") && request.method === "GET") {
      return jsonResponse(await SESSION.getSeat());
    }
    if (path.endsWith("/api/session/channel") && request.method === "GET") {
      return jsonResponse(await SESSION.getEventChannel());
    }
    if (path.endsWith("/api/session/state") && request.method === "GET") {
      return jsonResponse(await SESSION.getState());
    }
    if (path.endsWith("/api/session/act") && request.method === "POST") {
      const text = request.body
        ? new TextDecoder().decode(request.body)
        : "{}";
      const payload = JSON.parse(text || "{}");
      return jsonResponse(await SESSION.act(payload));
    }
    if (path.endsWith("/api/session/leave") && request.method === "POST") {
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

/** Listen for SW canvas API forwards; handle /api/session/* via SessionBridge. */
export function installGoCanvasApiListener(getSandboxId: () => string | null): () => void {
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as CanvasApiMessage | undefined;
    if (!data || data.type !== CANVAS_API_TYPE) return;
    const port = ev.ports?.[0];
    if (!port) return;
    const sandboxId = data.sandboxId;
    const active = getSandboxId();
    void (async () => {
      try {
        if (active && sandboxId !== active) {
          port.postMessage({
            type: CANVAS_API_RESULT_TYPE,
            requestId: data.requestId,
            response: jsonResponse({ error: "wrong_sandbox" }, 403),
          });
          return;
        }
        const reqUrl = new URL(data.request.url);
        if (reqUrl.pathname.includes("/api/session")) {
          const response = await handleSessionApi(sandboxId, data.request);
          port.postMessage({
            type: CANVAS_API_RESULT_TYPE,
            requestId: data.requestId,
            response,
          });
          return;
        }
        port.postMessage({
          type: CANVAS_API_RESULT_TYPE,
          requestId: data.requestId,
          response: jsonResponse({ error: "not_found" }, 404),
        });
      } catch (e) {
        port.postMessage({
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
