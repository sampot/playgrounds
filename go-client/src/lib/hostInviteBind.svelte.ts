/**
 * go-client Host-invite controller (GO-INVITE §6.5/§6.6).
 *
 * Owns a `hostRuntime` for the mounted catalog SAM, adapts it to the
 * shell-session shell (`/api/shell/session/*` proxied from the SAM iframe),
 * and surfaces an invite share-sheet event when the SAM mints an invite.
 *
 * Login gate: `goAuth.isLoggedIn` — minting without a key throws
 * `not_provisioned` and the UI routes to login (no alert).
 */

import { registerGoShellSessionHost, type GoShellSessionHost } from "./goShellSession";
import type {
  GoShellPlatformInviteEvent,
} from "./goShellPlatform";
import {
  createHostRuntime,
  type HostRuntime,
  type HostRuntimeDeps,
  type HostPhase,
} from "./hostRuntime";
import { handleGoFunctionsApi } from "./goFunctionsRuntime";
import type { FileMap } from "@pg/projectTypes";
import type { RosterSessionProtocolSpec } from "@pg/roster/rosterSessionBridge";

export type HostInviteShare = {
  inviteId: string;
  shortUrl: string;
  url: string;
  title: string;
};

export type HostInviteStatus = {
  phase: HostPhase;
  invite: HostInviteShare | null;
};

export type HostInviteController = {
  bind: () => void;
  unbind: () => void;
  /** Mint an invite (login required). Returns full share target on success. */
  mintShare: () => Promise<HostInviteShare | null>;
  /**
   * Adopt an invite minted by the Host SAM's own CTA (`/api/shell/platform/
   * invite` proxy success). Opens the session first if needed, then runs the
   * Host answer loop and surfaces the share sheet via the status/subscribe.
   */
  adoptSamInvite: (ev: GoShellPlatformInviteEvent) => Promise<HostInviteShare | null>;
  start: (firstRole?: "host" | "player") => Promise<void>;
  place: (row: number, col: number) => Promise<void>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
  subscribe: (fn: (s: HostInviteStatus) => void) => () => void;
  getStatus: () => HostInviteStatus;
};

function gomokuProtocolSpec(): RosterSessionProtocolSpec {
  return {
    protocolId: "gomoku.v1",
    apiVersion: "1",
    roles: ["host", "player"],
    roleLimits: { host: 1, player: 1 },
    joinPolicy: "invite_only",
  };
}

export function createHostInviteBind(opts: {
  catalogId: string;
  entry: GoCatalogEntryLike;
  getFiles: () => FileMap | null;
  getSandboxId: () => string | null;
}): HostInviteController {
  const { catalogId, entry, getFiles, getSandboxId } = opts;
  let runtime: HostRuntime | null = null;
  let listeners = new Set<(s: HostInviteStatus) => void>();
  let status: HostInviteStatus = {
    phase: "idle",
    invite: null,
  };

  function getHostDeps(): HostRuntimeDeps {
    return {
      getFiles,
      getSandboxId,
      async invokeHostSession(
        path: string,
        init?: { method?: string; headers?: Record<string, string>; body?: string }
      ) {
        const sandboxId = getSandboxId();
        const files = getFiles();
        if (!sandboxId || !files) throw new Error("Host 沙盒尚未就緒");
        const same = await handleGoFunctionsApi(
          {
            getFiles,
            getSandboxId,
            getCatalogId: () => catalogId,
          },
          {
            method: init?.method || "GET",
            url: path,
            headers: Object.entries(init?.headers || {}),
            body:
              init?.body != null
                ? new TextEncoder().encode(init.body).buffer
                : null,
          }
        );
        const text = new TextDecoder().decode(same.body ?? new ArrayBuffer(0));
        const data = text ? (JSON.parse(text) as unknown) : null;
        if (same.status >= 400) {
          let message = `Host session API ${same.status}`;
          let code = "act_rejected";
          if (data && typeof data === "object") {
            const o = data as { error?: string; code?: string };
            if (typeof o.error === "string") message = o.error;
            if (typeof o.code === "string") code = o.code;
          }
          throw Object.assign(new Error(message), { code });
        }
        return data;
      },
    };
  }

  function shellHost(): GoShellSessionHost {
    return {
      async open() {
        if (!runtime) throw new Error("Host 尚未就緒");
        await runtime.open();
        const s = runtime.getStatus();
        return {
          sessionId: s.sessionId || "",
          channelName: s.channelName || "",
          protocol: gomokuProtocolSpec(),
        };
      },
      async close() {
        await runtime?.close();
      },
      async getStatus() {
        const s = runtime?.getStatus();
        if (!s) {
          return { active: false, seats: [] };
        }
        return {
          active: true,
          status: s.phase === "idle" || s.phase === "error" ? "closed" : "open",
          sessionId: s.sessionId ?? undefined,
          channelName: s.channelName ?? undefined,
          protocol: gomokuProtocolSpec(),
          seats: s.playerSeated
            ? [
                {
                  seatId: "host",
                  role: "host",
                  kind: "human",
                  sandboxId: "host",
                  paused: false,
                },
                {
                  seatId: "player",
                  role: "player",
                  kind: "human",
                  sandboxId: "player",
                  paused: false,
                },
              ]
            : [
                {
                  seatId: "host",
                  role: "host",
                  kind: "human",
                  sandboxId: "host",
                  paused: false,
                },
              ],
        };
      },
      async hostDomainFetch(fetchOpts) {
        if (!runtime) throw new Error("Host 尚未就緒");
        const path = String(fetchOpts.path || "");
        const normalized = path.startsWith("/") ? path : `/${path}`;
        if (!normalized.startsWith("/api/session/")) {
          throw Object.assign(new Error("host fetch 僅允許 /api/session/*"), {
            code: "forbidden",
          });
        }
        const init = {
          method: fetchOpts.method || "GET",
          headers: fetchOpts.headers,
          body: fetchOpts.body,
        };
        if (normalized.endsWith("/act") && init.method?.toUpperCase() === "POST") {
          const body = init.body ? (JSON.parse(init.body) as any) : {};
          const payload = body?.payload;
          const type = String(payload?.type || "");
          if (type === "start") {
            await runtime.start(
              payload?.firstRole === "player" ? "player" : "host"
            );
            return { state: { status: runtime.getStatus().phase } };
          }
          if (type === "reset") {
            await runtime.reset(
              payload?.firstRole === "player" ? "player" : "host"
            );
            return { state: { status: runtime.getStatus().phase } };
          }
          if (type === "place") {
            await runtime.place(Number(payload?.row), Number(payload?.col));
            return { state: { status: runtime.getStatus().phase } };
          }
        }
        return invokeHostSessionShim(runtime, normalized, init);
      },
    };
  }

  async function invokeHostSessionShim(
    rt: HostRuntime,
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string }
  ): Promise<unknown> {
    // Rebuild a HostRuntimeDeps-backed call: hostRuntime's own hostSessionFetch
    // is private, so route through the functions runtime (same env.KV).
    const sandboxId = getSandboxId();
    const files = getFiles();
    if (!sandboxId || !files) throw new Error("Host 沙盒尚未就緒");
    const same = await handleGoFunctionsApi(
      { getFiles, getSandboxId, getCatalogId: () => catalogId },
      {
        method: init.method || "GET",
        url: path,
        headers: Object.entries(init.headers || {}),
        body: init.body != null ? new TextEncoder().encode(init.body).buffer : null,
      }
    );
    const text = new TextDecoder().decode(same.body ?? new ArrayBuffer(0));
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (same.status >= 400) {
      let message = `Host session API ${same.status}`;
      let code = "act_rejected";
      if (data && typeof data === "object") {
        const o = data as { error?: string; code?: string };
        if (typeof o.error === "string") message = o.error;
        if (typeof o.code === "string") code = o.code;
      }
      throw Object.assign(new Error(message), { code });
    }
    return data;
  }

  let unsubRuntime: (() => void) | null = null;

  function ensureRuntime(): HostRuntime {
    if (runtime) return runtime;
    runtime = createHostRuntime(getHostDeps());
    unsubRuntime = runtime.subscribe(r => {
      status = {
        phase: r.phase,
        invite: status.invite,
      };
      emit();
    });
    return runtime;
  }

  function emit() {
    for (const l of listeners) l({ ...status });
  }

  function bind(): void {
    ensureRuntime();
    registerGoShellSessionHost(shellHost());
  }

  function unbind(): void {
    registerGoShellSessionHost(null);
    unsubRuntime?.();
    unsubRuntime = null;
    runtime?.dispose();
    runtime = null;
  }

  async function buildShare(
    mined: { inviteId: string; shortUrl: string }
  ): Promise<HostInviteShare> {
    const share: HostInviteShare = {
      inviteId: mined.inviteId,
      shortUrl: mined.shortUrl,
      url: mined.shortUrl,
      title: `邀請你對弈${entry.title}`,
    };
    status = { ...status, invite: share };
    emit();
    return share;
  }

  async function mintShare(): Promise<HostInviteShare | null> {
    const r = ensureRuntime();
    if (!r.getStatus().sessionId) {
      await r.open();
    }
    const intent = {
      version: 1,
      sam: {
        source: entry.source,
        resolve: "install_if_missing",
        presentation: "maximize_preview",
      },
      session: {
        protocol: gomokuProtocolSpec(),
        role: "player",
        consent: "always_ask",
      },
      transport: { roster: { signal: true } },
    };
    const mined = await r.mintInviteAndAnswer({
      kind: "invite.compose",
      intent,
    });
    if (!mined) return null;
    return buildShare(mined);
  }

  async function adoptSamInvite(
    ev: GoShellPlatformInviteEvent
  ): Promise<HostInviteShare | null> {
    const r = ensureRuntime();
    if (!r.getStatus().sessionId) {
      await r.open();
    }
    await r.adoptSamInvite({
      inviteId: ev.inviteId,
      shortUrl: ev.shortUrl,
    });
    return buildShare({ inviteId: ev.inviteId, shortUrl: ev.shortUrl });
  }

  async function start(firstRole?: "host" | "player") {
    await ensureRuntime().start(firstRole || "host");
  }
  async function place(row: number, col: number) {
    await ensureRuntime().place(row, col);
  }
  async function reset() {
    await ensureRuntime().reset();
  }
  async function close() {
    await ensureRuntime().close();
  }

  function subscribe(fn: (s: HostInviteStatus) => void): () => void {
    listeners.add(fn);
    fn({ ...status });
    return () => listeners.delete(fn);
  }

  return {
    bind,
    unbind,
    mintShare,
    adoptSamInvite,
    start,
    place,
    reset,
    close,
    subscribe,
    getStatus: () => ({ ...status }),
  };
}

type GoCatalogEntryLike = {
  id: string;
  title: string;
  source: string;
};