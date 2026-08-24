import type {
  BoothStateSnapshot,
  BoothSubscribeScope,
} from "@pg/roster/boothChannel";
import type {
  BoothAck,
  BoothEngineEvent,
  BoothHubEngine,
  BoothIntent,
  BoothMediaSurface,
  BoothShellContext,
} from "./boothHubEngine";
import type { BoothControlChannel } from "./boothControlChannel";
import type { BoothDirectorLock } from "./boothState";
import { boothShellCanDirect } from "./boothState";
import { intentRequiresDirector } from "./boothHubEngine";

export function createRemoteBoothHubEngine(opts: {
  connect: () => Promise<BoothControlChannel>;
  shellId: string;
  role?: BoothShellContext["role"];
}): BoothHubEngine & {
  connectChannel(): Promise<BoothStateSnapshot>;
  disconnect(): void;
} {
  const shellId = opts.shellId;
  const role = opts.role ?? "host";
  let channel: BoothControlChannel | null = null;
  let connectPromise: Promise<BoothControlChannel> | null = null;
  let sessionId = "";
  let ended = false;
  let director: BoothDirectorLock | null = null;
  let latestSnapshot: BoothStateSnapshot | null = null;
  const listeners = new Set<(msg: BoothEngineEvent) => void>();
  let channelUnsub: (() => void) | null = null;

  function publish(msg: BoothEngineEvent): void {
    for (const listener of listeners) listener(msg);
  }

  function syncDirectorFromSnapshot(snapshot: BoothStateSnapshot): void {
    director = snapshot.director ?? null;
    publish({ type: "booth.event.director.changed", director });
  }

  async function ensureChannel(): Promise<BoothControlChannel> {
    if (channel?.isOpen()) return channel;
    if (!connectPromise) {
      connectPromise = opts.connect().then(async (next) => {
        channel = next;
        if (!next.isOpen()) {
          await next.connect();
        }
        channelUnsub?.();
        channelUnsub = next.subscribe((msg) => {
          if (msg.type === "booth.state.snapshot") {
            latestSnapshot = msg.snapshot;
            sessionId = msg.snapshot.sessionId;
            syncDirectorFromSnapshot(msg.snapshot);
          }
          for (const listener of listeners) listener(msg);
        });
        return next;
      });
    }
    return connectPromise;
  }

  const noopMediaSurface: BoothMediaSurface = {
    bindProgramVideo() {},
    requestPresencePreview() {},
    releasePresencePreview() {},
  };

  return {
    get sessionId() {
      return sessionId;
    },
    engineRole: "hub",
    mode: "daemon",

    subscribe(scopes, listener) {
      void scopes;
      listeners.add(listener);
      if (latestSnapshot) {
        listener({
          type: "booth.state.snapshot",
          snapshot: latestSnapshot,
        });
      }
      return () => listeners.delete(listener);
    },

    async dispatch(intent, shell) {
      if (ended) return { ok: false, error: "session_ended" };
      const ch = await ensureChannel();
      const canDirect = boothShellCanDirect({
        director,
        shellId: shell.shellId,
        localHostClaimsDirector: false,
        role: shell.role,
      });
      if (intentRequiresDirector(intent) && !canDirect) {
        return { ok: false, error: "not_director" };
      }
      return ch.dispatch(intent);
    },

    getDirector() {
      return director;
    },

    registerShell(shell) {
      void shell;
    },

    claimOperatorDirector(nextShellId) {
      if (director?.shellId === nextShellId) {
        return { role: "operator" as const, director };
      }
      if (!director) {
        const grant = { shellId: nextShellId, role: "operator" as const };
        director = grant;
        return { role: "operator" as const, director: grant };
      }
      return { role: "viewer" as const };
    },

    syncDirectorFromHostFocus(claims) {
      if (claims && role === "host") {
        director = { shellId, role: "host" };
        publish({ type: "booth.event.director.changed", director });
      }
    },

    getMediaSurface() {
      return noopMediaSurface;
    },

    validatePeerCap() {
      return false;
    },

    async acceptPeerOffer() {
      return { error: "invalid_intent" as const };
    },

    async shutdown(_reason) {
      if (ended) return;
      const ch = channel;
      if (ch?.isOpen()) {
        await ch.dispatch({ type: "end" });
      }
      ended = true;
      director = null;
    },

    async connectChannel() {
      const ch = await ensureChannel();
      if (latestSnapshot) return latestSnapshot;
      const out = await ch.connect();
      sessionId = out.sessionId;
      latestSnapshot = out.snapshot;
      syncDirectorFromSnapshot(out.snapshot);
      publish({ type: "booth.state.snapshot", snapshot: out.snapshot });
      return out.snapshot;
    },

    disconnect() {
      channelUnsub?.();
      channelUnsub = null;
      channel?.close();
      channel = null;
      connectPromise = null;
      ended = false;
      director = null;
      latestSnapshot = null;
      sessionId = "";
    },
  };
}

export function applySnapshotToRoomFields(snapshot: BoothStateSnapshot): {
  guestCount: number;
  inviteShortUrl?: string;
  inviteExpiresAt?: number;
  inviteGate: "none" | "live" | "expired";
  occupantPeers: Array<{ peerId: string; name: string; kind?: string }>;
} {
  return {
    guestCount: snapshot.guestCount,
    inviteShortUrl: snapshot.inviteShortUrl,
    inviteExpiresAt: snapshot.inviteExpiresAt,
    inviteGate: snapshot.inviteGate,
    occupantPeers: snapshot.members
      .filter((m) => !m.isHost)
      .map((m) => ({
        peerId: m.peerId,
        name: m.displayName,
        kind: m.kind,
      })),
  };
}
