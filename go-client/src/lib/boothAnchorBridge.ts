import type { BoothEnvelope, BoothStateSnapshot } from "@pg/roster/boothChannel";
import { createBoothAnchorHost, type BoothAnchorHost } from "./boothPlatform";
import { roomTvBindStream } from "./goRoom";
import type { RoomStatus } from "./roomRuntime";

export const GO_ROOM_REMOTE_ANCHOR_KEY = "go_room_remote_anchor_v1";

export function readRemoteAnchorEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(GO_ROOM_REMOTE_ANCHOR_KEY) === "1";
}

export function writeRemoteAnchorEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(GO_ROOM_REMOTE_ANCHOR_KEY, enabled ? "1" : "0");
}

export type BoothAnchorBridge = {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): Promise<void>;
  onBoothOpen(): Promise<void>;
  publishSnapshot(): void;
  refreshProgram(): void;
  stop(): Promise<void>;
};

export function createBoothAnchorBridge(ctx: {
  getStatus: () => RoomStatus;
  getOwnerUserId: () => string | null;
  getApiKey: () => string | null;
  getCastSummary?: () => BoothStateSnapshot["cast"];
  getRemoteLives?: () => Array<{
    peerId: string;
    camera: boolean;
    mic: boolean;
  }>;
  onGuestJoinOffer: (input: {
    joinId: string;
    inviteId: string;
    offerWire: string;
  }) => Promise<string>;
  onOperatorCastLive: (peerId: string, label?: string) => Promise<void>;
  onOperatorMintInvite: () => Promise<void>;
  onOperatorKickPeer: (peerId: string) => Promise<void>;
  onOperatorEndBooth: () => Promise<void>;
  getTvProgramStream?: () => MediaStream | null;
}): BoothAnchorBridge {
  const boothSessionId = crypto.randomUUID();
  let enabled = readRemoteAnchorEnabled();
  let host: BoothAnchorHost | null = null;
  let starting: Promise<void> | null = null;

  function buildSnapshot(): BoothStateSnapshot {
    const s = ctx.getStatus();
    const inviteGate =
      s.inviteDoor === "live"
        ? "live"
        : s.inviteDoor === "expired"
          ? "expired"
          : "none";
    const lives = ctx.getRemoteLives?.() ?? [];
    return {
      sessionId: boothSessionId,
      ownerUserId: ctx.getOwnerUserId() ?? "",
      engineMode: "embedded",
      members: s.occupantPeers.map((p) => {
        const live = lives.find((l) => l.peerId === p.peerId);
        return {
          peerId: p.peerId,
          displayName: p.name,
          kind: "guest" as const,
          isHost: false,
          live: live
            ? {
                camera: live.camera,
                mic: live.mic,
                display: false,
              }
            : undefined,
        };
      }),
      cast: ctx.getCastSummary?.(),
      inviteGate,
      inviteShortUrl: s.shortUrl ?? undefined,
      shareFileCount: 0,
      guestCount: s.guestCount,
      anchor: host ? "online" : "registering",
    };
  }

  function localHostClaimsDirector(): boolean {
    if (typeof document === "undefined") return true;
    return document.hasFocus();
  }

  async function handleOperatorIntent(frame: BoothEnvelope): Promise<void> {
    if (frame.type === "booth.intent.cast.offer") {
      const payload = frame.payload as {
        peerId?: string;
        kind?: string;
        label?: string;
      };
      if (payload?.kind === "live" && payload.peerId) {
        await ctx.onOperatorCastLive(payload.peerId, payload.label);
      }
      return;
    }
    if (frame.type === "booth.intent.invite.mint") {
      await ctx.onOperatorMintInvite();
      return;
    }
    if (frame.type === "booth.intent.ejectPeer") {
      const peerId = (frame.payload as { peerId?: string })?.peerId?.trim();
      if (!peerId) throw new Error("missing_peer");
      await ctx.onOperatorKickPeer(peerId);
      return;
    }
    if (frame.type === "booth.intent.end") {
      await ctx.onOperatorEndBooth();
      return;
    }
    throw new Error("unsupported_intent");
  }

  async function ensureStarted(): Promise<void> {
    if (ctx.getStatus().phase !== "open") return;
    const key = ctx.getApiKey();
    if (!key) return;
    if (host) return;
    if (starting) {
      await starting;
      return;
    }
    starting = (async () => {
      const nextHost = createBoothAnchorHost(
        {
          getSnapshot: buildSnapshot,
          localHostClaimsDirector,
          onOperatorIntent: handleOperatorIntent,
          onGuestJoinOffer: (input) => ctx.onGuestJoinOffer(input),
          remoteOperatorEnabled: () => enabled,
          getTvProgramStream: ctx.getTvProgramStream,
        },
        {
          apiKey: key,
          boothSessionId,
          deviceLabel:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 48)
              : "browser",
        }
      );
      await nextHost.start();
      host = nextHost;
    })();
    try {
      await starting;
    } finally {
      starting = null;
    }
  }

  return {
    isEnabled() {
      return enabled;
    },
    async setEnabled(next: boolean) {
      enabled = next;
      writeRemoteAnchorEnabled(next);
      if (next) await ensureStarted();
    },
    onBoothOpen() {
      return ensureStarted();
    },
    publishSnapshot() {
      host?.publishSnapshot();
    },
    refreshProgram() {
      host?.refreshProgram();
    },
    async stop() {
      if (host) {
        await host.stop();
        host = null;
      }
    },
  };
}
