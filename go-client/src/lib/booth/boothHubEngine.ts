import type {
  BoothErrorCode,
  BoothStateSnapshot,
  BoothSubscribeScope,
} from "@pg/roster/boothChannel";
import {
  boothShellCanDirect,
  DEFAULT_PEER_CAP_TTL_MS,
  pickOperatorDirectorRole,
  type BoothDirectorLock,
  type BoothPeerCapRecord,
} from "./boothState";

export type BoothAck = {
  ok: boolean;
  error?: BoothErrorCode;
  payload?: Record<string, unknown>;
};

export type BoothCastOfferPayload = {
  kind?: string;
  peerId?: string;
  label?: string;
  id?: string;
  scope?: "share" | "private";
};

export type BoothIntent =
  | { type: "invite.mint" }
  | { type: "invite.revoke" }
  | { type: "cast.offer"; payload: BoothCastOfferPayload }
  | { type: "cast.unoffer" }
  | { type: "cast.state"; payload: { paused?: boolean; t?: number } }
  | { type: "peer.mint"; label?: string; ttlSec?: number }
  | { type: "peer.revoke"; peerCapId: string }
  | { type: "ejectPeer"; peerId: string }
  | { type: "private.import"; name: string; size: number; mime?: string }
  | { type: "private.remove"; id: string }
  | { type: "private.mountToShare"; id: string }
  | { type: "private.fetch"; id: string }
  | { type: "share.import"; name: string; size: number; mime?: string }
  | { type: "share.unshare"; id: string }
  | { type: "share.fetch"; id: string }
  | { type: "share.rescan" }
  | { type: "end" };

export type BoothEngineEvent =
  | { type: "booth.state.snapshot"; snapshot: BoothStateSnapshot }
  | {
      type: "booth.event.director.changed";
      director: BoothDirectorLock | null;
    };

export type BoothMediaSurface = {
  bindProgramVideo(el: HTMLVideoElement): void;
  requestPresencePreview(peerId: string, el: HTMLVideoElement): void;
  releasePresencePreview(peerId: string): void;
};

export type BoothShellContext = {
  shellId: string;
  role: "host" | "operator" | "viewer";
};

export type BoothHubEngineHandlers = {
  inviteMint: () => Promise<void>;
  inviteRevoke: () => Promise<void>;
  castOffer: (payload: BoothCastOfferPayload) => Promise<void>;
  castUnoffer: () => Promise<void>;
  castState: (payload: { paused?: boolean; t?: number }) => Promise<void>;
  ejectPeer: (peerId: string) => Promise<void>;
  end: () => Promise<void>;
  privateImport?: (input: {
    name: string;
    size: number;
    mime?: string;
  }) => Promise<{ transferId: string; id: string }>;
  privateRemove?: (id: string) => Promise<void>;
  privateMountToShare?: (id: string) => Promise<void>;
  privateFetch?: (id: string) => Promise<{ transferId: string }>;
  shareImport?: (input: {
    name: string;
    size: number;
    mime?: string;
  }) => Promise<{ transferId: string; id: string }>;
  shareUnshare?: (id: string) => Promise<void>;
  shareFetch?: (id: string) => Promise<{ transferId: string }>;
  shareRescan?: () => Promise<void>;
};

/** Authoritative booth Hub — no DOM (PG-GO-ROOM-ENGINE-PLAN §14). */
export interface BoothHubEngine {
  readonly sessionId: string;
  readonly engineRole: "hub";
  readonly mode: "embedded" | "daemon";

  subscribe(
    scopes: BoothSubscribeScope[],
    listener: (msg: BoothEngineEvent) => void
  ): () => void;

  dispatch(intent: BoothIntent, shell: BoothShellContext): Promise<BoothAck>;

  getDirector(): BoothDirectorLock | null;

  registerShell(shell: { shellId: string; role: "host" | "operator" | "viewer" }): void;

  /** Operator hello path — returns role grant + optional director lock. */
  claimOperatorDirector(shellId: string): {
    role: "operator" | "viewer";
    director?: BoothDirectorLock;
  };

  syncDirectorFromHostFocus(localHostClaimsDirector: boolean): void;

  getMediaSurface(): BoothMediaSurface;

  shutdown(reason?: "user" | "replace"): Promise<void>;
}

const DIRECTOR_INTENTS = new Set<BoothIntent["type"]>([
  "invite.mint",
  "invite.revoke",
  "cast.offer",
  "cast.unoffer",
  "cast.state",
  "peer.mint",
  "peer.revoke",
  "ejectPeer",
  "end",
]);

export function intentRequiresDirector(intent: BoothIntent): boolean {
  return DIRECTOR_INTENTS.has(intent.type);
}

function newPeerCapToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `pg_peer_${b64}`;
}

function buildPeerJoinUrl(peerCap: string, sessionId: string): string {
  if (typeof location !== "undefined" && location.origin) {
    const url = new URL("/room/peer", location.origin);
    url.searchParams.set("peerCap", peerCap);
    url.searchParams.set("hub", sessionId);
    return url.toString();
  }
  return `pg-booth://peer/join?cap=${encodeURIComponent(peerCap)}&hub=${encodeURIComponent(sessionId)}`;
}

export function createEmbeddedBoothHubEngine(opts: {
  ownerUserId: () => string | null;
  buildSnapshot: () => BoothStateSnapshot;
  handlers: BoothHubEngineHandlers;
  localHostClaimsDirector?: () => boolean;
  getMediaSurface?: () => BoothMediaSurface;
  onDirectorChanged?: (director: BoothDirectorLock | null) => void;
}): BoothHubEngine {
  const sessionId = crypto.randomUUID();
  let ended = false;
  let director: BoothDirectorLock | null = null;
  let hostShellId: string | null = null;
  let activePeerCap: BoothPeerCapRecord | null = null;
  const listeners = new Set<(msg: BoothEngineEvent) => void>();

  const localHostClaimsDirector =
    opts.localHostClaimsDirector ??
    (() => {
      if (typeof document === "undefined") return true;
      return document.hasFocus();
    });

  function publishSnapshot(): void {
    const snapshot = opts.buildSnapshot();
    const msg: BoothEngineEvent = {
      type: "booth.state.snapshot",
      snapshot: { ...snapshot, sessionId },
    };
    for (const listener of listeners) listener(msg);
  }

  function setDirector(next: BoothDirectorLock | null): void {
    const prev = director;
    director = next;
    if (
      prev?.shellId === next?.shellId &&
      prev?.role === next?.role
    ) {
      return;
    }
    opts.onDirectorChanged?.(next);
    const msg: BoothEngineEvent = {
      type: "booth.event.director.changed",
      director: next,
    };
    for (const listener of listeners) listener(msg);
  }

  function ensureHostDirector(): void {
    if (!hostShellId) return;
    if (localHostClaimsDirector()) {
      setDirector({ shellId: hostShellId, role: "host" });
      return;
    }
    if (director?.role === "host") {
      setDirector(null);
    }
  }

  function shellCanDirect(shell: BoothShellContext): boolean {
    return boothShellCanDirect({
      director,
      shellId: shell.shellId,
      localHostClaimsDirector: localHostClaimsDirector(),
      role: shell.role,
    });
  }

  async function dispatch(
    intent: BoothIntent,
    shell: BoothShellContext
  ): Promise<BoothAck> {
    if (ended) return { ok: false, error: "session_ended" };
    if (intentRequiresDirector(intent) && !shellCanDirect(shell)) {
      return { ok: false, error: "not_director" };
    }

    try {
      switch (intent.type) {
        case "invite.mint":
          await opts.handlers.inviteMint();
          publishSnapshot();
          return { ok: true };
        case "invite.revoke":
          await opts.handlers.inviteRevoke();
          publishSnapshot();
          return { ok: true };
        case "cast.offer":
          await opts.handlers.castOffer(intent.payload);
          publishSnapshot();
          return { ok: true };
        case "cast.unoffer":
          await opts.handlers.castUnoffer();
          publishSnapshot();
          return { ok: true };
        case "cast.state":
          await opts.handlers.castState(intent.payload);
          publishSnapshot();
          return { ok: true };
        case "peer.mint": {
          if (activePeerCap && !activePeerCap.revoked) {
            return { ok: false, error: "engine_busy" };
          }
          const ttlMs =
            typeof intent.ttlSec === "number" && intent.ttlSec > 0
              ? intent.ttlSec * 1000
              : DEFAULT_PEER_CAP_TTL_MS;
          const peerCapId = crypto.randomUUID();
          const peerCap = newPeerCapToken();
          activePeerCap = {
            peerCapId,
            peerCap,
            label: intent.label,
            expiresAt: Date.now() + ttlMs,
            revoked: false,
          };
          publishSnapshot();
          return {
            ok: true,
            payload: {
              peerCapId,
              peerCap,
              joinUrl: buildPeerJoinUrl(peerCap, sessionId),
              expiresAt: activePeerCap.expiresAt,
              label: intent.label,
            },
          };
        }
        case "peer.revoke": {
          if (!activePeerCap || activePeerCap.peerCapId !== intent.peerCapId) {
            return { ok: false, error: "peer_gone" };
          }
          activePeerCap = { ...activePeerCap, revoked: true };
          publishSnapshot();
          return { ok: true };
        }
        case "ejectPeer":
          await opts.handlers.ejectPeer(intent.peerId);
          publishSnapshot();
          return { ok: true };
        case "private.import": {
          if (!opts.handlers.privateImport) {
            return { ok: false, error: "invalid_intent" };
          }
          const payload = await opts.handlers.privateImport(intent);
          return { ok: true, payload };
        }
        case "private.remove":
          if (!opts.handlers.privateRemove) {
            return { ok: false, error: "invalid_intent" };
          }
          await opts.handlers.privateRemove(intent.id);
          publishSnapshot();
          return { ok: true };
        case "private.mountToShare":
          if (!opts.handlers.privateMountToShare) {
            return { ok: false, error: "invalid_intent" };
          }
          await opts.handlers.privateMountToShare(intent.id);
          publishSnapshot();
          return { ok: true };
        case "private.fetch": {
          if (!opts.handlers.privateFetch) {
            return { ok: false, error: "invalid_intent" };
          }
          const payload = await opts.handlers.privateFetch(intent.id);
          return { ok: true, payload };
        }
        case "share.import": {
          if (!opts.handlers.shareImport) {
            return { ok: false, error: "invalid_intent" };
          }
          const payload = await opts.handlers.shareImport(intent);
          publishSnapshot();
          return { ok: true, payload };
        }
        case "share.unshare":
          if (!opts.handlers.shareUnshare) {
            return { ok: false, error: "invalid_intent" };
          }
          await opts.handlers.shareUnshare(intent.id);
          publishSnapshot();
          return { ok: true };
        case "share.fetch": {
          if (!opts.handlers.shareFetch) {
            return { ok: false, error: "invalid_intent" };
          }
          const payload = await opts.handlers.shareFetch(intent.id);
          return { ok: true, payload };
        }
        case "share.rescan":
          if (!opts.handlers.shareRescan) {
            return { ok: false, error: "invalid_intent" };
          }
          await opts.handlers.shareRescan();
          publishSnapshot();
          return { ok: true };
        case "end":
          await opts.handlers.end();
          ended = true;
          setDirector(null);
          publishSnapshot();
          return { ok: true };
        default:
          return { ok: false, error: "invalid_intent" };
      }
    } catch (e) {
      if (e && typeof e === "object" && "code" in e) throw e;
      return { ok: false, error: "invalid_intent" };
    }
  }

  const noopMediaSurface: BoothMediaSurface = {
    bindProgramVideo() {},
    requestPresencePreview() {},
    releasePresencePreview() {},
  };

  return {
    sessionId,
    engineRole: "hub",
    mode: "embedded",

    subscribe(scopes, listener) {
      void scopes;
      listeners.add(listener);
      listener({
        type: "booth.state.snapshot",
        snapshot: { ...opts.buildSnapshot(), sessionId },
      });
      return () => listeners.delete(listener);
    },

    dispatch,

    getDirector() {
      return director;
    },

    registerShell(shell) {
      if (shell.role === "host") {
        hostShellId = shell.shellId;
        ensureHostDirector();
      }
    },

    claimOperatorDirector(shellId) {
      const picked = pickOperatorDirectorRole({
        shellId,
        director,
        localHostClaimsDirector: localHostClaimsDirector(),
      });
      if (picked.director) setDirector(picked.director);
      return picked;
    },

    syncDirectorFromHostFocus(claims) {
      if (claims && hostShellId) {
        setDirector({ shellId: hostShellId, role: "host" });
        return;
      }
      ensureHostDirector();
    },

    getMediaSurface() {
      return opts.getMediaSurface?.() ?? noopMediaSurface;
    },

    async shutdown(_reason) {
      if (ended) return;
      await dispatch(
        { type: "end" },
        { shellId: hostShellId ?? "host-local", role: "host" }
      );
    },
  };
}
