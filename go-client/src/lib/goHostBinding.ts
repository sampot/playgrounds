/**
 * go-client `env.HOST` factory (DEC-053 / GO-INVITE).
 *
 * In the author field `play.samkuo.me`, the steward (or any Host SAM with
 * steward-equivalent access) gets `env.HOST` as the full HostBridge surface
 * ([`@pg/hostBridge`](../../../src/components/playgrounds/hostBridge.ts)).
 * pg-gomoku's `functions.js` is written against that surface:
 * `env.HOST.openSession()`、`env.HOST.hostSessionFetch()`、
 * `env.HOST.createPlatformInvite()` ...
 *
 * In the go player host the same SAM must run with the SAME binding shape, but
 * the underlying capability is provided by go-local pieces:
 * - session open/close/listSeats/pause/resume + host-side act
 *   → `hostRuntime`（the GO-INVITE 框架）；authority state lives in `env.KV`
 *     via `goWebKv catalog:<id>`.
 * - Platform invite mint/revoke + self-profile
 *   → `goAuth`（memory field API key 經 Platform `/v1/invites`）。
 *
 * This module wraps those into a single `env.HOST`-shaped object so pg-gomoku's
 * `functions.js` is identical between `play` and `go` — only the runtime that
 * injects `env.HOST` differs.
 *
 * DEC-053 alignment: `env.HOST` is the canonical name for the host-side
 * capability in BOTH shells; we do NOT introduce `env.SHELL` on the go side.
 * The legacy `/api/shell/session/*` + `/api/shell/platform/*` SW dispatch in
 * `goCanvas.ts` is kept only as a transition layer (DEC-053 §6.7).
 *
 * Scope of THIS factory (pg-gomoku subset only):
 * - Session host: openSession / closeSession / pauseSession / resumeSession /
 *   getSession / listSeats / hostSessionFetch.
 * - Platform invite: createPlatformInvite / revokePlatformInvite.
 * - Everything else in the canonical HostBridge surface
 *   （listProjects / writeFile / runCmd / ...）throws `not_implemented`.
 *   pg-gomoku does not call those; expanding to a full surface is a separate
 *   PR so we don't smuggle scope in.
 */
import { HostBridgeError } from "@pg/hostBridge";
import type { HostRuntime } from "./hostRuntime";
import { goAuth } from "./goAuth.svelte";
import { emitGoShellPlatformEvent } from "./goShellPlatform";

export interface GoHostBindingDeps {
  /**
   * Resolve the running `HostRuntime` for this sandbox. The factory is invoked
   * lazily on each method call so that the same singleton is reused across
   * `env.HOST` and the go page's own `hostInviteBind` controller — keeping
   * `getStatus()` consistent in both directions.
   *
   * Returns null until the page has actually bound a runtime (hostable SAM
   * + bind lifecycle); methods that require a runtime will throw a stable
   * error code.
   */
  getHostRuntime: () => HostRuntime | null;
}

/**
 * Canonical `env.HOST` shape that pg-gomoku's `functions.js` consumes.
 * Mirrors the field `HostBridge` (DEC-017 / DEC-023). We declare only the
 * subset pg-gomoku actually calls so that drift between shells surfaces as a
 * compile / TS error here rather than as a runtime `not_implemented` later.
 */
export interface GoHostBinding {
  apiVersion(): Promise<string>;
  capabilities(): Promise<string[]>;
  // Session host (DEC-023).
  openSession(options?: {
    chatSessionId?: string;
    targetSandboxId?: string | null;
  }): Promise<{
    sessionId: string;
    channelName: string;
    protocolId: string;
    apiVersion: string;
    roles: string[];
  }>;
  closeSession(): Promise<{ ok: true }>;
  pauseSession(): Promise<{ ok: true; status: "closed" }>;
  resumeSession(): Promise<{ ok: true; status: "open" }>;
  getSession(): Promise<{
    sessionId: string;
    channelName: string;
    protocolId: string;
    apiVersion: string;
    status: "open";
    roles: string[];
  } | null>;
  listSeats(): Promise<
    Array<{
      seatId: string;
      role: string;
      kind: "human" | "agent";
      sandboxId: string | null;
      paused: boolean;
    }>
  >;
  /** Forward to Host SAM `/api/session/*` (act / state / presence / ...). */
  hostSessionFetch(
    path: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<unknown>;
  // Platform invite (DEC-047) — `env.PLATFORM.mintInvite` 對等物。
  createPlatformInvite(options?: {
    kind?: string;
    intent?: unknown;
    /** Default: `location.origin`（場殼由 shell bridge 提供；go 用 goOrigin()）。 */
    targetField?: string;
    ttlMs?: number;
  }): Promise<{
    invite_id: string;
    short_url: string;
    deep_link: string;
    secret: string;
    expires_at: number;
    kind: string;
  }>;
  revokePlatformInvite(options: {
    inviteId: string;
  }): Promise<{ ok: true }>;
}

export const GO_HOST_API_VERSION = "1" as const;
export const GO_HOST_CAPABILITIES = [
  "hostSessionOpen",
  "hostSessionClose",
  "hostSessionPause",
  "hostSessionResume",
  "hostSessionFetch",
  "listSeats",
  "platformInviteMint",
  "platformInviteRevoke",
] as const;

function notImplemented(method: string): never {
  throw new HostBridgeError(
    "not_implemented",
    `go env.HOST.${method} 尚未實作；pg-gomoku 目前不需要此能力`
  );
}

function requireRuntime(rt: HostRuntime | null): HostRuntime {
  if (!rt) {
    throw new HostBridgeError(
      "session_inactive",
      "Host 尚未就緒（請先 bind HostRuntime）"
    );
  }
  return rt;
}

function buildProtocolMeta(rt: HostRuntime): {
  protocolId: string;
  apiVersion: string;
  roles: string[];
} {
  const status = rt.getStatus();
  return {
    protocolId: status.protocolId,
    apiVersion: status.apiVersion,
    roles: [status.hostRole, ...status.guestRoles],
  };
}

export function createGoHostBinding(deps: GoHostBindingDeps): GoHostBinding {
  return {
    async apiVersion() {
      return GO_HOST_API_VERSION;
    },
    async capabilities() {
      return [...GO_HOST_CAPABILITIES];
    },
    async openSession(_options) {
      const rt = requireRuntime(deps.getHostRuntime());
      await rt.open();
      const status = rt.getStatus();
      if (!status.sessionId || !status.channelName) {
        throw new HostBridgeError(
          "session_inactive",
          "Host 開場未取得 sessionId／channelName"
        );
      }
      const meta = buildProtocolMeta(rt);
      return {
        sessionId: status.sessionId,
        channelName: status.channelName,
        protocolId: meta.protocolId,
        apiVersion: meta.apiVersion,
        roles: meta.roles,
      };
    },
    async closeSession() {
      const rt = requireRuntime(deps.getHostRuntime());
      await rt.close();
      return { ok: true };
    },
    async pauseSession() {
      // pg-gomoku does not split pause/resume at the framework level; treat
      // pause as a close-and-stop of the answer loop. Returning the canonical
      // shape lets pg-gomoku's functions.js keep its UI happy while we
      // surface the limitation honestly. Add a true paused phase when the
      // hostRuntime grows one.
      const rt = requireRuntime(deps.getHostRuntime());
      await rt.close();
      return { ok: true, status: "closed" };
    },
    async resumeSession() {
      // Mirror of pauseSession: re-open with a fresh session id.
      const rt = requireRuntime(deps.getHostRuntime());
      await rt.open();
      return { ok: true, status: "open" };
    },
    async getSession() {
      const rt = deps.getHostRuntime();
      if (!rt) return null;
      const status = rt.getStatus();
      if (status.phase === "idle" || status.phase === "error" || !status.sessionId) {
        return null;
      }
      const meta = buildProtocolMeta(rt);
      return {
        sessionId: status.sessionId,
        channelName: status.channelName ?? "",
        protocolId: meta.protocolId,
        apiVersion: meta.apiVersion,
        roles: meta.roles,
        status: "open",
      };
    },
    async listSeats() {
      const rt = deps.getHostRuntime();
      if (!rt) return [];
      const status = rt.getStatus();
      // Host seat (self) — match the field shell `listSeats` contract:
      // `kind: "human"`, `sandboxId: null` for the local Host.
      const hostSeat = {
        seatId: "host",
        role: status.hostRole,
        kind: "human" as const,
        sandboxId: null,
        paused: false,
      };
      const guestSeats = status.seats.map(s => ({
        seatId: s.seatId,
        role: s.role,
        kind: "human" as const,
        sandboxId: s.peerId,
        paused: false,
      }));
      return [hostSeat, ...guestSeats];
    },
    async hostSessionFetch(path, init) {
      const rt = requireRuntime(deps.getHostRuntime());
      const normalized = path.startsWith("/") ? path : `/${path}`;
      if (!normalized.startsWith("/api/session/")) {
        throw new HostBridgeError(
          "forbidden",
          "host fetch 僅允許 /api/session/*"
        );
      }
      return rt.hostSessionFetch(normalized, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body,
      });
    },
    async createPlatformInvite(options) {
      try {
        const created = await goAuth.mintPlatformInvite({
          kind: options?.kind,
          intent: options?.intent,
          ttlMs: options?.ttlMs,
        });
        // Mirror the field bridge's behaviour: surface the minted invite to the
        // existing `subscribeGoShellPlatformEvents` listeners so the go page's
        // share sheet flow keeps working alongside the new env.HOST call.
        emitGoShellPlatformEvent({
          kind: "invite.compose",
          inviteId: created.invite_id,
          shortUrl: created.short_url,
          deepLink: created.deep_link,
          expiresAt: created.expires_at,
        });
        return {
          invite_id: created.invite_id,
          short_url: created.short_url,
          deep_link: created.deep_link,
          secret: created.secret,
          expires_at: created.expires_at,
          kind: created.kind,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const code =
          e && typeof e === "object" && "code" in e
            ? String((e as { code: unknown }).code)
            : /通行證|登入|not_provisioned/i.test(message)
              ? "not_provisioned"
              : "error";
        if (code === "not_provisioned") {
          emitGoShellPlatformEvent({
            kind: "login_needed",
            message,
          });
        }
        throw new HostBridgeError(code, message);
      }
    },
    async revokePlatformInvite(options) {
      await goAuth.revokePlatformInvite(options.inviteId);
      return { ok: true };
    },
  };
}

/**
 * Helper exported for tests / future expansion: surfaces a stable
 * `not_implemented` proxy for every canonical HostBridge method that this
 * factory does not implement. Functions.js (or tests) can probe
 * `env.HOST.runCmd is undefined` semantics without us having to enumerate
 * every method on the binding object literal above.
 */
export function createGoHostNotImplementedProxy(method: string): GoHostBinding {
  const handler: ProxyHandler<GoHostBinding> = {
    get(_target, prop) {
      if (prop === "apiVersion") return async () => GO_HOST_API_VERSION;
      if (prop === "capabilities") return async () => [...GO_HOST_CAPABILITIES];
      return () => notImplemented(method || String(prop));
    },
  };
  // Not used in production paths; kept as a placeholder so future "implement
  // the rest" PRs have an obvious skeleton. Strip when the surface grows.
  void handler;
  return new Proxy({} as GoHostBinding, handler);
}
