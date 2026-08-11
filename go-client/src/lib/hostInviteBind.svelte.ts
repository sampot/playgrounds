/**
 * go-client Host-invite controller (GO-INVITE).
 *
 * Owns a protocol-agnostic `hostRuntime` for the mounted catalog SAM, adapts it
 * to the shell-session shell (`/api/shell/session/*` proxied from the SAM
 * iframe), and surfaces invite share-sheet events.
 *
 * Protocol comes from the catalog entry (`hostableProtocolFor`) — not hardcoded
 * to any game. Login gate: `goAuth.isLoggedIn` — minting without a key throws
 * `not_provisioned` and the UI routes to login (no alert).
 */

import { registerGoShellSessionHost, type GoShellSessionHost } from "./goShellSession";
import type { GoShellPlatformInviteEvent } from "./goShellPlatform";
import {
  createHostRuntime,
  type HostRuntime,
  type HostRuntimeDeps,
  type HostPhase,
  type HostStatus,
} from "./hostRuntime";
import { handleGoFunctionsApi } from "./goFunctionsRuntime";
import { hostableProtocolFor, type GoCatalogEntry, type HostableProtocol } from "./goCatalog";
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
  /** Generic host status mirror (seats / hostRole / guestTarget). */
  host: HostStatus;
};

export type HostInviteController = {
  bind: () => void;
  unbind: () => void;
  /** Mint an invite (login required). Returns full share target on success. */
  mintShare: () => Promise<HostInviteShare | null>;
  /**
   * Adopt an invite minted by the Host SAM's own CTA (`/api/shell/platform/
   * invite` proxy success). Opens the session first if needed, then runs the
   * Host answer loop and surfaces the share sheet.
   */
  adoptSamInvite: (ev: GoShellPlatformInviteEvent) => Promise<HostInviteShare | null>;
  /** Host act — forward an opaque protocol payload to the Host SAM. */
  act: (payload: unknown) => Promise<unknown>;
  close: () => Promise<void>;
  subscribe: (fn: (s: HostInviteStatus) => void) => () => void;
  getStatus: () => HostInviteStatus;
};

function toProtocolSpec(proto: HostableProtocol): RosterSessionProtocolSpec {
  return {
    protocolId: proto.protocolId,
    apiVersion: proto.apiVersion,
    roles: [...proto.roles],
    ...(proto.roleLimits ? { roleLimits: { ...proto.roleLimits } } : {}),
    joinPolicy: "invite_only",
  };
}

export function createHostInviteBind(opts: {
  catalogId: string;
  entry: Pick<GoCatalogEntry, "id" | "title" | "source" | "protocols">;
  getFiles: () => FileMap | null;
  getSandboxId: () => string | null;
}): HostInviteController {
  const { catalogId, entry, getFiles, getSandboxId } = opts;
  const protocol = hostableProtocolFor(entry)!;
  if (!protocol) {
    throw new Error("此小品未宣告可主持的 session 協定");
  }
  const protocolSpec = toProtocolSpec(protocol);

  let runtime: HostRuntime | null = null;
  let listeners = new Set<(s: HostInviteStatus) => void>();
  let status: HostInviteStatus = {
    phase: "idle",
    invite: null,
    host: {
      phase: "idle",
      message: "",
      error: null,
      sessionId: null,
      channelName: null,
      inviteId: null,
      shortUrl: null,
      hostRole: "host",
      guestRoles: protocol.roles.filter(r => r !== "host"),
      guestTarget: 0,
      seats: [],
    },
  };

  function getHostDeps(): HostRuntimeDeps {
    return {
      getFiles,
      getSandboxId,
      protocol,
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
          protocol: protocolSpec,
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
        const seats = [
          {
            seatId: "host",
            role: s.hostRole,
            kind: "human",
            sandboxId: "host",
            paused: false,
          },
          ...s.seats.map(seat => ({
            seatId: seat.seatId,
            role: seat.role,
            kind: "human",
            sandboxId: seat.peerId,
            paused: false,
          })),
        ];
        return {
          active: true,
          status: s.phase === "idle" || s.phase === "error" ? "closed" : "open",
          sessionId: s.sessionId ?? undefined,
          channelName: s.channelName ?? undefined,
          protocol: protocolSpec,
          seats,
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
        // Host SAM hosts act directly; forward everything opaque to functions.js.
        return invokeHostSessionShim(runtime, normalized, init);
      },
    };
  }

  async function invokeHostSessionShim(
    rt: HostRuntime,
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string }
  ): Promise<unknown> {
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
        host: r,
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
      title: `邀請你玩${entry.title}`,
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
        protocol: protocolSpec,
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

  async function act(payload: unknown) {
    return ensureRuntime().act(payload);
  }
  async function close() {
    return ensureRuntime().close();
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
    act,
    close,
    subscribe,
    getStatus: () => ({ ...status }),
  };
}
