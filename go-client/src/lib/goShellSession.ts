/**
 * go-client Host shell-session bridge (GO-INVITE §6.5).
 *
 * The Host SAM (pg-gomoku) inside the go iframe calls the shell session API
 * (`/api/shell/session/open|status|close|host-domain`) exactly as it does in
 * the author field — but in go the "shell" is this bridge, and the Host
 * session authority is go's own functions runtime (`env.KV`, `catalog:<id>`).
 *
 * The goHostRuntime registers itself as the shell-session host; requests from
 * the SAM iframe route here instead of falling through to functions runtime.
 */

import {
  isShellSessionApiPath,
  type ShellSessionHttpStatus,
} from "@pg/shellSessionHttp";
import type { SerializedResponse } from "@pg/canvasSwProtocol";

function jsonResponse(data: unknown, status = 200): SerializedResponse {
  const body = new TextEncoder().encode(JSON.stringify(data));
  return {
    status,
    statusText: "",
    headers: [["Content-Type", "application/json; charset=utf-8"]],
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

function errorResponse(e: unknown): SerializedResponse {
  const message = e instanceof Error ? e.message : String(e);
  const code =
    e && typeof e === "object" && "code" in e
      ? String((e as { code: unknown }).code)
      : "error";
  return jsonResponse({ error: message, code }, 400);
}

export type GoShellSessionHost = {
  open: () => Promise<{
    sessionId: string;
    channelName: string;
    protocol: ShellSessionHttpStatus["protocol"];
  }>;
  close: () => Promise<void>;
  getStatus: () => Promise<ShellSessionHttpStatus>;
  hostDomainFetch: (opts: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }) => Promise<unknown>;
};

let host: GoShellSessionHost | null = null;

/**
 * Registers the go Host session engine for the SAM iframe. Pass null to
 * deregister (page teardown).
 */
export function registerGoShellSessionHost(
  next: GoShellSessionHost | null
): void {
  host = next;
}

export function getGoShellSessionHost(): GoShellSessionHost | null {
  return host;
}

function routePath(request: { url: string }): string {
  let path = "/";
  try {
    path = new URL(request.url, "https://go.local").pathname;
  } catch {
    path = String(request.url || "");
  }
  return path.replace(/\/+$/, "") || "/";
}

/** True when the request targets `/api/shell/session/*`. */
export function isGoShellSessionRequest(request: {
  url: string;
}): boolean {
  return isShellSessionApiPath(routePath(request));
}

async function readJson(request: {
  body: ArrayBuffer | null;
}): Promise<Record<string, unknown>> {
  if (!request.body || !request.body.byteLength) return {};
  try {
    const text = new TextDecoder().decode(request.body);
    return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Handle `/api/shell/session/*` from the Host SAM iframe by delegating to the
 * registered goHostRuntime. Returns null when not a shell-session request.
 */
export async function handleGoShellSessionApi(request: {
  method: string;
  url: string;
  body: ArrayBuffer | null;
  headers?: [string, string][];
}): Promise<SerializedResponse | null> {
  if (!isGoShellSessionRequest(request)) return null;
  if (!host) {
    return jsonResponse(
      { error: "尚未開啟邀請場", code: "session_inactive" },
      409
    );
  }
  const path = routePath(request);
  const method = String(request.method || "GET").toUpperCase();
  const base = "/api/shell/session";
  try {
    if (path === `${base}/open` && method === "POST") {
      return jsonResponse(await host.open());
    }
    if (path === `${base}/close` && method === "POST") {
      await host.close();
      return jsonResponse({ ok: true });
    }
    if (path === `${base}/status` && method === "GET") {
      return jsonResponse(await host.getStatus());
    }
    if (path === `${base}/host-domain` && method === "POST") {
      const body = (await readJson(request)) as {
        path?: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };
      if (!body.path || typeof body.path !== "string") {
        return jsonResponse(
          { error: "缺少 path", code: "act_rejected" },
          400
        );
      }
      return jsonResponse(
        await host.hostDomainFetch({
          path: body.path,
          method: body.method,
          headers: body.headers,
          body: body.body,
        })
      );
    }
    return jsonResponse({ error: "找不到路由", code: "not_found" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}