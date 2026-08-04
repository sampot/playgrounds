/**
 * Shell-owned multi-agent session channel HTTP API (DEC-023).
 * Exposed to the Host work-project canvas as `/api/shell/session/*`.
 * Domain naming / session product UX stays in the Host SAM (starters).
 */

import { HostBridgeError } from "./hostBridge";

export const SHELL_SESSION_API_PREFIX = "/api/shell/session";

export interface ShellSessionHttpSeat {
  seatId: string;
  role: string;
  kind: string;
  sandboxId: string;
  paused: boolean;
}

export interface ShellSessionHttpStatus {
  active: boolean;
  status?: "open" | "paused" | "closed";
  sessionId?: string;
  channelName?: string;
  protocol?: {
    protocolId: string;
    apiVersion: string;
    roles: string[];
    roleLimits?: Record<string, number>;
    joinPolicy?: string;
  };
  seats: ShellSessionHttpSeat[];
}

export interface ShellSessionHttpProject {
  id: string;
  name: string;
}

export interface ShellSessionHttpHandlers {
  getStatus: () => ShellSessionHttpStatus | Promise<ShellSessionHttpStatus>;
  open: () => Promise<{
    sessionId: string;
    channelName: string;
    protocol: ShellSessionHttpStatus["protocol"];
  }>;
  close: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  listProjects: () =>
    ShellSessionHttpProject[] | Promise<ShellSessionHttpProject[]>;
  join: (opts: {
    sandboxId: string;
    role: string;
    protocolId: string;
    apiVersion: string;
    via?: "invite" | "apply";
  }) => Promise<{ seatId: string; role: string; sandboxId: string }>;
  leave: (seatId: string) => Promise<void>;
  /** Clone or create a participant project, then join. */
  spawnParticipant: (opts: {
    role?: string;
    name?: string;
    sourceSandboxId?: string;
  }) => Promise<{
    sandboxId: string;
    seatId: string;
    role: string;
    name: string;
  }>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(e: unknown): Response {
  if (e instanceof HostBridgeError) {
    const status =
      e.code === "session_inactive"
        ? 409
        : e.code === "join_forbidden" ||
            e.code === "forbidden" ||
            e.code === "role_forbidden"
          ? 403
          : 400;
    return json({ error: e.message, code: e.code }, status);
  }
  const code =
    e && typeof e === "object" && "code" in e
      ? String((e as { code: unknown }).code)
      : "error";
  const message = e instanceof Error ? e.message : String(e);
  return json({ error: message, code }, 400);
}

/**
 * Normalize canvas-rewritten paths.
 * `fetch("/api/…")` becomes `/playgrounds/canvas/<sandboxId>/api/…`.
 */
export function shellSessionApiRoute(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const marker = SHELL_SESSION_API_PREFIX;
  if (path === marker || path.startsWith(`${marker}/`)) return path;
  // Canvas bridge rewrites to `/playgrounds/canvas/<id>/api/shell/session/…`.
  // Marker already starts with `/`, so indexOf lands on a segment boundary.
  const idx = path.indexOf(marker);
  if (idx < 0) return null;
  return path.slice(idx) || marker;
}

/** True when pathname is under `/api/shell/session` (absolute or canvas-scoped). */
export function isShellSessionApiPath(pathname: string): boolean {
  return shellSessionApiRoute(pathname) !== null;
}

/**
 * Route a Host-canvas request to shell session channel handlers.
 * Caller must authorize: only the work (Host) project may invoke this.
 */
export async function handleShellSessionHttp(
  request: Request,
  handlers: ShellSessionHttpHandlers
): Promise<Response> {
  const url = new URL(request.url);
  const path = shellSessionApiRoute(url.pathname);
  if (!path) {
    return json({ error: "找不到路由", code: "not_found" }, 404);
  }
  const method = request.method.toUpperCase();
  const base = SHELL_SESSION_API_PREFIX;

  try {
    if (path === `${base}/status` && method === "GET") {
      return json(await handlers.getStatus());
    }
    if (path === `${base}/projects` && method === "GET") {
      return json({ projects: await handlers.listProjects() });
    }
    if (path === `${base}/open` && method === "POST") {
      return json(await handlers.open());
    }
    if (path === `${base}/close` && method === "POST") {
      await handlers.close();
      return json({ ok: true });
    }
    if (path === `${base}/pause` && method === "POST") {
      await handlers.pause();
      return json({ ok: true, status: "paused" });
    }
    if (path === `${base}/resume` && method === "POST") {
      await handlers.resume();
      return json({ ok: true, status: "open" });
    }
    if (path === `${base}/join` && method === "POST") {
      const body = (await request.json().catch(() => null)) as {
        sandboxId?: string;
        role?: string;
        protocolId?: string;
        apiVersion?: string;
        via?: string;
      } | null;
      if (
        !body?.sandboxId ||
        !body?.role ||
        !body?.protocolId ||
        !body?.apiVersion
      ) {
        return json(
          {
            error: "需要 sandboxId、role、protocolId、apiVersion",
            code: "act_rejected",
          },
          400
        );
      }
      const via = body.via === "invite" ? "invite" : "apply";
      return json(
        await handlers.join({
          sandboxId: body.sandboxId,
          role: body.role,
          protocolId: body.protocolId,
          apiVersion: body.apiVersion,
          via,
        })
      );
    }
    if (path === `${base}/leave` && method === "POST") {
      const body = (await request.json().catch(() => null)) as {
        seatId?: string;
      } | null;
      if (!body?.seatId) {
        return json({ error: "缺少 seatId", code: "act_rejected" }, 400);
      }
      await handlers.leave(body.seatId);
      return json({ ok: true });
    }
    if (path === `${base}/spawn-participant` && method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        role?: string;
        name?: string;
        sourceSandboxId?: string;
      };
      return json(
        await handlers.spawnParticipant({
          role: body.role,
          name: body.name,
          sourceSandboxId: body.sourceSandboxId,
        })
      );
    }
    return json({ error: "找不到路由", code: "not_found" }, 404);
  } catch (e) {
    return errorResponse(e);
  }
}
