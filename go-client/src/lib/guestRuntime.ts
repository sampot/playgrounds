/**
 * Pure-play Guest join runtime (DEC-050 / gomoku E2E).
 * Memory SAM + Platform ticket WebRTC + session tunnel — no OPFS / IDE.
 */

import {
  createJoin,
  fetchGuestTurnIceServers,
  postOfferAndWaitAnswer,
  previewInvite,
  type InviteMeta,
} from "@pg/platform/platformClient";
import {
  composeSamSource,
  composeSessionProtocol,
  composeWantsRelay,
  isRoomInvite,
  wantsRosterSignal,
} from "@pg/platform/platformCompose";
import type { FileMap } from "@pg/projectTypes";
import {
  friendlyInviteError,
  friendlySamDownloadError,
} from "./goFriendlyError";
import {
  goLoadProgressFromFiles,
  type GoLoadProgress,
} from "./goLoadProgress";
import { resolveGoSamFiles } from "./goSamResolve";
import {
  applyRosterAnswer,
  createRosterOffer,
  isAvatarRelayMessage,
  isPresenceMessage,
  type RosterPeerSession,
  type RosterPresenceMsg,
} from "@pg/roster/rosterPeer";
import {
  broadcastSessionChat,
  isSessionChatMessage,
  sessionChatPhaseFromEvent,
} from "@pg/roster/rosterSessionChat";
import { isSessionChatCtlMessage } from "@pg/roster/rosterSessionChatCtl";
import { goSessionChat } from "./goSessionChat.svelte";
import { goRoomFiles } from "./goRoomFiles.svelte";
import { goRoomMedia } from "./goRoomMedia.svelte";
import {
  GO_ROOM_CONNECT_FAILED,
  GO_ROOM_CONNECTING_TITLE,
  GO_ROOM_KICKED,
  GO_ROOM_MESH_ENABLED,
  GO_ROOM_QUICK_REPLIES,
  roomGuestNameFallback,
  roomOccupancyFromSnapshot,
  roomOccupantCount,
} from "./goRoom";
import { chromeSession } from "./chromeSession.svelte";
import { isSessionFileControl } from "@pg/roster/rosterSessionFile";
import { isSessionMeshMessage } from "@pg/roster/rosterSessionMesh";
import { isSessionCastMessage } from "@pg/roster/rosterSessionCast";
import { isSessionOccupancyMessage } from "@pg/roster/rosterSessionOccupancy";
import { isSessionBoothMessage } from "@pg/roster/rosterSessionBooth";
import {
  isSessionCameraMessage,
  isSessionMicMessage,
} from "@pg/roster/rosterSessionCamera";
import { isSessionPlayMessage } from "@pg/roster/rosterSessionPlay";
import { createRoomMeshClient } from "./goRoomMeshClient";
import {
  createRoomSessionPlay,
  roomGuestShellMessageFromSessionEvent,
  type RoomSessionPlayController,
  type RoomSessionPlayState,
} from "./goRoomSessionPlay";
import { loadRoomPlaySam } from "./goRoomPlayBootstrap";
import { mountGoCanvas, type MountedGoCanvas } from "./mountGoCanvas";
import { hostableProtocolFor, getGoCatalogEntry } from "./goCatalog";
import {
  SESSION_INVITE_ACCEPT_KIND,
  SESSION_INVITE_REJECT_KIND,
  isSessionActResultPayload,
  isSessionEventRelayPayload,
  isSessionInviteCancelPayload,
  isSessionInvitePayload,
  isSessionSeatBoundPayload,
  type SessionActPayload,
  type SessionInvitePayload,
} from "@pg/roster/rosterSessionBridge";
import {
  applySessionActResultFromRelay,
  bindingFromSeatBound,
  createRosterSessionTunnelBridge,
  publishRosterRelayedSessionEvent,
} from "@pg/roster/rosterHomeSessionTunnel";
import { registerSessionBridge } from "@pg/sessionBridge";
import {
  canvasEntryUrl,
  installGoCanvasApiListener,
  syncGoCanvasSnapshot,
} from "./goCanvas";
import { withGoPgSurfaceQuery } from "./goPgSurface";
import { isGoCanvasSwUsable } from "./goCanvasSupport";
import {
  buildGoMemoryCanvas,
  installGoMemoryApiListener,
  publishGoMemoryBroadcast,
  revokeGoMemoryBlobs,
} from "./goMemoryCanvas";
import { platformApiOrigin } from "./platformClient";

export type GuestPhase =
  | "idle"
  | "resolving"
  | "consent"
  | "loading_sam"
  | "connecting"
  | "waiting_invite"
  | "seating"
  | "ready"
  | "ended"
  | "left"
  | "cancelled"
  | "error";

export type GuestCanvasMode = "sw" | "memory";

export type GuestStatus = {
  phase: GuestPhase;
  message: string;
  error: string | null;
  meta: InviteMeta | null;
  shortId: string | null;
  /** SW virtual-origin canvas URL (when canvasMode === "sw"). */
  canvasUrl: string | null;
  /** srcdoc for WebView fallback (when canvasMode === "memory"). */
  canvasSrcdoc: string | null;
  canvasMode: GuestCanvasMode | null;
  /** Remount key for memory iframe. */
  canvasGeneration: number;
  displayName: string;
  /** File download progress while `phase === "loading_sam"`. */
  loadProgress: GoLoadProgress | null;
  /** `room` skips SAM／canvas until play; `sam` is the game invite path. */
  surface: "sam" | "room" | null;
  /** Room surface: guests in the booth including self (Host not counted). */
  guestCount: number;
  occupantPeers: { peerId: string; name: string }[];
  /** Guest↔Guest mesh peers with an open DataChannel (file direct path). */
  directPeerIds: string[];
  /** Booth play canvas in TV slot. */
  playCatalogId: string | null;
  playCanvasUrl: string | null;
  playCanvasSrcdoc: string | null;
  playCanvasMode: GuestCanvasMode | null;
  playCanvasGeneration: number;
};

type Listener = (s: GuestStatus) => void;

function newAgentId(): string {
  return `go-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function resolveShortSecret(shortId: string): Promise<string> {
  const origin = platformApiOrigin();
  const res = await fetch(
    `${origin}/v1/shorts/${encodeURIComponent(shortId)}`
  );
  const data = (await res.json().catch(() => ({}))) as {
    secret?: string;
    error?: string;
  };
  if (!res.ok) {
    if (res.status === 410) throw new Error("邀請已關閉或過期");
    if (res.status === 404) throw new Error("邀請不存在");
    // Never surface API status／English codes — friendlyInviteError maps the rest.
    throw new Error("無法解析邀請短碼");
  }
  if (!data.secret?.trim()) throw new Error("邀請短碼無效");
  return data.secret.trim();
}

export function createGuestRuntime() {
  let status: GuestStatus = {
    phase: "idle",
    message: "",
    error: null,
    meta: null,
    shortId: null,
    canvasUrl: null,
    canvasSrcdoc: null,
    canvasMode: null,
    canvasGeneration: 0,
    displayName: "對手",
    loadProgress: null,
    surface: null,
    guestCount: 0,
    occupantPeers: [],
    directPeerIds: [],
    playCatalogId: null,
    playCanvasUrl: null,
    playCanvasSrcdoc: null,
    playCanvasMode: null,
    playCanvasGeneration: 0,
  };
  const listeners = new Set<Listener>();
  let localAgentId = newAgentId();
  let sandboxId: string | null = null;
  let generation = 1;
  let samFiles: FileMap | null = null;
  let canvasMode: GuestCanvasMode | null = null;
  let memoryBlobUrls: string[] = [];
  let peerSession: RosterPeerSession | null = null;
  let meshClient: ReturnType<typeof createRoomMeshClient> | null = null;
  let peerAgentId: string | null = null;
  let sessionPlay: RoomSessionPlayController | null = null;
  let playCanvas: MountedGoCanvas | null = null;
  let playBootstrapSeq = 0;
  let composeProtocolId: string | null = null;
  let pendingInvite: SessionInvitePayload | null = null;
  let accepted = false;
  let unlistenApi: (() => void) | null = null;
  let homeSandboxByInvite = new Map<string, string>();
  let tunnelChannelBySession = new Map<string, string>();
  /** Seat id for the active booth play tunnel (cleared on end play). */
  let activePlaySeatId: string | null = null;
  let leavingSelf = false;

  function clearMemoryBlobs() {
    if (!memoryBlobUrls?.length) return;
    revokeGoMemoryBlobs(memoryBlobUrls);
    memoryBlobUrls = [];
  }

  function buildMemorySrcdoc(): string {
    if (!samFiles) throw new Error("小品尚未載入");
    clearMemoryBlobs();
    const surface = status.surface === "room" ? "room" : "solo";
    const built = buildGoMemoryCanvas(samFiles, generation, undefined, surface);
    memoryBlobUrls = Array.isArray(built.blobUrls) ? built.blobUrls : [];
    return built.srcdoc;
  }

  /**
   * Remount canvas after seat_bound so SAM re-probes `/api/session/seat`
   * (gomoku tryBootAsPlayer is one-shot at boot).
   * Booth TV binds `playCanvas*` — keep those in sync with `canvas*`.
   */
  async function remountCanvasAfterSeat(): Promise<
    Partial<GuestStatus> | null
  > {
    if (!sandboxId || !samFiles || !canvasMode) return null;
    generation += 1;
    const roomSurface = status.surface === "room";
    if (canvasMode === "memory") {
      const srcdoc = buildMemorySrcdoc();
      const partial: Partial<GuestStatus> = {
        canvasMode: "memory",
        canvasSrcdoc: srcdoc,
        canvasUrl: null,
        canvasGeneration: generation,
      };
      if (roomSurface) {
        partial.playCanvasMode = "memory";
        partial.playCanvasSrcdoc = srcdoc;
        partial.playCanvasUrl = null;
        partial.playCanvasGeneration = generation;
      }
      return partial;
    }
    await syncGoCanvasSnapshot(sandboxId, generation, samFiles);
    const url = withGoPgSurfaceQuery(
      canvasEntryUrl(sandboxId, generation),
      roomSurface ? "room" : "solo"
    );
    const partial: Partial<GuestStatus> = {
      canvasMode: "sw",
      canvasUrl: url,
      canvasSrcdoc: null,
      canvasGeneration: generation,
    };
    if (roomSurface) {
      partial.playCanvasMode = "sw";
      partial.playCanvasUrl = url;
      partial.playCanvasSrcdoc = null;
      partial.playCanvasGeneration = generation;
    }
    return partial;
  }

  function emit() {
    for (const l of listeners) l({ ...status });
  }

  function set(partial: Partial<GuestStatus>) {
    status = { ...status, ...partial };
    emit();
  }

  function markHostEnded(message: string): void {
    if (
      status.phase === "ended" ||
      status.phase === "left" ||
      status.phase === "cancelled" ||
      status.phase === "idle"
    ) {
      return;
    }
    pendingInvite = null;
    composeProtocolId = null;
    accepted = false;
    clearGuestPlayCanvas();
    sessionPlay?.reset();
    goSessionChat.detach();
    goRoomFiles.detach();
    goRoomMedia.detach();
    try {
      meshClient?.dispose();
    } catch {
      /* ignore */
    }
    meshClient = null;
    try {
      peerSession?.close();
    } catch {
      /* ignore */
    }
    peerSession = null;
    unlistenApi?.();
    unlistenApi = null;
    clearMemoryBlobs();
    set({
      phase: "ended",
      error: message,
      message: "",
      canvasUrl: null,
      canvasSrcdoc: null,
      canvasMode: null,
      playCatalogId: null,
      playCanvasUrl: null,
      playCanvasSrcdoc: null,
      playCanvasMode: null,
      playCanvasGeneration: 0,
      canvasGeneration: 0,
      loadProgress: null,
      surface: null,
      directPeerIds: [],
    });
  }

  function failRoomConnect(): void {
    if (
      status.phase === "ended" ||
      status.phase === "left" ||
      status.phase === "cancelled" ||
      status.phase === "ready" ||
      status.phase === "error"
    ) {
      return;
    }
    goSessionChat.detach();
    goRoomFiles.detach();
    goRoomMedia.detach();
    try {
      meshClient?.dispose();
    } catch {
      /* ignore */
    }
    meshClient = null;
    try {
      peerSession?.close();
    } catch {
      /* ignore */
    }
    peerSession = null;
    set({
      phase: "error",
      error: GO_ROOM_CONNECT_FAILED,
      message: "",
      surface: "room",
      directPeerIds: [],
    });
  }

  function sendAvatarRelay(
    payload: Record<string, unknown>,
    to?: string
  ): void {
    if (!peerSession) return;
    const msg = {
      type: "avatar_relay",
      from: localAgentId,
      ...(to ? { to } : {}),
      payload,
    };
    try {
      peerSession.send(msg);
    } catch {
      /* channel may be closed */
    }
  }

  function tryAutoAccept(fromPeerId?: string): void {
    if (!composeProtocolId || !pendingInvite || accepted) return;
    if (pendingInvite.protocol.protocolId !== composeProtocolId) return;
    const peer = fromPeerId || peerAgentId;
    if (!peer || !sandboxId) return;
    if (status.surface === "room" && sessionPlay) {
      const role = sessionPlay.seatRoleFor(localAgentId);
      if (!role) return; // spectator
    }
    accepted = true;
    composeProtocolId = null;
    void acceptInvite(peer);
  }

  function clearGuestPlayCanvas(): void {
    playCanvas?.dispose();
    playCanvas = null;
    playBootstrapSeq += 1;
    if (status.surface === "room") {
      sandboxId = null;
      samFiles = null;
      canvasMode = null;
      set({
        playCatalogId: null,
        playCanvasUrl: null,
        playCanvasSrcdoc: null,
        playCanvasMode: null,
        playCanvasGeneration: 0,
        canvasUrl: null,
        canvasSrcdoc: null,
        canvasMode: null,
      });
    }
  }

  /**
   * End booth play only — keep PeerConnection／chat／files.
   * Used when host ends the SAM session (cancel／session.closed／session_play.end).
   */
  function endRoomPlayOnly(): void {
    if (status.surface !== "room") return;
    pendingInvite = null;
    composeProtocolId = null;
    accepted = false;
    if (activePlaySeatId) {
      registerSessionBridge(activePlaySeatId, "", null);
      activePlaySeatId = null;
    }
    homeSandboxByInvite.clear();
    tunnelChannelBySession.clear();
    clearGuestPlayCanvas();
    sessionPlay?.reset();
    set({
      phase: "ready",
      message: "這一局已結束",
      error: null,
    });
  }

  async function bootstrapGuestPlay(catalogId: string): Promise<void> {
    const seq = ++playBootstrapSeq;
    const seatedRole = sessionPlay?.seatRoleFor(localAgentId) ?? null;
    try {
      const bundle = await loadRoomPlaySam({ catalogId });
      if (seq !== playBootstrapSeq) return;
      const entry = getGoCatalogEntry(catalogId);
      const protocol = hostableProtocolFor(entry ?? null);
      if (protocol) composeProtocolId = protocol.protocolId;
      samFiles = bundle.files;
      generation += 1;
      playCanvas?.dispose();
      playCanvas = await mountGoCanvas(bundle.files, generation, {
        catalogId,
        surface: "room",
      });
      if (seq !== playBootstrapSeq) {
        clearGuestPlayCanvas();
        return;
      }
      sandboxId = playCanvas.sandboxId;
      canvasMode = playCanvas.canvasMode;
      accepted = false;
      set({
        playCatalogId: catalogId,
        playCanvasUrl: playCanvas.canvasUrl,
        playCanvasSrcdoc: playCanvas.canvasSrcdoc,
        playCanvasMode: playCanvas.canvasMode,
        playCanvasGeneration: playCanvas.canvasGeneration,
        canvasUrl: playCanvas.canvasUrl,
        canvasSrcdoc: playCanvas.canvasSrcdoc,
        canvasMode: playCanvas.canvasMode,
        canvasGeneration: playCanvas.canvasGeneration,
        message: seatedRole
          ? "遊戲載入中，等待入座…"
          : "觀戰載入中…",
      });
      sessionPlay?.markActive();
      if (seatedRole && pendingInvite) tryAutoAccept();
    } catch (e) {
      if (seq !== playBootstrapSeq) return;
      clearGuestPlayCanvas();
      set({
        error: friendlySamDownloadError(e),
        message: "",
      });
    }
  }

  async function acceptInvite(peerId: string): Promise<void> {
    const invite = pendingInvite;
    if (!invite || !sandboxId) return;
    set({ phase: "seating", message: "正在入座…", error: null });
    try {
      sendAvatarRelay(
        {
          kind: SESSION_INVITE_ACCEPT_KIND,
          inviteId: invite.inviteId,
          sessionId: invite.sessionId,
          role: invite.role || "player",
          homeSandboxId: sandboxId,
        },
        peerId
      );
      homeSandboxByInvite.set(invite.inviteId, sandboxId);
      pendingInvite = null;
      set({ phase: "seating", message: "已接受入座，等待座位確認…" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      sendAvatarRelay(
        {
          kind: SESSION_INVITE_REJECT_KIND,
          inviteId: invite.inviteId,
          sessionId: invite.sessionId,
          reason: message.slice(0, 200),
        },
        peerId
      );
      pendingInvite = null;
      set({
        phase: "error",
        error: friendlyInviteError(e, "入座失敗"),
        message: "",
      });
    }
  }

  function onRelay(raw: unknown): void {
    if (!isAvatarRelayMessage(raw)) return;
    const msg = raw;
    if (msg.from === localAgentId) return;
    const payload = msg.payload;
    if (isSessionInviteCancelPayload(payload)) {
      if (status.surface === "room") {
        endRoomPlayOnly();
        return;
      }
      markHostEnded("主持已結束這一場");
      return;
    }
    if (isSessionInvitePayload(payload)) {
      pendingInvite = payload;
      if (!peerAgentId) peerAgentId = msg.from;
      set({
        message: `收到入座邀請（${payload.protocol.protocolId}）`,
      });
      tryAutoAccept(msg.from);
      return;
    }
    if (isSessionSeatBoundPayload(payload)) {
      const homeId = homeSandboxByInvite.get(payload.inviteId);
      if (!homeId) {
        set({ message: "收到座位確認，但本機沙盒遺失" });
        return;
      }
      const binding = bindingFromSeatBound(payload, homeId, msg.from);
      const bridge = createRosterSessionTunnelBridge({
        binding,
        send: (act: SessionActPayload, to?: string) =>
          sendAvatarRelay(act as unknown as Record<string, unknown>, to),
      });
      if (activePlaySeatId && activePlaySeatId !== binding.seatId) {
        registerSessionBridge(activePlaySeatId, "", null);
      }
      activePlaySeatId = binding.seatId;
      registerSessionBridge(binding.seatId, homeId, bridge);
      tunnelChannelBySession.set(binding.sessionId, binding.channelName);
      set({
        phase: "seating",
        message: "已入座 — 正在進入對玩…",
        error: null,
      });
      void remountCanvasAfterSeat()
        .then(partial => {
          set({
            phase: "ready",
            message: "已入座 — 等待主持開始",
            error: null,
            ...(partial || {}),
          });
          goSessionChat.setUiPhase("ready");
        })
        .catch(e => {
          set({
            phase: "error",
            error: friendlyInviteError(e, "入座後畫面打不開"),
            message: "",
          });
        });
      return;
    }
    if (isSessionActResultPayload(payload)) {
      applySessionActResultFromRelay(payload);
      return;
    }
    if (isSessionEventRelayPayload(payload)) {
      const channel = tunnelChannelBySession.get(payload.sessionId);
      if (channel) {
        publishRosterRelayedSessionEvent(channel, payload);
        publishGoMemoryBroadcast(channel, {
          type: "session-event",
          sessionId: payload.sessionId,
          seq: payload.seq,
          event: payload.event,
        });
      }
      const phaseFromEv = sessionChatPhaseFromEvent(payload.event);
      if (phaseFromEv) goSessionChat.setUiPhase(phaseFromEv);
      if (status.surface === "room") {
        const shellMsg = roomGuestShellMessageFromSessionEvent(payload.event);
        if (shellMsg !== undefined) set({ message: shellMsg });
      }
      const event =
        payload.event && typeof payload.event === "object"
          ? (payload.event as { type?: unknown; reason?: unknown })
          : null;
      if (
        event &&
        (event.type === "session.closed" || event.type === "match.closed")
      ) {
        if (status.surface === "room") {
          endRoomPlayOnly();
          return;
        }
        markHostEnded(
          event.reason === "host_closed"
            ? "主持已結束這一場"
            : event.reason === "opponent_left"
              ? "對手已離開，這一場結束"
              : "這一場已結束"
        );
      }
    }
  }

  async function bootFromShortId(shortId: string): Promise<void> {
    leavingSelf = false;
    set({
      phase: "resolving",
      shortId,
      message: "正在讀取邀請…",
      error: null,
      meta: null,
      canvasUrl: null,
      canvasSrcdoc: null,
      canvasMode: null,
      canvasGeneration: 0,
    });
    try {
      const secret = await resolveShortSecret(shortId);
      const meta = await previewInvite(secret, platformApiOrigin());

      if (meta.revoked || !meta.open) {
        set({
          phase: "error",
          error: meta.revoked ? "邀請已撤銷" : "邀請已關閉或過期",
          message: "",
        });
        return;
      }
      const roomInvite = isRoomInvite(meta.kind, meta.intent);
      let displayName = status.displayName;
      try {
        const n = localStorage.getItem("playgrounds-roster-display-name");
        if (n?.trim()) displayName = n.trim();
        else displayName = roomGuestNameFallback(roomInvite);
      } catch {
        displayName = roomGuestNameFallback(roomInvite);
      }
      set({
        phase: "consent",
        meta,
        message: "請確認加入",
        displayName,
      });
    } catch (e) {
      set({
        phase: "error",
        error: friendlyInviteError(e),
        message: "",
      });
    }
  }

  function sendRoomBinary(buf: ArrayBuffer): void {
    const ch = peerSession?.getChannel();
    if (!ch || ch.readyState !== "open") return;
    ch.send(buf);
  }

  async function connectRoom(name: string, meta: InviteMeta): Promise<void> {
    set({
      phase: "connecting",
      message: GO_ROOM_CONNECTING_TITLE,
      surface: "room",
      canvasUrl: null,
      canvasSrcdoc: null,
      canvasMode: null,
    });
    try {
      localAgentId = newAgentId();
      peerAgentId = null;
      sessionPlay = createRoomSessionPlay({
        localPeerId: () => localAgentId,
        hostPeerId: () => peerAgentId || "",
        isBoothHost: () => false,
      });
      const join = await createJoin(meta.secret, platformApiOrigin());
      const slot: { s: RosterPeerSession | null; attached: boolean } = {
        s: null,
        attached: false,
      };
      meshClient?.dispose();
      meshClient = GO_ROOM_MESH_ENABLED
        ? createRoomMeshClient({
            localAgentId,
            localName: name,
            sendToHost: (msg) => {
              try {
                slot.s?.send(msg);
              } catch {
                /* ignore */
              }
            },
            onBinary: (_peerId, buf) => goRoomFiles.onBinary(buf),
            onRosterChange: () => {
              publishMeshLinks();
              void goRoomMedia.refresh();
            },
            onDirectOpen: (_peerId, session) => {
              session.pc.addEventListener("track", (ev) => {
                goRoomMedia.onRemoteTrack(ev, session.pc);
              });
              publishMeshLinks();
              void goRoomMedia.refresh();
            },
            onDirectClose: () => {
              publishMeshLinks();
              void goRoomMedia.refresh();
            },
          })
        : null;

      function publishMeshLinks(): void {
        set({
          guestCount: 1 + (meshClient?.knownPeerIds().length ?? 0),
          directPeerIds: meshClient?.directPeerIds() ?? [],
        });
      }

      const attachRoomChannels = () => {
        const sess = slot.s;
        if (!sess || slot.attached) return;
        slot.attached = true;
        goSessionChat.attach({
          localAgentId,
          localName: status.displayName,
          localRole: "guest",
          layout: "page",
          peers: [sess],
          broadcast: (msg) => broadcastSessionChat([sess], msg),
        });
        goSessionChat.setHints({
          freeText: true,
          quickReplies: [...GO_ROOM_QUICK_REPLIES],
        });
        goSessionChat.setUiPhase("active");
        goRoomFiles.attach({
          localAgentId,
          localName: name,
          sendJson: (msg) => {
            try {
              sess.send(msg);
            } catch {
              /* ignore */
            }
          },
          sendBinary: (buf, destPeerId) => {
            if (
              GO_ROOM_MESH_ENABLED &&
              destPeerId &&
              meshClient?.sendBinary(destPeerId, buf)
            ) {
              return;
            }
            sendRoomBinary(buf);
          },
          bufferedAmount: (destPeerId) => {
            if (
              GO_ROOM_MESH_ENABLED &&
              destPeerId &&
              meshClient?.hasDirect(destPeerId)
            ) {
              return meshClient.bufferedAmount(destPeerId);
            }
            return peerSession?.getChannel()?.bufferedAmount ?? 0;
          },
        });
        goRoomMedia.attach({
          localAgentId,
          occupantCount: () => roomOccupantCount(status.guestCount),
          peers: () => {
            const out: {
              peerId: string;
              pc: RTCPeerConnection;
              via: "entrance" | "mesh";
            }[] = [];
            if (sess.pc) {
              out.push({
                peerId: peerAgentId || "host",
                pc: sess.pc,
                via: "entrance",
              });
            }
            // Mesh is DataChannel-only for file bytes — never feed mesh PCs
            // into goRoomMedia (program／presence RTP stays on the Host star).
            return out;
          },
          sendJson: (msg) => {
            try {
              sess.send(msg);
            } catch {
              /* ignore */
            }
          },
          resolveLocalFile: (id) => goRoomFiles.localFile(id),
          ownerOf: (id) => goRoomFiles.listingOwner(id),
          fileMeta: (id) => goRoomFiles.listingMeta(id),
        });
        sess.pc.addEventListener("track", (ev) => {
          goRoomMedia.onRemoteTrack(ev, sess.pc);
        });
        void goRoomMedia.refresh();
        set({
          phase: "ready",
          surface: "room",
          message: "",
          error: null,
          guestCount: 1 + (meshClient?.knownPeerIds().length ?? 0),
          directPeerIds: meshClient?.directPeerIds() ?? [],
        });
      };

      const result = await createRosterOffer({
        transport: "signal",
        media: "ready",
        localPresence: {
          agentId: localAgentId,
          name,
        },
        handlers: {
          onMessage: (data: unknown) => {
            if (isPresenceMessage(data)) {
              peerAgentId = data.agentId;
              if (status.occupantPeers.length === 0) {
                set({
                  occupantPeers: [
                    {
                      peerId: data.agentId,
                      name: data.name?.trim() || "主持",
                    },
                  ],
                });
              }
            } else if (isSessionOccupancyMessage(data)) {
              const view = roomOccupancyFromSnapshot({
                localPeerId: localAgentId,
                occupants: data.occupants,
              });
              set({
                occupantPeers: view.occupantPeers,
                guestCount: view.guestCount,
              });
              void goRoomMedia.refresh();
            } else if (isSessionChatMessage(data)) {
              goSessionChat.onIncoming(data);
            } else if (isSessionChatCtlMessage(data)) {
              goSessionChat.onIncoming(data);
            } else if (isSessionFileControl(data)) {
              goRoomFiles.onControl(data);
            } else if (GO_ROOM_MESH_ENABLED && isSessionMeshMessage(data)) {
              void meshClient?.onHostMessage(data);
            } else if (isSessionBoothMessage(data)) {
              if (data.op === "kick" && data.to === localAgentId) {
                markHostEnded(GO_ROOM_KICKED);
                return;
              }
              void goRoomMedia.onCastControl(data);
            } else if (
              isSessionCastMessage(data) ||
              isSessionCameraMessage(data) ||
              isSessionMicMessage(data)
            ) {
              void goRoomMedia.onCastControl(data);
            } else if (isSessionPlayMessage(data)) {
              const applied = sessionPlay?.applyRemote(data);
              if (applied?.ok && data.op === "offer") {
                set({ playCatalogId: data.catalogId });
                void bootstrapGuestPlay(data.catalogId);
              } else if (data.op === "end") {
                endRoomPlayOnly();
              }
            } else if (isAvatarRelayMessage(data)) {
              onRelay(data);
            }
          },
          onBinary: (buf) => goRoomFiles.onBinary(buf),
          onChannelOpen: () => attachRoomChannels(),
          onChannelClose: () => {
            if (leavingSelf) return;
            goSessionChat.detach();
            goRoomFiles.detach();
            if (status.phase === "ready") {
              markHostEnded("主持已關掉這一間");
              return;
            }
            failRoomConnect();
          },
          onConnectionState: (state: RTCPeerConnectionState) => {
            if (leavingSelf) return;
            if (state !== "failed" && state !== "closed") return;
            if (status.phase === "ready") {
              markHostEnded("主持已關掉這一間");
              return;
            }
            failRoomConnect();
          },
          onError: (err: Error) => {
            set({
              phase: "error",
              error: friendlyInviteError(err, "連線失敗"),
              message: "",
            });
          },
        },
      });
      slot.s = result.session;
      peerSession = result.session;
      if (result.session.getChannel()?.readyState === "open") {
        attachRoomChannels();
      }

      const answered = await postOfferAndWaitAnswer({
        inviteId: meta.inviteId,
        joinCap: join.join_cap,
        offerWire: result.wire,
        origin: platformApiOrigin(),
      });
      await applyRosterAnswer(result.session, answered.answer);
      if (status.phase === "connecting") {
        set({
          phase: "connecting",
          surface: "room",
          message: "握手完成，等待通道開啟…",
        });
      }
    } catch (e) {
      if (
        status.phase === "ended" ||
        status.phase === "left" ||
        status.phase === "error"
      ) {
        return;
      }
      set({
        phase: "error",
        error: friendlyInviteError(e, "連線失敗"),
        message: "",
      });
    }
  }

  async function consentAndPlay(displayName: string): Promise<void> {
    const meta = status.meta;
    if (!meta) {
      set({ phase: "error", error: "沒有邀請資料", message: "" });
      return;
    }
    const name =
      displayName.trim() ||
      roomGuestNameFallback(isRoomInvite(meta.kind, meta.intent));
    try {
      localStorage.setItem("playgrounds-roster-display-name", name);
    } catch {
      /* ignore */
    }
    set({ displayName: name, error: null });

    if (isRoomInvite(meta.kind, meta.intent)) {
      await connectRoom(name, meta);
      return;
    }

    const source = composeSamSource(meta.intent);
    if (!source) {
      set({ phase: "error", error: "邀請未指定小品來源", message: "" });
      return;
    }

    const proto = composeSessionProtocol(meta.intent);
    composeProtocolId =
      proto &&
      typeof proto === "object" &&
      typeof (proto as { protocolId?: string }).protocolId === "string"
        ? (proto as { protocolId: string }).protocolId.trim()
        : null;

    set({
      phase: "loading_sam",
      message: "正在檢查小品版本…",
      loadProgress: { ratio: null, detail: "檢查遊戲版本…" },
      surface: "sam",
    });
    try {
      // Invite：入座前檢查 tip；沒包或 tipRev 過期才全量下載。
      const resolved = await resolveGoSamFiles({
        source,
        updatePolicy: "check-tip",
        onProgress: p => {
          const loadProgress = goLoadProgressFromFiles(p);
          set({
            loadProgress,
            message: `正在下載小品… ${loadProgress.detail}`,
          });
        },
      });
      const files = resolved.files;
      set({
        loadProgress: {
          ratio: 1,
          detail:
            resolved.origin === "cache"
              ? "已下載"
              : resolved.origin === "stale-cache"
                ? "離線快取"
                : "下載完成",
        },
        message:
          resolved.origin === "cache" || resolved.origin === "stale-cache"
            ? "小品已就緒，正在準備…"
            : "小品已下載，正在準備…",
      });
      sandboxId = `go-guest-${crypto.randomUUID().slice(0, 8)}`;
      samFiles = files;
      generation += 1;
      unlistenApi?.();
      clearMemoryBlobs();

      const catalogId = resolved.catalogId;
      const apiCtx = {
        getSandboxId: () => sandboxId,
        getFiles: () => samFiles,
        getCatalogId: () => catalogId,
      };
      const preferSw = isGoCanvasSwUsable();
      if (preferSw) {
        try {
          unlistenApi = installGoCanvasApiListener(apiCtx);
          await syncGoCanvasSnapshot(sandboxId, generation, files);
          canvasMode = "sw";
        } catch {
          // LINE / broken SW stubs — fall through to memory srcdoc.
          unlistenApi?.();
          unlistenApi = null;
          canvasMode = null;
        }
      }
      if (!canvasMode) {
        unlistenApi = installGoMemoryApiListener(apiCtx);
        buildMemorySrcdoc(); // validate build; show only after ready
        canvasMode = "memory";
      }

      set({
        canvasUrl: null,
        canvasSrcdoc: null,
        canvasMode,
        canvasGeneration: generation,
        loadProgress: null,
        message:
          canvasMode === "memory"
            ? "小品已載入（相容模式），正在連線…"
            : "小品已載入，正在連線…",
      });
    } catch (e) {
      set({
        phase: "error",
        error: friendlySamDownloadError(e),
        message: "",
        loadProgress: null,
      });
      return;
    }

    if (!wantsRosterSignal(meta.kind, meta.intent)) {
      if (!sandboxId || !canvasMode) {
        set({ phase: "error", error: "沙盒未就緒", message: "" });
        return;
      }
      if (canvasMode === "memory") {
        const srcdoc = buildMemorySrcdoc();
        set({
          phase: "ready",
          canvasMode: "memory",
          canvasSrcdoc: srcdoc,
          canvasUrl: null,
          canvasGeneration: generation,
          message: "已開啟小品（此邀請不含連線）",
        });
      } else {
        const url = canvasEntryUrl(sandboxId, generation);
        set({
          phase: "ready",
          canvasMode: "sw",
          canvasUrl: url,
          canvasSrcdoc: null,
          canvasGeneration: generation,
          message: "已開啟小品（此邀請不含連線）",
        });
      }
      return;
    }

    set({ phase: "connecting", message: "正在與主持握手…" });
    try {
      localAgentId = newAgentId();
      const join = await createJoin(meta.secret, platformApiOrigin());
      const slot: { s: RosterPeerSession | null } = { s: null };
      const iceServers = composeWantsRelay(meta.intent)
        ? ((await fetchGuestTurnIceServers({
            inviteId: meta.inviteId,
            joinCap: join.join_cap,
            origin: platformApiOrigin(),
          })) ?? undefined)
        : undefined;

      const presence: RosterPresenceMsg = {
        type: "presence",
        agentId: localAgentId,
        name,
      };

      const result = await createRosterOffer({
        transport: "signal",
        localPresence: presence,
        iceServers,
        handlers: {
          onMessage: (data: unknown) => {
            if (isPresenceMessage(data)) {
              peerAgentId = data.agentId;
              tryAutoAccept(data.agentId);
            } else if (isAvatarRelayMessage(data)) {
              onRelay(data);
            } else if (isSessionChatMessage(data)) {
              const toast = goSessionChat.onIncoming(data);
              if (toast) chromeSession.setFlash(toast, 2800);
            }
          },
          onChannelOpen: () => {
            goSessionChat.attach({
              localAgentId,
              localName: status.displayName,
              localRole: "guest",
              peers: [],
              broadcast: (msg) => {
                if (!slot.s) return 0;
                return broadcastSessionChat([slot.s], msg);
              },
            });
            goSessionChat.setUiPhase("waiting");
            set({
              phase: "waiting_invite",
              message: "已連線，等待主持邀請入座…",
            });
          },
          onChannelClose: () => {
            goSessionChat.detach();
            markHostEnded("主持已結束連線");
          },
          onConnectionState: (state: RTCPeerConnectionState) => {
            if (
              state === "failed" ||
              state === "disconnected" ||
              state === "closed"
            ) {
              markHostEnded("主持已結束連線");
            }
          },
          onError: (err: Error) => {
            set({
              phase: "error",
              error: friendlyInviteError(err, "連線失敗"),
              message: "",
            });
          },
        },
      });
      slot.s = result.session;
      peerSession = result.session;

      const answered = await postOfferAndWaitAnswer({
        inviteId: meta.inviteId,
        joinCap: join.join_cap,
        offerWire: result.wire,
        origin: platformApiOrigin(),
      });
      await applyRosterAnswer(result.session, answered.answer);
      set({
        phase: "waiting_invite",
        message: "握手完成，等待主持邀請入座…",
      });
    } catch (e) {
      set({
        phase: "error",
        error: friendlyInviteError(e, "連線失敗"),
        message: "",
      });
    }
  }

  function decline(): void {
    goSessionChat.detach();
    goRoomFiles.detach();
    goRoomMedia.detach();
    try {
      meshClient?.dispose();
    } catch {
      /* ignore */
    }
    meshClient = null;
    peerSession?.close();
    peerSession = null;
    samFiles = null;
    canvasMode = null;
    unlistenApi?.();
    unlistenApi = null;
    clearMemoryBlobs();
    set({
      phase: "cancelled",
      message: "已取消",
      meta: null,
      canvasUrl: null,
      canvasSrcdoc: null,
      canvasMode: null,
      canvasGeneration: 0,
      loadProgress: null,
      surface: null,
      directPeerIds: [],
    });
  }

  function leaveRoom(): void {
    if (
      status.phase === "left" ||
      status.phase === "ended" ||
      status.phase === "cancelled" ||
      status.phase === "idle"
    ) {
      return;
    }
    leavingSelf = true;
    sessionPlay?.reset();
    sessionPlay = null;
    clearGuestPlayCanvas();
    goSessionChat.detach();
    goRoomFiles.detach();
    goRoomMedia.detach();
    try {
      meshClient?.dispose();
    } catch {
      /* ignore */
    }
    meshClient = null;
    try {
      peerSession?.close();
    } catch {
      /* ignore */
    }
    peerSession = null;
    peerAgentId = null;
    unlistenApi?.();
    unlistenApi = null;
    set({
      phase: "left",
      message: "已離開這一間",
      error: null,
      canvasUrl: null,
      canvasSrcdoc: null,
      canvasMode: null,
      canvasGeneration: 0,
      loadProgress: null,
      surface: "room",
      directPeerIds: [],
      playCatalogId: null,
      playCanvasUrl: null,
      playCanvasSrcdoc: null,
      playCanvasMode: null,
      playCanvasGeneration: 0,
    });
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener({ ...status });
    return () => listeners.delete(listener);
  }

  function getStatus(): GuestStatus {
    return { ...status };
  }

  return {
    subscribe,
    getStatus,
    getPlayState(): RoomSessionPlayState {
      return (
        sessionPlay?.getState() ?? {
          phase: "idle",
          catalogId: null,
          rev: null,
          seats: [],
          fromHost: null,
        }
      );
    },
    bootFromShortId,
    consentAndPlay,
    decline,
    leaveRoom,
    setDisplayName(name: string) {
      set({ displayName: name });
      goSessionChat.setLocalName(name);
    },
    /** @internal Vitest only — drive relay／channel-close paths without WebRTC. */
    __testOnRelay(raw: unknown) {
      onRelay(raw);
    },
    __testMarkConnected() {
      set({
        phase: "waiting_invite",
        message: "已連線，等待主持邀請入座…",
        error: null,
      });
      tunnelChannelBySession.set("sess-1", "playgrounds-session:sess-1");
    },
    /** @internal Vitest — booth guest ready with play chrome on. */
    __testMarkRoomReady() {
      const noop = () => {};
      peerSession = {
        send: noop,
        close: noop,
        getChannel: () => null,
        pc: { addEventListener: noop },
      } as never;
      set({
        phase: "ready",
        surface: "room",
        message: "在包廂裡",
        error: null,
        playCatalogId: "pg-gomoku",
        playCanvasUrl: "https://example.test/play",
        playCanvasSrcdoc: null,
        playCanvasMode: "sw",
        playCanvasGeneration: 1,
      });
      sessionPlay = createRoomSessionPlay({
        localPeerId: () => localAgentId,
        hostPeerId: () => peerAgentId || "host-1",
        isBoothHost: () => false,
      });
    },
    __testOnChannelClose() {
      markHostEnded("主持已結束連線");
    },
    /** @internal Vitest — apply room session_play without WebRTC. */
    __testApplySessionPlay(raw: unknown) {
      return sessionPlay?.applyRemote(raw) ?? { ok: false, reason: "bad_message" as const };
    },
    __testSetRoomHostPeer(id: string) {
      peerAgentId = id;
      sessionPlay =
        sessionPlay ??
        createRoomSessionPlay({
          localPeerId: () => localAgentId,
          hostPeerId: () => peerAgentId || "",
          isBoothHost: () => false,
        });
    },
  };
}

export type GuestRuntime = ReturnType<typeof createGuestRuntime>;
