/**
 * go-client Host-invite controller (GO-INVITE).
 *
 * Owns a protocol-agnostic `hostRuntime` for the mounted catalog SAM, adapts it
 * to the shell-session shell (`/api/shell/session/*` proxied from the SAM
 * iframe — DEC-053 §6.7 transition layer), and surfaces invite share-sheet
 * events.
 *
 * DEC-053 alignment: the per-method bodies that translate host-runtime
 * operations into HostBridge calls live in `createGoHostBinding` (a single
 * factory used by `env.HOST`). This module wires the factory into the SW
 * dispatch (`GoShellSessionHost` adapter) and ensures the same `HostRuntime`
 * singleton is reused so `env.HOST` and the page-level host bar observe one
 * status — no split state.
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
import { createGoHostBinding, type GoHostBinding } from "./goHostBinding";
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
  /**
   * Resolve the live `HostRuntime` singleton for this controller (or null when
   * not yet bound). DEC-053: `env.HOST` in functions.js and the SW shell
   * session adapter must reference the same instance to keep state coherent.
   */
  getHostRuntime: () => HostRuntime | null;
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
      protocolId: protocol.protocolId,
      apiVersion: protocol.apiVersion || "1",
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
            getHostRuntime: () => ensureRuntime(),
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

  /**
   * Build a single `GoHostBinding` instance backed by this controller's
   * `HostRuntime` singleton. Created lazily and re-used by both `env.HOST`
   * and the SW shell session adapter (`shellHost`) so the two paths stay
   * perfectly in sync. Recreated on every `bind()` so each new runtime gets a
   * fresh factory bound to it (cheap — just method dispatch tables).
   */
  let hostBinding: GoHostBinding | null = null;

  function getHostBinding(): GoHostBinding {
    if (hostBinding) return hostBinding;
    hostBinding = createGoHostBinding({
      getHostRuntime: () => runtime,
    });
    return hostBinding;
  }

  /**
   * Adapter that translates the legacy `/api/shell/session/*` SW dispatch
   * (DEC-053 §6.7 transition layer) into the canonical `GoHostBinding`
   * surface. New SAMs call `env.HOST` directly via functions.js; this
   * adapter only exists for SAMs that have not yet migrated to the
   * `env.HOST` route set (`/api/host/*`).
   */
  function shellHost(): GoShellSessionHost {
    return {
      async open() {
        const rt = runtime;
        if (!rt) throw new Error("Host 尚未就緒");
        const opened = await getHostBinding().openSession();
        return {
          sessionId: opened.sessionId,
          channelName: opened.channelName,
          protocol: protocolSpec,
        };
      },
      async close() {
        const binding = getHostBinding();
        await binding.closeSession();
      },
      async getStatus() {
        const rt = runtime;
        if (!rt) {
          return { active: false, seats: [] };
        }
        const session = await getHostBinding().getSession();
        const listSeats = await getHostBinding().listSeats();
        return {
          active: Boolean(session),
          status: session ? "open" : "closed",
          sessionId: session?.sessionId,
          channelName: session?.channelName,
          protocol: protocolSpec,
          seats: listSeats.map(seat => ({
            seatId: seat.seatId,
            role: seat.role,
            kind: seat.kind,
            sandboxId: seat.sandboxId ?? "",
            paused: seat.paused,
          })),
        };
      },
      async hostDomainFetch(fetchOpts) {
        const rt = runtime;
        if (!rt) throw new Error("Host 尚未就緒");
        return getHostBinding().hostSessionFetch(fetchOpts.path, {
          method: fetchOpts.method,
          headers: fetchOpts.headers,
          body: fetchOpts.body,
        });
      },
    };
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
    hostBinding = null;
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
    getHostRuntime: () => runtime,
  };
}
