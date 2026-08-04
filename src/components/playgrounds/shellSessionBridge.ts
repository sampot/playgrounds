/**
 * Per-seat env.SESSION implementation: forward act/state to Host functions.js,
 * publish events on BroadcastChannel (DEC-023).
 */

import { backendRuntimeFunctionsFetch } from "./backendHost";
import {
  SESSION_API_VERSION,
  SESSION_CAPABILITIES,
  SessionBridgeError,
  type SessionBridge,
  type SessionSeatInfo,
} from "./sessionBridge";
import type { SessionRuntime } from "./sessionRuntime";
import type { FileMap } from "./projectTypes";
import type { SessionJoinPolicy, SessionProtocolMeta } from "./sessionTypes";
import { DEFAULT_SESSION_JOIN_POLICY } from "./sessionTypes";

const JOIN_POLICIES = new Set<string>([
  "invite_only",
  "apply",
  "apply_with_approval",
  "invite_or_apply",
]);

function parseJoinPolicy(value: unknown): SessionJoinPolicy | undefined {
  if (typeof value === "string" && JOIN_POLICIES.has(value)) {
    return value as SessionJoinPolicy;
  }
  return undefined;
}

export interface ShellSessionBridgeContext {
  runtime: SessionRuntime;
  seatId: string;
  sandboxId: string;
  getHostFiles: () => FileMap | Promise<FileMap>;
  /** Called when participant leaves via SESSION.leave(). */
  onLeaveSeat: (seatId: string) => void | Promise<void>;
  /**
   * Persist Host-validated file writes from act responses (e.g. coding
   * orchestration host_apply). Optional — Hosts that only use KV omit this.
   * targetSandboxId: DEC-033 apply target (may ≠ Host).
   */
  onHostFileWrites?: (
    writes: { path: string; content: string }[],
    targetSandboxId?: string | null
  ) => void | Promise<void>;
}

export function invalidateHostSessionModuleCache(
  _hostSandboxId?: string
): void {
  // Backend Runtime Worker caches by fingerprint; no shell-side module cache.
}

/**
 * Invoke Host work-sandbox `functions.js` session domain API
 * (`/api/session/*`). Used by env.SESSION and HOST.hostSessionFetch.
 */
export async function fetchHostSessionDomain(
  hostSandboxId: string,
  getHostFiles: () => FileMap | Promise<FileMap>,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const files = await getHostFiles();
  const url = new URL(path, "https://playgrounds.session.local");
  const request = new Request(url.toString(), init);
  let response: Response;
  try {
    response = await backendRuntimeFunctionsFetch({
      sandboxId: hostSandboxId,
      files,
      request,
      // Host authority call: no SESSION/HOST injection on purpose (worker flags).
      activeAgentSandboxId: null,
      activeToolSandboxId: null,
    });
  } catch (e) {
    throw new SessionBridgeError(
      "host_unavailable",
      e instanceof Error ? e.message : "Host 沙盒沒有可用的 functions.js"
    );
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { error: text };
    }
  }
  if (!response.ok) {
    const code =
      body &&
      typeof body === "object" &&
      "code" in body &&
      typeof (body as { code: unknown }).code === "string"
        ? (body as { code: string }).code
        : "act_rejected";
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Host session API ${response.status}`;
    throw new SessionBridgeError(code, message);
  }
  return body;
}

async function hostFetchJson(
  ctx: ShellSessionBridgeContext,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const session = ctx.runtime.getSession();
  if (!session) {
    throw new SessionBridgeError("session_inactive", "目前沒有 session");
  }
  return fetchHostSessionDomain(
    session.hostSandboxId,
    ctx.getHostFiles,
    path,
    init
  );
}

export function createShellSessionBridge(
  ctx: ShellSessionBridgeContext
): SessionBridge {
  return {
    async apiVersion() {
      return SESSION_API_VERSION;
    },

    async capabilities() {
      return [...SESSION_CAPABILITIES];
    },

    async getSeat(): Promise<SessionSeatInfo> {
      const session = ctx.runtime.getSession();
      if (!session) {
        throw new SessionBridgeError("session_inactive", "目前沒有 session");
      }
      const seat = ctx.runtime.getSeat(ctx.seatId);
      if (!seat) {
        throw new SessionBridgeError("session_inactive", "座位已失效");
      }
      return {
        sessionId: session.sessionId,
        seatId: seat.seatId,
        role: seat.role,
        participantId: seat.sandboxId ?? seat.seatId,
        hostSandboxId: session.hostSandboxId,
        status: session.status,
      };
    },

    async getState() {
      const seat = ctx.runtime.getSeat(ctx.seatId);
      if (!seat) {
        throw new SessionBridgeError("session_inactive", "座位已失效");
      }
      const q = new URLSearchParams({
        role: seat.role,
        seatId: seat.seatId,
      });
      return hostFetchJson(ctx, `/api/session/state?${q}`);
    },

    async getEventChannel() {
      const name = ctx.runtime.getChannelName();
      if (!name) {
        throw new SessionBridgeError("session_inactive", "目前沒有 session");
      }
      return { name };
    },

    async act(payload: unknown) {
      const seat = ctx.runtime.assertCanAct(ctx.seatId);
      const session = ctx.runtime.getSession()!;
      const body = {
        seatId: seat.seatId,
        role: seat.role,
        payload,
      };
      const result = (await hostFetchJson(ctx, "/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })) as {
        ok?: boolean;
        events?: unknown[];
        state?: unknown;
        seq?: number;
        fileWrites?: { path?: string; content?: string }[];
        targetSandboxId?: string | null;
      };
      const events = Array.isArray(result?.events) ? result.events : [];
      if (events.length > 0) {
        ctx.runtime.publishEvents(events);
      } else if (result?.ok !== false) {
        // Ensure listeners refresh even if Host omitted events
        ctx.runtime.publishEvents([
          { type: "act", seatId: seat.seatId, role: seat.role, payload },
        ]);
      }
      const writes = Array.isArray(result?.fileWrites)
        ? result.fileWrites
            .filter(
              w =>
                typeof w?.path === "string" &&
                w.path.trim() &&
                typeof w?.content === "string"
            )
            .map(w => ({ path: w.path!.trim(), content: w.content! }))
        : [];
      if (writes.length > 0 && ctx.onHostFileWrites) {
        const target =
          (typeof result?.targetSandboxId === "string" &&
            result.targetSandboxId.trim()) ||
          session.targetSandboxId ||
          null;
        await ctx.onHostFileWrites(writes, target);
      }
      return result;
    },

    async leave() {
      await ctx.onLeaveSeat(ctx.seatId);
      return { ok: true as const };
    },
  };
}

/** Fetch Host session meta (used by shell openSession). */
export async function fetchHostSessionMeta(
  hostSandboxId: string,
  getHostFiles: () => FileMap | Promise<FileMap>
): Promise<SessionProtocolMeta> {
  const files = await getHostFiles();
  const request = new Request(
    "https://playgrounds.session.local/api/session/meta"
  );
  let response: Response;
  try {
    response = await backendRuntimeFunctionsFetch({
      sandboxId: hostSandboxId,
      files,
      request,
      activeAgentSandboxId: null,
      activeToolSandboxId: null,
    });
  } catch (e) {
    throw new SessionBridgeError(
      "host_unavailable",
      e instanceof Error ? e.message : "無法讀取 Host session meta"
    );
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new SessionBridgeError(
      "protocol_mismatch",
      "Host /api/session/meta 不是 JSON"
    );
  }
  if (!response.ok) {
    throw new SessionBridgeError(
      "host_unavailable",
      typeof body === "object" &&
        body &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : "無法讀取 Host session meta"
    );
  }
  const o = body as Record<string, unknown>;
  if (
    typeof o.protocolId !== "string" ||
    typeof o.apiVersion !== "string" ||
    !Array.isArray(o.roles)
  ) {
    throw new SessionBridgeError(
      "protocol_mismatch",
      "Host session meta 缺少 protocolId／apiVersion／roles"
    );
  }
  const joinPolicy = parseJoinPolicy(o.joinPolicy);
  return {
    protocolId: o.protocolId,
    apiVersion: o.apiVersion,
    roles: o.roles.map(String),
    roleLimits:
      o.roleLimits && typeof o.roleLimits === "object"
        ? (o.roleLimits as Record<string, number>)
        : undefined,
    capabilities: Array.isArray(o.capabilities)
      ? o.capabilities.map(String)
      : undefined,
    joinPolicy: joinPolicy ?? DEFAULT_SESSION_JOIN_POLICY,
  };
}

/** Notify Host that a shell session opened (optional). */
export async function notifyHostSessionOpen(
  hostSandboxId: string,
  getHostFiles: () => FileMap | Promise<FileMap>,
  sessionId: string,
  channelName: string,
  options?: { chatSessionId?: string; targetSandboxId?: string | null }
): Promise<void> {
  const files = await getHostFiles();
  const chatSessionId = options?.chatSessionId?.trim();
  const targetSandboxId = options?.targetSandboxId?.trim();
  const request = new Request(
    "https://playgrounds.session.local/api/session/open",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        channelName,
        ...(chatSessionId ? { chatSessionId } : {}),
        ...(targetSandboxId ? { targetSandboxId } : {}),
      }),
    }
  );
  await backendRuntimeFunctionsFetch({
    sandboxId: hostSandboxId,
    files,
    request,
    activeAgentSandboxId: null,
    activeToolSandboxId: null,
  });
}
