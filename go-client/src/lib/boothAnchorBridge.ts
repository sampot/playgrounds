import type { BoothEnvelope, BoothStateSnapshot } from "@pg/roster/boothChannel";
import {
  broadcastSessionChat,
  isSessionChatMessage,
} from "@pg/roster/rosterSessionChat";
import { isSessionChatCtlMessage } from "@pg/roster/rosterSessionChatCtl";
import { createBoothAnchorHost, type BoothAnchorHost } from "./boothPlatform";
import { createBoothOwnerFileHost } from "./boothOwnerFileChannel";
import {
  applyBoothCastStateToMedia,
  parseBoothCastStatePayload,
} from "./boothCastState";
import { roomHostDisplayName, roomTvBindStream } from "./goRoom";
import { goAuth } from "./goAuth.svelte";
import { goRoomFiles } from "./goRoomFiles.svelte";
import { goRoomPrivateFiles } from "./goRoomPrivateFiles.svelte";
import { goRoomMedia } from "./goRoomMedia.svelte";
import { goSessionChat } from "./goSessionChat.svelte";
import { newRoomPrivateFileId } from "./goRoomPrivateLibrary";
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
  getHostPeerId: () => string;
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
  onOperatorCastFile: (
    fileId: string,
    scope?: "share" | "private"
  ) => Promise<void>;
  onOperatorStopTv: () => Promise<void>;
  onOperatorHaltLive: (
    peerId: string,
    layer: "audio" | "video"
  ) => Promise<void>;
  onOperatorStartRecord: (
    peerId: string,
    displayName?: string,
    label?: string
  ) => Promise<void>;
  onOperatorStopRecord: (peerId: string) => Promise<void>;
  onOperatorMintInvite: () => Promise<void>;
  onOperatorRevokeInvite: () => Promise<void>;
  onOperatorCastState: (payload: {
    paused?: boolean;
    t?: number;
  }) => Promise<void>;
  onOperatorKickPeer: (peerId: string) => Promise<void>;
  onOperatorEndBooth: () => Promise<void>;
  onOperatorStartAutoPlay: (catalogId: string) => Promise<{
    ok: boolean;
    reason?: string;
    missingRoles?: string[];
  }>;
  onOperatorStartManualPlay: (
    catalogId: string,
    picks: { role: string; peerId: string }[]
  ) => Promise<{
    ok: boolean;
    reason?: string;
    missingRoles?: string[];
  }>;
  onOperatorEndPlay: () => Promise<{ ok: boolean; reason?: string }>;
  getTvProgramStream?: () => MediaStream | null;
  fanoutChat?: (msg: unknown) => void;
  getLocalPresence?: () => { agentId: string; name: string };
  prepareOperatorRoster?: (
    shellId: string
  ) => import("@pg/roster/rosterPeer").RosterPeerHandlers;
  onOperatorSession?: (input: {
    shellId: string;
    session: import("@pg/roster/rosterPeer").RosterPeerSession;
  }) => void;
}): BoothAnchorBridge {
  const boothSessionId = crypto.randomUUID();
  let enabled = readRemoteAnchorEnabled();
  let host: BoothAnchorHost | null = null;
  let starting: Promise<void> | null = null;
  let ownerDc: RTCDataChannel | null = null;
  let ownerFileHost: ReturnType<typeof createBoothOwnerFileHost> | null = null;

  function ensureOwnerFileHost(): ReturnType<typeof createBoothOwnerFileHost> {
    ownerFileHost ??= createBoothOwnerFileHost({
      newPrivateId: () => newRoomPrivateFileId(),
      importPrivateFile: async (file) => {
        const err = await goRoomPrivateFiles.importFiles([file]);
        if (err) return { ok: false as const, error: err };
        host?.publishSnapshot();
        return { ok: true as const };
      },
      exportPrivateFile: (id) => goRoomPrivateFiles.getFile(id),
      importShareFile: async (file) => {
        const result = await goRoomFiles.shareLocalFile(file);
        if (!result.ok) return { ok: false as const, error: result.error };
        host?.publishSnapshot();
        return { ok: true as const, id: result.id };
      },
      exportShareFile: async (id) => goRoomFiles.localFile(id),
      send: (text) => {
        if (ownerDc?.readyState === "open") ownerDc.send(text);
      },
      bufferedAmount: () => ownerDc?.bufferedAmount ?? 0,
    });
    return ownerFileHost;
  }

  function bindOwnerDataChannel(dc: RTCDataChannel): void {
    ownerDc = dc;
    const hostFile = ensureOwnerFileHost();
    dc.onmessage = (ev) => {
      const text = typeof ev.data === "string" ? ev.data : "";
      if (text) hostFile.handleMessage(text);
    };
    dc.onclose = () => {
      if (ownerDc === dc) ownerDc = null;
    };
  }

  function buildSnapshot(): BoothStateSnapshot {
    const s = ctx.getStatus();
    const inviteGate =
      s.inviteDoor === "live"
        ? "live"
        : s.inviteDoor === "expired"
          ? "expired"
          : "none";
    const lives = ctx.getRemoteLives?.() ?? [];
    const hostPeerId = ctx.getHostPeerId();
    const hostName = roomHostDisplayName(goAuth.profile);
    const shareEntries = goRoomFiles.catalogItems().map((item) => {
      const listed = goRoomFiles.entries.find((e) => e.id === item.id);
      return {
        id: item.id,
        name: item.name,
        size: item.size,
        mime: listed?.mime,
        status:
          listed?.status === "ready" ||
          listed?.status === "receiving" ||
          listed?.status === "error"
            ? listed.status
            : ("ready" as const),
      };
    });
    const chatTail = goSessionChat.messages
      .slice(-40)
      .map((chat) => ({ ...chat }));
    const privateEntries = goRoomPrivateFiles.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      size: entry.size,
      mime: entry.mime,
      status: "ready" as const,
    }));
    const recordingIds = goRoomMedia.recordingPeerIds;
    const recordings =
      recordingIds.length > 0
        ? recordingIds.map((peerId) => ({
            peerId,
            displayName:
              peerId === hostPeerId
                ? hostName
                : s.occupantPeers.find((p) => p.peerId === peerId)?.name ??
                  peerId,
            startedAt: Date.now(),
            status: "recording" as const,
          }))
        : undefined;
    return {
      sessionId: boothSessionId,
      ownerUserId: ctx.getOwnerUserId() ?? "",
      engineMode: "embedded",
      hostPeerId,
      hostDisplayName: hostName,
      members: [
        {
          peerId: hostPeerId,
          displayName: hostName,
          kind: "host",
          isHost: true,
        },
        ...s.occupantPeers.map((p) => {
          const live = lives.find((l) => l.peerId === p.peerId);
          const kind =
            p.kind === "operator" || p.kind === "peer" || p.kind === "guest"
              ? p.kind
              : "guest";
          return {
            peerId: p.peerId,
            displayName: p.name,
            kind,
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
      ],
      cast: ctx.getCastSummary?.(),
      recordings,
      inviteGate,
      inviteShortUrl: s.shortUrl ?? undefined,
      inviteExpiresAt: s.inviteExpiresAt ?? undefined,
      shareFileCount: shareEntries.length,
      shareFiles: shareEntries,
      privateFileCount: privateEntries.length,
      privateFiles: privateEntries,
      chatTail,
      guestCount: s.guestCount,
      anchor: host ? "online" : "registering",
    };
  }

  function localHostClaimsDirector(): boolean {
    if (typeof document === "undefined") return true;
    return document.hasFocus();
  }

  async function handleOperatorIntent(
    frame: BoothEnvelope
  ): Promise<Record<string, unknown> | void> {
    if (frame.type === "booth.intent.cast.offer") {
      const payload = frame.payload as {
        peerId?: string;
        kind?: string;
        label?: string;
        id?: string;
        scope?: "share" | "private";
      };
      if (payload?.kind === "live" && payload.peerId) {
        await ctx.onOperatorCastLive(payload.peerId, payload.label);
        return;
      }
      if (payload?.kind === "file" && payload.id) {
        await ctx.onOperatorCastFile(payload.id, payload.scope);
        return;
      }
      throw new Error("invalid_cast_offer");
    }
    if (frame.type === "booth.intent.cast.unoffer") {
      await ctx.onOperatorStopTv();
      return;
    }
    if (frame.type === "booth.intent.cast.state") {
      const payload = parseBoothCastStatePayload(frame.payload);
      if (!payload) throw new Error("invalid_intent");
      await ctx.onOperatorCastState(payload);
      host?.publishSnapshot();
      return;
    }
    if (frame.type === "booth.intent.live.halt") {
      const payload = frame.payload as {
        peerId?: string;
        layer?: "audio" | "video";
      };
      const peerId = payload?.peerId?.trim();
      const layer = payload?.layer;
      if (!peerId || (layer !== "audio" && layer !== "video")) {
        throw new Error("invalid_halt");
      }
      await ctx.onOperatorHaltLive(peerId, layer);
      return;
    }
    if (frame.type === "booth.intent.record.start") {
      const payload = frame.payload as {
        peerId?: string;
        displayName?: string;
        label?: string;
      };
      const peerId = payload?.peerId?.trim();
      if (!peerId) throw new Error("missing_peer");
      await ctx.onOperatorStartRecord(
        peerId,
        payload.displayName,
        payload.label
      );
      host?.publishSnapshot();
      return;
    }
    if (frame.type === "booth.intent.record.stop") {
      const peerId = (frame.payload as { peerId?: string })?.peerId?.trim();
      if (!peerId) throw new Error("missing_peer");
      await ctx.onOperatorStopRecord(peerId);
      host?.publishSnapshot();
      return;
    }
    if (frame.type === "booth.intent.invite.mint") {
      await ctx.onOperatorMintInvite();
      return;
    }
    if (frame.type === "booth.intent.invite.revoke") {
      await ctx.onOperatorRevokeInvite();
      host?.publishSnapshot();
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
    if (frame.type === "booth.intent.play.start") {
      const payload = frame.payload as {
        catalogId?: string;
        mode?: "auto" | "manual";
        seats?: { role: string; peerId: string }[];
      };
      const catalogId = payload?.catalogId?.trim();
      if (!catalogId) throw new Error("missing_catalog");
      if (payload?.mode === "manual") {
        const out = await ctx.onOperatorStartManualPlay(
          catalogId,
          payload.seats ?? []
        );
        if (!out.ok) throw new Error(out.reason ?? "play_start_failed");
        return;
      }
      const out = await ctx.onOperatorStartAutoPlay(catalogId);
      if (!out.ok) throw new Error(out.reason ?? "play_start_failed");
      return;
    }
    if (frame.type === "booth.intent.play.end") {
      const out = await ctx.onOperatorEndPlay();
      if (!out.ok) throw new Error(out.reason ?? "play_end_failed");
      return;
    }
    if (frame.type === "booth.intent.chat.send") {
      const payload = frame.payload as { message?: unknown };
      const msg = payload?.message;
      if (!isSessionChatMessage(msg) && !isSessionChatCtlMessage(msg)) {
        throw new Error("invalid_chat");
      }
      if (ctx.fanoutChat) {
        ctx.fanoutChat(msg);
        return;
      }
      throw new Error("chat_unavailable");
    }
    if (frame.type === "booth.intent.private.import") {
      const payload = frame.payload as {
        name?: string;
        size?: number;
        mime?: string;
      };
      const name = payload?.name?.trim();
      const size = payload?.size;
      if (!name || typeof size !== "number" || size < 0) {
        throw new Error("invalid_intent");
      }
      return ensureOwnerFileHost().beginPrivateUpload({
        name,
        size,
        mime: payload?.mime,
      });
    }
    if (frame.type === "booth.intent.private.remove") {
      const id = (frame.payload as { id?: string })?.id?.trim();
      if (!id) throw new Error("private_not_found");
      await goRoomPrivateFiles.remove(id);
      host?.publishSnapshot();
      return;
    }
    if (frame.type === "booth.intent.private.fetch") {
      const id = (frame.payload as { id?: string })?.id?.trim();
      if (!id) throw new Error("private_not_found");
      const ack = await ensureOwnerFileHost().preparePrivateDownload(id);
      void ensureOwnerFileHost().streamDownload(ack.transferId!);
      return ack;
    }
    if (frame.type === "booth.intent.private.mountToShare") {
      const id = (frame.payload as { id?: string })?.id?.trim();
      if (!id) throw new Error("private_not_found");
      const file = await goRoomPrivateFiles.getFile(id);
      if (!file) throw new Error("private_not_found");
      const result = await goRoomFiles.shareLocalFile(file);
      if (!result.ok) throw new Error(result.error);
      host?.publishSnapshot();
      return;
    }
    if (frame.type === "booth.intent.share.import") {
      const payload = frame.payload as {
        name?: string;
        size?: number;
        mime?: string;
      };
      const name = payload?.name?.trim();
      const size = payload?.size;
      if (!name || typeof size !== "number" || size < 0) {
        throw new Error("invalid_intent");
      }
      return ensureOwnerFileHost().beginShareUpload({
        name,
        size,
        mime: payload?.mime,
      });
    }
    if (frame.type === "booth.intent.share.unshare") {
      const id = (frame.payload as { id?: string })?.id?.trim();
      if (!id || !goRoomFiles.unshare(id, { host: true })) {
        throw new Error("share_not_found");
      }
      host?.publishSnapshot();
      return;
    }
    if (frame.type === "booth.intent.share.fetch") {
      const id = (frame.payload as { id?: string })?.id?.trim();
      if (!id) throw new Error("share_not_found");
      const ack = await ensureOwnerFileHost().prepareShareDownload(id);
      void ensureOwnerFileHost().streamDownload(ack.transferId!);
      return ack;
    }
    throw new Error("unsupported_intent");
  }

  async function stopHost(): Promise<void> {
    ownerDc = null;
    ownerFileHost?.reset();
    ownerFileHost = null;
    if (host) {
      await host.stop();
      host = null;
    }
  }

  async function ensureStarted(): Promise<void> {
    if (!enabled) return;
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
          onOwnerDataChannel: bindOwnerDataChannel,
          getLocalPresence: () =>
            ctx.getLocalPresence?.() ?? {
              agentId: ctx.getHostPeerId(),
              name: roomHostDisplayName(goAuth.profile),
            },
          prepareOperatorRoster: ctx.prepareOperatorRoster,
          onOperatorSession: ctx.onOperatorSession,
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
      if (next) {
        await ensureStarted();
      } else {
        await stopHost();
      }
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
      await stopHost();
    },
  };
}
