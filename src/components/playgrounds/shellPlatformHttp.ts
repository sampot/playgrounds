/**
 * Shell-owned Platform invite API for Host work-canvas SAMs (DEC-047).
 * Exposed as `/api/shell/platform/*` (mint goes through registered invite shell).
 */

import { HostBridgeError } from "./hostBridge";
import type { PlatformInviteMintResult } from "./platform/platformInviteShell";

export const SHELL_PLATFORM_API_PREFIX = "/api/shell/platform";

export type ShellPlatformHttpHandlers = {
  createInvite: (opts: {
    kind?: string;
    intent?: unknown;
    ttlMs?: number;
  }) => Promise<PlatformInviteMintResult>;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(e: unknown): Response {
  if (e instanceof HostBridgeError) {
    const status =
      e.code === "not_provisioned"
        ? 401
        : e.code === "forbidden"
          ? 403
          : 400;
    return json({ error: e.message, code: e.code }, status);
  }
  const msg = e instanceof Error ? e.message : String(e);
  const code =
    /not_provisioned|通行證|登入我的遊樂場/i.test(msg)
      ? "not_provisioned"
      : "error";
  return json(
    { error: msg, code },
    code === "not_provisioned" ? 401 : 400
  );
}

export function isShellPlatformApiPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return (
    p === SHELL_PLATFORM_API_PREFIX ||
    p.startsWith(`${SHELL_PLATFORM_API_PREFIX}/`) ||
    /\/api\/shell\/platform(?:\/|$)/.test(p)
  );
}

function routeSuffix(pathname: string): string {
  const marker = "/api/shell/platform";
  const i = pathname.lastIndexOf(marker);
  if (i < 0) return "";
  return pathname.slice(i + marker.length).replace(/\/+$/, "") || "";
}

export async function handleShellPlatformHttp(
  request: Request,
  handlers: ShellPlatformHttpHandlers
): Promise<Response> {
  const url = new URL(request.url);
  const suffix = routeSuffix(url.pathname);
  try {
    if (
      (suffix === "" || suffix === "/invite") &&
      request.method === "POST"
    ) {
      const body = (await request.json().catch(() => ({}))) as {
        kind?: string;
        intent?: unknown;
        ttlMs?: number;
      };
      const created = await handlers.createInvite({
        kind: body.kind,
        intent: body.intent,
        ttlMs: body.ttlMs,
      });
      return json(created);
    }
    return json({ error: "找不到路由", code: "not_found" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}
