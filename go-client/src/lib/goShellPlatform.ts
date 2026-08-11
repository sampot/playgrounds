/**
 * go-client Host SAM can ask the shell to mint a Platform invite via
 * `/api/shell/platform/invite` (same wire as the field shell, GO-INVITE).
 * Here the "shell" is go: the Host SAM's iframe fetch is routed through the
 * canvas bridge to us, and we proxy it to Platform using the logged-in
 * player's in-memory field API key (goAuth).
 */

import { isShellPlatformApiPath } from "@pg/shellPlatformHttp";
import type {
  SerializedRequest,
  SerializedResponse,
} from "@pg/canvasSwProtocol";
import { goAuth } from "./goAuth.svelte";

/**
 * Minted-invite event bus (GO-INVITE §6.4): the Host SAM's own「邀請對手」
 * CTA fires `/api/shell/platform/invite` inside the iframe; the go page wants
 * to surface its own share sheet (replacing gomoku's in-app inviteBox). Listen
 * here to learn about every successful mint (and login-needed failures).
 */
export type GoShellPlatformInviteEvent = {
  kind: "invite.compose";
  inviteId: string;
  shortUrl: string;
  deepLink?: string;
  expiresAt?: number;
};
export type GoShellPlatformLoginNeededEvent = {
  kind: "login_needed";
  message: string;
};
export type GoShellPlatformEvent =
  | GoShellPlatformInviteEvent
  | GoShellPlatformLoginNeededEvent;

type PlatformListener = (ev: GoShellPlatformEvent) => void;
const platformListeners = new Set<PlatformListener>();

export function subscribeGoShellPlatformEvents(
  fn: PlatformListener
): () => void {
  platformListeners.add(fn);
  return () => platformListeners.delete(fn);
}

function emitPlatformEvent(ev: GoShellPlatformEvent): void {
  for (const l of platformListeners) l(ev);
}

/**
 * Public helper: emit a Platform invite/compose (or login_needed) event into
 * the go-client Platform event bus. Used by sibling subsystems — currently
 * `goHostBinding.createPlatformInvite` — that need to surface their work to
 * the page-level share-sheet flow without bypassing the listener contract.
 */
export function emitGoShellPlatformEvent(ev: GoShellPlatformEvent): void {
  emitPlatformEvent(ev);
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

function errorResponse(e: unknown): SerializedResponse {
  const code =
    e && typeof e === "object" && "code" in e
      ? String((e as { code?: unknown }).code)
      : /通行證|登入|not_provisioned/i.test(
            e instanceof Error ? e.message : String(e)
          )
        ? "not_provisioned"
        : "error";
  const status = code === "not_provisioned" ? 401 : code === "error" ? 400 : 400;
  return jsonResponse(
    {
      error: e instanceof Error ? e.message : String(e),
      code,
    },
    status
  );
}

/** True when the request URL targets the shell platform proxy path. */
export function isShellPlatformRequest(
  request: SerializedRequest | { method: string; url: string; body: ArrayBuffer | null }
): boolean {
  if (!request || typeof request.url !== "string") return false;
  let path = "/";
  try {
    path = new URL(request.url, "https://go.local").pathname;
  } catch {
    path = String(request.url || "");
  }
  return isShellPlatformApiPath(path);
}

/**
 * Handle `/api/shell/platform/invite` minting for the Host SAM iframe.
 * Returns null when not a shell-platform request (caller falls through).
 */
export async function handleGoShellPlatformApi(
  request: SerializedRequest | { method: string; url: string; body: ArrayBuffer | null }
): Promise<SerializedResponse | null> {
  if (!isShellPlatformRequest(request)) return null;

  let path = "/";
  try {
    path = new URL(request.url, "https://go.local").pathname;
  } catch {
    path = String(request.url || "");
  }
  const suffix = path
    .slice(path.lastIndexOf("/api/shell/platform") + "/api/shell/platform".length)
    .replace(/\/+$/, "") || "";

  if (!(request.method === "POST" && (suffix === "" || suffix === "/invite"))) {
    return jsonResponse({ error: "找不到路由", code: "not_found" }, 404);
  }

  try {
    let body: { kind?: string; intent?: unknown; ttlMs?: number } = {};
    const raw = request.body;
    if (raw && raw.byteLength) {
      const text = new TextDecoder().decode(raw);
      if (text.trim()) body = JSON.parse(text) as typeof body;
    }
    const created = await goAuth.mintPlatformInvite({
      kind: body.kind,
      intent: body.intent,
      ttlMs: body.ttlMs,
    });
    emitPlatformEvent({
      kind: "invite.compose",
      inviteId: created.invite_id,
      shortUrl: created.short_url,
      deepLink: created.deep_link,
      expiresAt: created.expires_at,
    });
    return jsonResponse(created);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      String((e as { code: unknown }).code) === "not_provisioned"
    ) {
      emitPlatformEvent({
        kind: "login_needed",
        message: e instanceof Error ? e.message : "請先登入",
      });
    }
    return errorResponse(e);
  }
}
