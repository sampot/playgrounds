/**
 * Pure-play 包廂 Host runtime (DEC-050 / PG-GO-ROOM-PLAN).
 * Enter `/room` → booth UI; invite is in-booth; multi-peer fanout (no 1:1 lock).
 */

import {
  isPresenceMessage,
  isAvatarRelayMessage,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import {
  broadcastSessionChat,
  isSessionChatMessage,
} from "@pg/roster/rosterSessionChat";
import {
  buildSessionChatCtlMessage,
  isSessionChatCtlMessage,
  sessionChatCtlAllowedFromGuest,
} from "@pg/roster/rosterSessionChatCtl";
import { isSessionFileControl } from "@pg/roster/rosterSessionFile";
import { isSessionMeshMessage } from "@pg/roster/rosterSessionMesh";
import { isSessionCastMessage } from "@pg/roster/rosterSessionCast";
import { buildSessionOccupancyMessage } from "@pg/roster/rosterSessionOccupancy";
import {
  buildSessionBoothMessage,
} from "@pg/roster/rosterSessionBooth";
import {
  isSessionCameraMessage,
  isSessionMicMessage,
} from "@pg/roster/rosterSessionCamera";
import { isSessionRecordMessage } from "@pg/roster/rosterSessionRecord";
import { isSessionPlayMessage } from "@pg/roster/rosterSessionPlay";
import type { SessionPlaySeat } from "@pg/roster/rosterSessionPlay";
import { createRoomMeshBroker } from "./goRoomMeshBroker";
import {
  buildInviteRoomIntent,
  INVITE_ROOM_KIND,
} from "@pg/platform/platformCompose";
import { goAuth } from "./goAuth.svelte";
import { chromeSession } from "./chromeSession.svelte";
import { goSessionChat } from "./goSessionChat.svelte";
import { goRoomFiles } from "./goRoomFiles.svelte";
import { goRoomPrivateFiles } from "./goRoomPrivateFiles.svelte";
import { goRoomMedia } from "./goRoomMedia.svelte";
import { isRoomPrivateFileId } from "./goRoomPrivateLibrary";
import { createRoomFileStarHub, type RoomFileStarHub } from "./goRoomFileStar";
import {
  createRoomSessionPlay,
  type RoomSessionPlayState,
} from "./goRoomSessionPlay";
import { assignRoomPlaySeats } from "./goRoomPlaySeats";
import {
  createRoomPlayHostRuntime,
  loadRoomPlaySam,
  mountRoomPlayHostCanvas,
  roomPlaySamCheckProgress,
} from "./goRoomPlayBootstrap";
import {
  getGoCatalogEntry,
  hostableProtocolFor,
} from "./goCatalog";
import type { GoLoadProgress } from "./goLoadProgress";
import type { HostRuntime } from "./hostRuntime";
import type { MountedGoCanvas } from "./mountGoCanvas";
import type { FileMap } from "@pg/projectTypes";
import { canvasEntryUrl, syncGoCanvasSnapshot } from "./goCanvas";
import { ensureRoomFileSw } from "./goRoomPlayBridge";
import { buildGoMemoryCanvas } from "./goMemoryCanvas";
import { withGoPgSurfaceQuery } from "./goPgSurface";
import {
  GO_ROOM_QUICK_REPLIES,
  GO_ROOM_MESH_ENABLED,
  roomHostDisplayName,
  playerDisplayName,
  roomOccupantSummary,
  roomTvBindStream,
  type RoomInviteDoor,
} from "./goRoom";
import {
  DEFAULT_INVITE_TTL_MS,
  isInviteUnexpired,
} from "./hostRuntime";
import {
  clearRoomInviteSession,
  readRoomInviteSession,
  writeRoomInviteSession,
  type RoomInviteSessionSnapshot,
} from "./goRoomInviteSession";
import { createBoothAnchorBridge } from "./boothAnchorBridge";
import {
  applyBoothCastStateToMedia,
  boothCastSummaryFromProgram,
} from "./boothCastState";
import { createRoomGuestJoinAcceptor, createRoomPeerJoinAcceptor } from "./roomBoothJoinHost";
import { registerEmbeddedPeerSignalHost } from "./booth/boothPeerSignal";
import {
  operatorDisplayNameForShell,
  operatorPeerIdForShell,
} from "./roomOperatorSlot";
import {
  createEmbeddedBoothHubEngine,
  type BoothHubEngine,
} from "./booth/boothHubEngine";
import { boothShellCanDirect } from "./booth/boothState";
import {
  createBoothShellClient,
  embeddedHostShellContext,
  type BoothShellClient,
} from "./booth/boothShellClient";
import { createBoothShareCatalogSync, type BoothShareCatalogSync } from "./booth/boothShareCatalogSync";
import { createHostShareLibrary } from "./goRoomShareLibrary";

export type RoomPhase = "idle" | "open" | "ended" | "error";

export type RoomStatus = {
  phase: RoomPhase;
  message: string;
  error: string | null;
  inviteId: string | null;
  shortUrl: string | null;
  inviteExpiresAt: number | null;
  inviteDoor: RoomInviteDoor;
  peerName: string | null;
  guestCount: number;
  occupantNames: string[];
  occupantPeers: { peerId: string; name: string }[];
  /** Host peer id for session_play seats（not the UI alias "local"）. */
  localPeerId: string;
  /** Booth play canvas (TV slot); null when idle. */
  playCatalogId: string | null;
  /** Tip-check／auto-update while mounting booth play SAM. */
  playLoadProgress: GoLoadProgress | null;
  playCanvasUrl: string | null;
  playCanvasSrcdoc: string | null;
  playCanvasMode: "sw" | "memory" | null;
  playCanvasGeneration: number;
  /** Active monitoring peer join link (director mint). */
  peerJoinUrl: string | null;
  peerCapId: string | null;
  peerCapExpiresAt: number | null;
};

type Listener = (s: RoomStatus) => void;

type PeerSlot = {
  peerId: string | null;
  session: RosterPeerSession | null;
  displayName: string | null;
  lost?: boolean;
  fileRouted?: boolean;
  kind: "guest" | "operator" | "peer";
  shellId?: string;
};

function sendBinary(session: RosterPeerSession | null, buf: ArrayBuffer): void {
  const ch = session?.getChannel();
  if (!ch || ch.readyState !== "open") return;
  ch.send(buf);
}

export function createRoomRuntime(opts?: {
  /** Defaults to `sessionStorage` in the browser; tests inject a memory store. */
  inviteSession?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}) {
  const inviteSession =
    opts && "inviteSession" in opts
      ? opts.inviteSession
      : typeof sessionStorage !== "undefined"
        ? sessionStorage
        : null;
  let mintInflight: Promise<{
    inviteId: string;
    shortUrl: string;
  } | null> | null = null;
  const localAgentId = `go-room-${crypto.randomUUID().slice(0, 8)}`;
  let status: RoomStatus = {
    phase: "idle",
    message: "",
    error: null,
    inviteId: null,
    shortUrl: null,
    inviteExpiresAt: null,
    inviteDoor: "none",
    peerName: null,
    guestCount: 0,
    occupantNames: [],
    occupantPeers: [],
    localPeerId: localAgentId,
    playCatalogId: null,
    playLoadProgress: null,
    playCanvasUrl: null,
    playCanvasSrcdoc: null,
    playCanvasMode: null,
    playCanvasGeneration: 0,
    peerJoinUrl: null,
    peerCapId: null,
    peerCapExpiresAt: null,
  };
  const listeners = new Set<Listener>();
  let inviteExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  let castClockPublishTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleCastSnapshot(): void {
    if (castClockPublishTimer) return;
    castClockPublishTimer = setTimeout(() => {
      castClockPublishTimer = null;
      anchorBridge.publishSnapshot();
    }, 400);
  }
  const slots: PeerSlot[] = [];
  const operatorSlots: PeerSlot[] = [];
  const peerSlots: PeerSlot[] = [];
  let disposePeerSignal: (() => void) | null = null;
  let surfaceAttached = false;
  let closing = false;
  let opening = false;
  let fileHub: RoomFileStarHub | null = null;
  let shareCatalogSync: BoothShareCatalogSync | null = null;
  let playHost: HostRuntime | null = null;
  let playCanvas: MountedGoCanvas | null = null;
  let playFiles: FileMap | null = null;
  let playGeneration = 0;
  let playBootstrapSeq = 0;
  let endingPlay = false;
  const meshBroker = createRoomMeshBroker({
    sendTo(peerId, msg) {
      const slot = slots.find(
        (s) => !s.lost && s.peerId === peerId && s.session
      );
      try {
        slot?.session?.send(msg);
      } catch {
        /* ignore */
      }
    },
  });
  const sessionPlay = createRoomSessionPlay({
    localPeerId: () => localAgentId,
    hostPeerId: () => localAgentId,
    isBoothHost: () => true,
  });

  const operatorHooks = {
    mintInvite: async (): Promise<void> => {
      throw new Error("room_runtime_not_ready");
    },
    revokeInvite: async (): Promise<void> => {
      throw new Error("room_runtime_not_ready");
    },
    castState: async (_payload: {
      paused?: boolean;
      t?: number;
    }): Promise<void> => {
      throw new Error("room_runtime_not_ready");
    },
    kickPeer: async (_peerId: string): Promise<void> => {
      throw new Error("room_runtime_not_ready");
    },
    endBooth: async (): Promise<void> => {
      throw new Error("room_runtime_not_ready");
    },
    stopTv: async (): Promise<void> => {
      throw new Error("room_runtime_not_ready");
    },
    castFile: async (
      _fileId: string,
      _scope?: "share" | "private"
    ): Promise<void> => {
      throw new Error("room_runtime_not_ready");
    },
    haltLive: async (
      _peerId: string,
      _layer: "audio" | "video"
    ): Promise<void> => {
      throw new Error("room_runtime_not_ready");
    },
    startAutoPlay: async (_catalogId: string) => {
      throw new Error("room_runtime_not_ready");
    },
    startManualPlay: async (
      _catalogId: string,
      _picks: { role: string; peerId: string }[]
    ) => {
      throw new Error("room_runtime_not_ready");
    },
    endPlay: async () => {
      throw new Error("room_runtime_not_ready");
    },
  };

  function prepareGuestJoinHandlers(): {
    handlers: RosterPeerHandlers;
    attachSession: (sess: RosterPeerSession) => void;
  } {
    const slot: PeerSlot = {
      peerId: null,
      session: null,
      displayName: null,
      kind: "guest",
    };
    slots.push(slot);
    return {
      handlers: handlers(slot),
      attachSession: (sess: RosterPeerSession) => {
        slot.session = sess;
        sess.pc.addEventListener("track", (ev) => {
          goRoomMedia.onRemoteTrack(ev, sess.pc);
          if (slot.peerId) void goRoomMedia.forwardFrom(slot.peerId);
        });
        refreshGuestSummary();
        if (sess.getChannel()?.readyState === "open") {
          set({
            phase: "open",
            error: null,
            message: occupancyMessage(),
          });
        }
      },
    };
  }

  function prepareOperatorSlot(shellId: string): {
    handlers: RosterPeerHandlers;
    attachSession: (sess: RosterPeerSession) => void;
  } {
    let slot = operatorSlots.find((s) => s.shellId === shellId);
    if (!slot) {
      slot = {
        peerId: operatorPeerIdForShell(shellId),
        session: null,
        displayName: operatorDisplayNameForShell(shellId),
        kind: "operator",
        shellId,
      };
      operatorSlots.push(slot);
    }
    return {
      handlers: operatorHandlers(slot),
      attachSession: (sess: RosterPeerSession) => {
        slot!.session = sess;
        slot!.peerId = slot!.peerId ?? operatorPeerIdForShell(shellId);
        sess.pc.addEventListener("track", (ev) => {
          goRoomMedia.onRemoteTrack(ev, sess.pc);
          if (slot!.peerId) void goRoomMedia.forwardFrom(slot!.peerId);
        });
        syncPlayHostPeer(slot!);
        refreshGuestSummary();
      },
    };
  }

  function preparePeerJoinHandlers(label?: string): {
    handlers: RosterPeerHandlers;
    attachSession: (sess: RosterPeerSession) => void;
    peerId: string;
  } {
    const suffix = label?.trim() || "peer";
    const peerId = `${localAgentId}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const slot: PeerSlot = {
      peerId,
      session: null,
      displayName: suffix,
      kind: "peer",
    };
    peerSlots.push(slot);
    return {
      handlers: handlers(slot),
      attachSession: (sess: RosterPeerSession) => {
        slot.session = sess;
        sess.pc.addEventListener("track", (ev) => {
          goRoomMedia.onRemoteTrack(ev, sess.pc);
          if (slot.peerId) void goRoomMedia.forwardFrom(slot.peerId);
        });
        refreshGuestSummary();
      },
      peerId,
    };
  }

  const acceptGuestJoinOffer = createRoomGuestJoinAcceptor({
    localAgentId,
    hostName,
    prepareHandlers: prepareGuestJoinHandlers,
  });

  const acceptPeerJoinOffer = createRoomPeerJoinAcceptor({
    localAgentId,
    hostName,
    prepareHandlers: preparePeerJoinHandlers,
  });

  function ensurePeerSignalHost(): void {
    if (disposePeerSignal) return;
    const engine = hubRef.engine ?? hubEngine;
    if (engine.mode !== "embedded") return;
    disposePeerSignal = registerEmbeddedPeerSignalHost({
      getHubSessionId: () => engine.sessionId,
      validatePeerCap: (cap) => engine.validatePeerCap(cap),
      acceptPeerOffer: acceptPeerJoinOffer,
    });
  }

  const hubRef: { engine: BoothHubEngine | null } = { engine: null };

  const anchorBridge = createBoothAnchorBridge({
    getStatus: () => status,
    getOwnerUserId: () => goAuth.profile?.user_id ?? null,
    getApiKey: () => goAuth.getPlatformApiKeyForHostLoop(),
    getHostPeerId: () => localAgentId,
    getCastSummary: () => {
      if (goRoomMedia.tvSourcePeerId) {
        const peer = status.occupantPeers.find(
          (p) => p.peerId === goRoomMedia.tvSourcePeerId
        );
        return {
          kind: "live" as const,
          peerId: goRoomMedia.tvSourcePeerId,
          label: peer?.name ?? goRoomMedia.remoteProgramName ?? undefined,
        };
      }
      const fileCast = boothCastSummaryFromProgram({
        programName: goRoomMedia.programName,
        remoteProgramName: goRoomMedia.remoteProgramName,
        programTransport: goRoomMedia.programTransport,
        programPaused: goRoomMedia.programPaused,
        programTime: goRoomMedia.programTime,
        programDuration: goRoomMedia.programDuration,
      });
      if (fileCast && fileCast.kind === "file") return fileCast;
      if (status.playCatalogId) {
        return { kind: "play" as const, catalogId: status.playCatalogId };
      }
      return { kind: "idle" as const };
    },
    getRemoteLives: () => goRoomMedia.remoteLives,
    onGuestJoinOffer: async (input) => acceptGuestJoinOffer(input.offerWire),
    onOperatorCastLive: async (peerId, label) => {
      const resolved =
        peerId === "local" ? localAgentId : peerId;
      const out = await goRoomMedia.putLiveOnTv(resolved, label);
      if (!out.ok) throw new Error(out.error);
      anchorBridge.refreshProgram();
    },
    onOperatorCastFile: async (fileId, scope) => {
      const out =
        scope === "private"
          ? await goRoomMedia.startPrivateProgram(fileId)
          : await goRoomMedia.startListedProgram(fileId);
      if (!out.ok) throw new Error(out.error);
    },
    onOperatorStopTv: async () => {
      await goRoomMedia.stopProgram();
    },
    onOperatorHaltLive: async (peerId, layer) => {
      const resolved =
        peerId === "local" ? localAgentId : peerId;
      const out = await goRoomMedia.haltLive(resolved, layer);
      if (!out.ok) throw new Error(out.error);
    },
    onOperatorStartRecord: async (peerId, displayName, label) => {
      const resolved = peerId === "local" ? localAgentId : peerId;
      const out = await goRoomMedia.startRecording(
        resolved,
        displayName?.trim() || "鏡頭",
        label
      );
      if (!out.ok) throw new Error(out.error);
    },
    onOperatorStopRecord: async (peerId) => {
      const resolved = peerId === "local" ? localAgentId : peerId;
      const out = await goRoomMedia.stopRecording(resolved);
      if (!out.ok) throw new Error(out.error);
    },
    onOperatorMintInvite: () => operatorHooks.mintInvite(),
    onOperatorRevokeInvite: () => operatorHooks.revokeInvite(),
    onOperatorCastState: (payload) => operatorHooks.castState(payload),
    onOperatorKickPeer: (peerId) => operatorHooks.kickPeer(peerId),
    onOperatorEndBooth: () => operatorHooks.endBooth(),
    onOperatorStartAutoPlay: (catalogId) => operatorHooks.startAutoPlay(catalogId),
    onOperatorStartManualPlay: (catalogId, picks) =>
      operatorHooks.startManualPlay(catalogId, picks),
    onOperatorEndPlay: () => operatorHooks.endPlay(),
    fanoutChat: (msg) => {
      broadcastSessionChat(liveSessions(), msg);
      goSessionChat.onIncoming(msg);
    },
    getTvProgramStream: () =>
      roomTvBindStream({
        programStream: goRoomMedia.programStream,
        localProgramStream: goRoomMedia.localProgramStream,
        programName: goRoomMedia.programName,
        remoteProgramName: goRoomMedia.remoteProgramName,
      }),
    getLocalPresence: () => ({
      agentId: localAgentId,
      name: hostName(),
    }),
    prepareOperatorRoster: (shellId) => prepareOperatorSlot(shellId).handlers,
    onOperatorSession: ({ shellId, session }) => {
      prepareOperatorSlot(shellId).attachSession(session);
    },
    dispatchHubIntent: (intent, shell) => {
      if (!hubRef.engine) {
        return Promise.resolve({ ok: false, error: "session_ended" });
      }
      return hubRef.engine.dispatch(intent, shell);
    },
    claimHubOperatorDirector: (shellId) =>
      hubRef.engine?.claimOperatorDirector(shellId) ?? {
        role: "viewer" as const,
      },
    hubOperatorCanDirect: (shellId) => {
      const engine = hubRef.engine;
      if (!engine) return false;
      return boothShellCanDirect({
        director: engine.getDirector(),
        shellId,
        role: "operator",
      });
    },
    onOperatorDisconnected: (shellId) => {
      hubRef.engine?.releaseOperatorDirector(shellId);
      anchorBridge.publishSnapshot();
    },
    syncHubDirectorFocus: (claims) => {
      if (claims) hubRef.engine?.reclaimDirectorForHostShell();
      anchorBridge.publishSnapshot();
    },
    getBoothSessionId: () => hubRef.engine?.sessionId ?? "",
    getDirector: () => hubRef.engine?.getDirector() ?? null,
  });

  function clearPlayCanvas(): void {
    playCanvas?.dispose();
    playCanvas = null;
    playFiles = null;
    playHost = null;
    set({
      playCatalogId: null,
      playLoadProgress: null,
      playCanvasUrl: null,
      playCanvasSrcdoc: null,
      playCanvasMode: null,
      playCanvasGeneration: 0,
    });
  }

  function fanoutPlay(msg: unknown): void {
    for (const sess of liveSessions()) {
      try {
        sess.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  function emit() {
    for (const l of listeners) l({ ...status });
  }
  function set(partial: Partial<RoomStatus>) {
    status = { ...status, ...partial };
    emit();
  }

  function liveSessions(): RosterPeerSession[] {
    const out: RosterPeerSession[] = [];
    for (const s of slots) {
      if (!s.lost && s.session) out.push(s.session);
    }
    for (const s of operatorSlots) {
      if (!s.lost && s.session) out.push(s.session);
    }
    for (const s of peerSlots) {
      if (!s.lost && s.session) out.push(s.session);
    }
    return out;
  }

  function liveGuestCount(): number {
    return slots.filter((s) => !s.lost && s.session).length;
  }

  function allPeerSlots(): PeerSlot[] {
    return [...slots, ...operatorSlots, ...peerSlots];
  }

  function otherSessions(except: PeerSlot): RosterPeerSession[] {
    return liveSessions().filter((s) => s !== except.session);
  }

  function refreshGuestSummary(): void {
    const liveGuests = slots.filter((s) => !s.lost && s.session);
    const liveOps = operatorSlots.filter((s) => !s.lost && s.session);
    const livePeers = peerSlots.filter((s) => !s.lost && s.session);
    const live = [...liveGuests, ...liveOps, ...livePeers];
    const names = live
      .map((s) => s.displayName?.trim())
      .filter((n): n is string => Boolean(n));
    const occupantPeers = live
      .filter((s) => Boolean(s.peerId))
      .map((s) => ({
        peerId: s.peerId as string,
        name: playerDisplayName(
          s.displayName,
          s.kind === "operator"
            ? "遠端"
            : s.kind === "peer"
              ? "監控"
              : "訪客"
        ),
        kind:
          s.kind === "operator"
            ? ("operator" as const)
            : s.kind === "peer"
              ? ("peer" as const)
              : ("guest" as const),
      }));
    set({
      guestCount: liveGuests.length,
      peerName: names[0] ?? null,
      occupantNames: names,
      occupantPeers,
      message: roomOccupantSummary({ guestCount: liveGuests.length }),
    });
    fanoutOccupancy();
    void goRoomMedia.refresh();
    anchorBridge.publishSnapshot();
  }

  function occupancyRows(): { peerId: string; name: string }[] {
    const host = hostName().slice(0, 64) || "主持";
    const guests = slots
      .filter((s) => !s.lost && s.session && s.peerId)
      .map((s) => ({
        peerId: s.peerId as string,
        name: playerDisplayName(s.displayName, "訪客").slice(0, 64),
      }));
    return [{ peerId: localAgentId, name: host }, ...guests];
  }

  function fanoutOccupancy(): void {
    const msg = buildSessionOccupancyMessage({ occupants: occupancyRows() });
    for (const sess of liveSessions()) {
      try {
        sess.send(msg);
      } catch {
        /* ignore */
      }
    }
  }

  function hostName(): string {
    return roomHostDisplayName(goAuth.profile);
  }

  function ensureLocalSurface(): void {
    if (surfaceAttached) return;
    surfaceAttached = true;
    goSessionChat.attach({
      localAgentId,
      localName: hostName(),
      localRole: "host",
      layout: "page",
      peers: [],
      broadcast: (msg) => broadcastSessionChat(liveSessions(), msg),
    });
    goSessionChat.setHints({
      freeText: true,
      quickReplies: [...GO_ROOM_QUICK_REPLIES],
    });
    goSessionChat.setUiPhase("active");
    fileHub = createRoomFileStarHub({
      localAgentId,
      listingOwner: (id) => goRoomFiles.listingOwner(id),
      catalogItems: () => goRoomFiles.catalogItems(),
      applyControl: (data) => goRoomFiles.onControl(data),
      applyBinary: (buf) => goRoomFiles.onBinary(buf),
      forgetOwner: (ownerId) => goRoomFiles.forgetOwner(ownerId),
    });
    const hub = fileHub;
    goRoomFiles.attach({
      localAgentId,
      localName: hostName(),
      sendJson: (msg) => hub.outboundControl(msg),
      sendBinary: (buf) => hub.outboundBinary(buf),
      bufferedAmount: (destPeerId) => hub.requesterBufferedAmount(destPeerId),
    });
    goRoomPrivateFiles.attach();
    void ensureRoomFileSw();
    const shareLib = createHostShareLibrary();
    if (shareLib?.supported) {
      shareCatalogSync?.stop();
      shareCatalogSync = createBoothShareCatalogSync({
        library: shareLib,
        syncCatalog: (entries) => goRoomFiles.syncHostShareCatalog(entries),
      });
      void shareCatalogSync.start();
    }
    goRoomMedia.attach({
      localAgentId,
      occupantCount: () => liveGuestCount() + 1,
      peers: () =>
        allPeerSlots()
          .filter((s) => !s.lost && s.session)
          .map((s) => ({
            peerId: s.peerId || "",
            pc: s.session!.pc,
            via: "entrance" as const,
          })),
      sendJson: (msg) => {
        for (const sess of liveSessions()) {
          try {
            sess.send(msg);
          } catch {
            /* ignore */
          }
        }
      },
      forward: true,
      resolveLocalFile: (id) => goRoomFiles.localFile(id),
      resolvePrivateFile: (id) =>
        isRoomPrivateFileId(id)
          ? goRoomPrivateFiles.getFile(id)
          : Promise.resolve(null),
      ownerOf: (id) => goRoomFiles.listingOwner(id),
      fileMeta: (id) => goRoomFiles.listingMeta(id),
      onTvProgramChange: () => {
        anchorBridge.refreshProgram();
        anchorBridge.publishSnapshot();
      },
      onRecordingChange: () => {
        anchorBridge.publishSnapshot();
      },
      onProgramClock: scheduleCastSnapshot,
      onRecordingDone: () => {
        void goRoomPrivateFiles.refresh();
      },
    });
  }

  function routeFilePeer(slot: PeerSlot): void {
    if (!fileHub || !slot.peerId || !slot.session || slot.fileRouted) return;
    slot.fileRouted = true;
    const sess = slot.session;
    const peerId = slot.peerId;
    fileHub.addPeer({
      peerId,
      sendJson: (msg) => {
        try {
          sess.send(msg);
        } catch {
          /* ignore */
        }
      },
      sendBinary: (buf) => sendBinary(sess, buf),
      bufferedAmount: () => sess.getChannel()?.bufferedAmount ?? 0,
    });
  }

  function dropPeer(slot: PeerSlot): void {
    if (slot.lost) return;
    slot.lost = true;
    if (slot.kind === "guest") {
      if (slot.peerId && fileHub) fileHub.removePeer(slot.peerId);
      if (GO_ROOM_MESH_ENABLED && slot.peerId) meshBroker.removePeer(slot.peerId);
    }
    if (slot.peerId && playHost) playHost.detachExistingPeer(slot.peerId);
    const sess = slot.session;
    slot.session = null;
    if (sess) {
      try {
        sess.close();
      } catch {
        /* ignore */
      }
    }
    refreshGuestSummary();
  }

  function operatorHandlers(slot: PeerSlot): RosterPeerHandlers {
    return handlers(slot);
  }

  function kickPeer(peerId: string): boolean {
    const id = peerId?.trim();
    if (!id || id === "local") return false;
    const slot =
      slots.find((s) => !s.lost && s.peerId === id && s.session) ??
      operatorSlots.find((s) => !s.lost && s.peerId === id && s.session) ??
      peerSlots.find((s) => !s.lost && s.peerId === id && s.session);
    if (!slot?.session) return false;
    if (slot.kind === "guest") {
      try {
        slot.session.send(
          buildSessionBoothMessage({
            op: "kick",
            from: localAgentId,
            to: id,
          })
        );
      } catch {
        /* still drop */
      }
    }
    dropPeer(slot);
    return true;
  }

  function syncPlayHostPeer(slot: PeerSlot): void {
    if (!playHost || !slot.peerId || !slot.session) return;
    playHost.attachExistingPeer({
      peerId: slot.peerId,
      session: slot.session,
      displayName: slot.displayName,
    });
  }

  function handlers(slot: PeerSlot): RosterPeerHandlers {
    return {
      onMessage: (data: unknown) => {
        if (isPresenceMessage(data)) {
          slot.peerId = data.agentId;
          slot.displayName = data.name;
          if (slot.kind === "guest") {
            routeFilePeer(slot);
            if (GO_ROOM_MESH_ENABLED) {
              meshBroker.addPeer(data.agentId);
              meshBroker.introduce(data.agentId);
            }
          }
          syncPlayHostPeer(slot);
          refreshGuestSummary();
        } else if (isSessionChatMessage(data)) {
          const toast = goSessionChat.onIncoming(data);
          if (toast) chromeSession.setFlash(toast, 2800);
          broadcastSessionChat(otherSessions(slot), data);
        } else if (isSessionChatCtlMessage(data)) {
          if (!sessionChatCtlAllowedFromGuest(data)) return;
          goSessionChat.onIncoming(data);
          for (const sess of otherSessions(slot)) {
            try {
              sess.send(data);
            } catch {
              /* ignore */
            }
          }
        } else if (isSessionFileControl(data)) {
          if (slot.kind !== "guest") return;
          if (!slot.peerId && data.owner) slot.peerId = data.owner;
          if (!slot.peerId && data.from) slot.peerId = data.from;
          routeFilePeer(slot);
          if (slot.peerId && fileHub) fileHub.onPeerControl(slot.peerId, data);
        } else if (
          GO_ROOM_MESH_ENABLED &&
          isSessionMeshMessage(data) &&
          slot.peerId &&
          slot.kind === "guest"
        ) {
          meshBroker.forward(slot.peerId, data);
        } else if (
          isSessionCastMessage(data) ||
          isSessionCameraMessage(data) ||
          isSessionMicMessage(data) ||
          isSessionRecordMessage(data)
        ) {
          void goRoomMedia.onCastControl(data);
          for (const sess of otherSessions(slot)) {
            try {
              sess.send(data);
            } catch {
              /* ignore */
            }
          }
        } else if (isSessionPlayMessage(data)) {
          /* Only booth host may offer／end — ignore guest forgeries. */
        } else if (isAvatarRelayMessage(data) && playHost) {
          const peerId =
            slot.peerId ||
            (typeof data.from === "string" ? data.from.trim() : "");
          if (peerId) {
            if (!slot.peerId) slot.peerId = peerId;
            playHost.handleAvatarRelay(data, peerId);
          }
        }
      },
      onBinary: (buf) => {
        if (slot.kind !== "guest") return;
        if (slot.peerId && fileHub) fileHub.onPeerBinary(slot.peerId, buf);
      },
      onChannelOpen: () => {
        if (status.phase !== "ended") {
          fanoutOccupancy();
          const sess = slot.session;
          if (sess) {
            const playSnap = sessionPlay.snapshotOffer();
            if (playSnap) {
              try {
                sess.send(playSnap);
              } catch {
                /* ignore */
              }
            }
            if (playHost && slot.peerId) {
              syncPlayHostPeer(slot);
            }
            if (goSessionChat.textLocked) {
              try {
                sess.send(
                  buildSessionChatCtlMessage({
                    op: "lock",
                    from: localAgentId,
                  })
                );
              } catch {
                /* ignore */
              }
            }
            for (const [to, until] of Object.entries(
              goSessionChat.silencedUntil ?? {}
            )) {
              if (typeof until !== "number" || until <= Date.now()) continue;
              try {
                sess.send(
                  buildSessionChatCtlMessage({
                    op: "silence",
                    from: localAgentId,
                    to,
                    until,
                  })
                );
              } catch {
                /* ignore */
              }
            }
          }
          set({
            phase: "open",
            error: null,
            message: roomOccupantSummary({ guestCount: liveGuestCount() }),
          });
        }
      },
      onChannelClose: () => {
        dropPeer(slot);
      },
      onConnectionState: (state) => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          dropPeer(slot);
        }
      },
      onError: (err) => {
        set({ error: err.message });
      },
    };
  }

  function occupancyMessage(): string {
    return roomOccupantSummary({ guestCount: liveGuestCount() });
  }

  function doorIsLive(): boolean {
    return (
      status.inviteDoor === "live" &&
      Boolean(status.inviteId) &&
      Boolean(status.shortUrl) &&
      isInviteUnexpired(status.inviteExpiresAt)
    );
  }

  function revokeInviteDoor(): void {
    const inviteId = status.inviteId;
    if (!inviteId) return;
    expireDoor(inviteId);
  }

  async function revokeInviteAndAnswer(): Promise<void> {
    const engine = hubRef.engine;
    if (!engine) {
      revokeInviteDoor();
      anchorBridge.publishSnapshot();
      return;
    }
    const ack = await engine.dispatch(
      { type: "invite.revoke" },
      embeddedHostShellContext()
    );
    if (ack.ok) anchorBridge.publishSnapshot();
  }

  function expireDoor(inviteId: string): void {
    if (status.inviteId !== inviteId) return;
    const toRevoke = status.inviteId;
    clearRoomInviteSession(inviteSession);
    set({
      inviteDoor: "expired",
      shortUrl: null,
      inviteId: null,
      inviteExpiresAt: null,
      message: occupancyMessage(),
    });
    if (toRevoke) void goAuth.revokePlatformInvite(toRevoke);
  }

  function clearInviteExpiryTimer() {
    if (inviteExpiryTimer) {
      clearTimeout(inviteExpiryTimer);
      inviteExpiryTimer = null;
    }
  }

  function scheduleInviteExpiry(inviteId: string, expiresAt: number) {
    clearInviteExpiryTimer();
    const delay = Math.max(0, expiresAt - Date.now());
    inviteExpiryTimer = setTimeout(() => {
      expireDoor(inviteId);
    }, delay);
  }

  function persistDoor(snap: RoomInviteSessionSnapshot): void {
    writeRoomInviteSession(inviteSession, snap);
  }

  function restoreDoorFromSession(): void {
    const snap = readRoomInviteSession(inviteSession);
    if (!snap) return;
    const apiKey = goAuth.getPlatformApiKeyForHostLoop();
    if (!apiKey) {
      clearRoomInviteSession(inviteSession);
      return;
    }
    set({
      inviteId: snap.inviteId,
      shortUrl: snap.shortUrl,
      inviteExpiresAt: snap.expiresAt,
      inviteDoor: "live",
      message: occupancyMessage(),
    });
    scheduleInviteExpiry(snap.inviteId, snap.expiresAt);
  }

  async function mintInviteAndAnswer(): Promise<{
    inviteId: string;
    shortUrl: string;
  } | null> {
    if (doorIsLive() && status.inviteId && status.shortUrl) {
      return { inviteId: status.inviteId, shortUrl: status.shortUrl };
    }
    if (mintInflight) return mintInflight;
    mintInflight = (async () => {
      const engine = hubRef.engine;
      if (!engine) return mintInviteAndAnswerInner();
      const ack = await engine.dispatch(
        { type: "invite.mint" },
        embeddedHostShellContext()
      );
      if (!ack.ok) {
        if (ack.error === "not_director") {
          set({ error: "目前無法請人" });
          return null;
        }
        return null;
      }
      if (status.inviteId && status.shortUrl) {
        return { inviteId: status.inviteId, shortUrl: status.shortUrl };
      }
      return null;
    })().finally(() => {
      mintInflight = null;
    });
    return mintInflight;
  }

  async function mintInviteAndAnswerInner(): Promise<{
    inviteId: string;
    shortUrl: string;
  } | null> {
    closing = false;
    try {
      const created = await goAuth.mintPlatformInvite({
        kind: INVITE_ROOM_KIND,
        intent: buildInviteRoomIntent(),
      });
      const expiresAt =
        typeof created.expires_at === "number" &&
        Number.isFinite(created.expires_at)
          ? created.expires_at
          : Date.now() + DEFAULT_INVITE_TTL_MS;
      if (!isInviteUnexpired(expiresAt)) {
        const err = "邀請已過期，請重新邀請";
        if (status.phase === "open") {
          set({ error: err });
          return null;
        }
        set({ phase: "error", error: err, message: "" });
        return null;
      }
      const apiKey = goAuth.getPlatformApiKeyForHostLoop();
      if (!apiKey) {
        const err = "通行證已失效，請重新登入";
        if (status.phase === "open") {
          set({ error: err });
          return null;
        }
        set({ phase: "error", error: err, message: "" });
        return null;
      }
      const previousId = status.inviteId;
      ensureLocalSurface();
      set({
        phase: "open",
        inviteId: created.invite_id,
        shortUrl: created.short_url,
        inviteExpiresAt: expiresAt,
        inviteDoor: "live",
        error: null,
        message: occupancyMessage(),
      });
      await anchorBridge.onBoothOpen();
      scheduleInviteExpiry(created.invite_id, expiresAt);
      persistDoor({
        inviteId: created.invite_id,
        shortUrl: created.short_url,
        expiresAt,
      });
      if (previousId && previousId !== created.invite_id) {
        void goAuth.revokePlatformInvite(previousId);
      }
      return { inviteId: created.invite_id, shortUrl: created.short_url };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: unknown }).code)
          : /通行證|登入|not_provisioned/i.test(message)
            ? "not_provisioned"
            : "error";
      if (status.phase === "open") {
        set({ error: message });
        return null;
      }
      set({ phase: "error", error: message, message: "" });
      throw Object.assign(new Error(message), { code });
    }
  }

  async function openBooth(opts?: { afterEnd?: boolean }): Promise<void> {
    if (opening) return;
    if (status.phase === "ended" && !opts?.afterEnd) return;
    if (!opts?.afterEnd && status.phase === "open") return;
    opening = true;
    try {
      if (opts?.afterEnd || status.phase === "ended") {
        closing = false;
        clearInviteExpiryTimer();
        clearRoomInviteSession(inviteSession);
        set({
          phase: "idle",
          error: null,
          message: "",
          inviteId: null,
          shortUrl: null,
          inviteExpiresAt: null,
          inviteDoor: "none",
          peerName: null,
          guestCount: 0,
          occupantNames: [],
          occupantPeers: [],
        });
      }
      closing = false;
      ensureLocalSurface();
      set({
        phase: "open",
        error: null,
        inviteDoor: status.inviteDoor === "live" ? "live" : "none",
        message: occupancyMessage(),
      });
      if (!doorIsLive()) restoreDoorFromSession();
      await anchorBridge.onBoothOpen();
      ensurePeerSignalHost();
    } finally {
      opening = false;
    }
  }

  async function remountPlayCanvasAfterSessionOpen(
    catalogId: string
  ): Promise<void> {
    if (!playCanvas || !playFiles) return;
    playGeneration += 1;
    const storageScope = `catalog:${catalogId}`;
    if (playCanvas.canvasMode === "sw") {
      await syncGoCanvasSnapshot(
        playCanvas.sandboxId,
        playGeneration,
        playFiles,
        storageScope
      );
      const url = withGoPgSurfaceQuery(
        canvasEntryUrl(playCanvas.sandboxId, playGeneration),
        "room"
      );
      playCanvas = {
        ...playCanvas,
        canvasUrl: url,
        canvasSrcdoc: null,
        canvasGeneration: playGeneration,
      };
      set({
        playCanvasUrl: url,
        playCanvasSrcdoc: null,
        playCanvasMode: "sw",
        playCanvasGeneration: playGeneration,
      });
      return;
    }
    const built = buildGoMemoryCanvas(
      playFiles,
      playGeneration,
      storageScope,
      "room"
    );
    const prevDispose = playCanvas.dispose;
    playCanvas = {
      ...playCanvas,
      canvasUrl: null,
      canvasSrcdoc: built.srcdoc,
      canvasGeneration: playGeneration,
      dispose: () => {
        prevDispose();
      },
    };
    set({
      playCanvasUrl: null,
      playCanvasSrcdoc: built.srcdoc,
      playCanvasMode: "memory",
      playCanvasGeneration: playGeneration,
    });
  }

  async function bootstrapPlayHost(
    catalogId: string,
    seats: readonly SessionPlaySeat[]
  ): Promise<void> {
    const seq = ++playBootstrapSeq;
    try {
      set({
        playCatalogId: catalogId,
        playLoadProgress: roomPlaySamCheckProgress(),
      });
      const bundle = await loadRoomPlaySam({
        catalogId,
        onProgress: (playLoadProgress) => {
          if (seq !== playBootstrapSeq) return;
          set({ playLoadProgress });
        },
      });
      if (seq !== playBootstrapSeq) return;
      playFiles = bundle.files;
      playGeneration += 1;
      playHost = createRoomPlayHostRuntime({
        bundle,
        getFiles: () => playFiles,
        getSandboxId: () => playCanvas?.sandboxId ?? null,
        getHostRuntime: () => playHost,
      });
      playHost.enableKeepPeersOnClose({
        onClosed: () => {
          void endPlay();
        },
      });
      // Mount once so sandbox exists for /api/session/open, then open＋invite,
      // then remount so Host UI boots with pg_surface=room + getSession().
      playCanvas = await mountRoomPlayHostCanvas({
        bundle,
        generation: playGeneration,
        getHostRuntime: () => playHost,
      });
      if (seq !== playBootstrapSeq) {
        clearPlayCanvas();
        return;
      }
      set({
        playCatalogId: catalogId,
        playLoadProgress: null,
        playCanvasUrl: playCanvas.canvasUrl,
        playCanvasSrcdoc: playCanvas.canvasSrcdoc,
        playCanvasMode: playCanvas.canvasMode,
        playCanvasGeneration: playCanvas.canvasGeneration,
      });
      await playHost.open();
      for (const slot of slots) {
        if (slot.lost || !slot.peerId || !slot.session) continue;
        playHost.attachExistingPeer({
          peerId: slot.peerId,
          session: slot.session,
          displayName: slot.displayName,
        });
      }
      playHost.inviteRoomPlayPeers({ seats });
      const playStatus = playHost.getStatus();
      if (playStatus.sessionId && playStatus.channelName) {
        sessionPlay.attachSessionChannel({
          sessionId: playStatus.sessionId,
          channelName: playStatus.channelName,
        });
        const enriched = sessionPlay.snapshotOffer();
        if (enriched) fanoutPlay(enriched);
      }
      if (seq !== playBootstrapSeq) return;
      await remountPlayCanvasAfterSessionOpen(catalogId);
      if (seq !== playBootstrapSeq) return;
      sessionPlay.markActive();
    } catch (e) {
      if (seq !== playBootstrapSeq) return;
      const message = e instanceof Error ? e.message : String(e);
      chromeSession.setFlash(message.slice(0, 80), 3200);
      clearPlayCanvas();
      const ended = sessionPlay.hostEnd();
      if (ended.ok) fanoutPlay(ended.message);
      set({ error: message });
    }
  }

  async function offerPlay(input: {
    catalogId: string;
    rev?: string;
    seats: readonly SessionPlaySeat[];
  }): Promise<
    | { ok: true; state: RoomSessionPlayState }
    | { ok: false; reason: string }
  > {
    const out = sessionPlay.hostOffer(input);
    if (!out.ok) return out;
    void goRoomMedia.stopProgram();
    fanoutPlay(out.message);
    // Hide house ad immediately（不等 SAM 載完）.
    set({
      playCatalogId: input.catalogId,
      playLoadProgress: roomPlaySamCheckProgress(),
    });
    void bootstrapPlayHost(input.catalogId, input.seats);
    return { ok: true, state: out.state };
  }

  function playOccupants() {
    return [
      {
        peerId: localAgentId,
        displayName: roomHostDisplayName(goAuth.profile) || "主持",
        joinedAt: 0,
      },
      ...slots
        .filter((s) => !s.lost && s.peerId && s.session)
        .map((s, i) => ({
          peerId: s.peerId!,
          displayName: playerDisplayName(s.displayName, "訪客"),
          joinedAt: i + 1,
        })),
    ];
  }

  /**
   * Host shortcut: auto-seat + offerPlay for a catalog game (first knife UX).
   */
  async function startAutoPlay(catalogId: string): Promise<
    | { ok: true; state: RoomSessionPlayState }
    | { ok: false; reason: string; missingRoles?: string[] }
  > {
    const entry = getGoCatalogEntry(catalogId);
    const protocol = hostableProtocolFor(entry ?? null);
    if (!protocol) return { ok: false, reason: "not_playable" };
    const seatsOut = assignRoomPlaySeats({
      protocolRoles: protocol.roles,
      roleLimits: protocol.roleLimits,
      hostPeerId: localAgentId,
      occupantsOrdered: playOccupants(),
      mode: "auto",
    });
    if (!seatsOut.ok) {
      return {
        ok: false,
        reason: seatsOut.reason,
        ...(seatsOut.missingRoles
          ? { missingRoles: seatsOut.missingRoles }
          : {}),
      };
    }
    return offerPlay({ catalogId, seats: seatsOut.seats });
  }

  /**
   * Host: manual seat picks → offerPlay. Failures stay in-sheet（no flash）.
   */
  async function startManualPlay(
    catalogId: string,
    manualPicks: readonly SessionPlaySeat[]
  ): Promise<
    | { ok: true; state: RoomSessionPlayState }
    | { ok: false; reason: string; missingRoles?: string[] }
  > {
    const entry = getGoCatalogEntry(catalogId);
    const protocol = hostableProtocolFor(entry ?? null);
    if (!protocol) return { ok: false, reason: "not_playable" };
    const seatsOut = assignRoomPlaySeats({
      protocolRoles: protocol.roles,
      roleLimits: protocol.roleLimits,
      hostPeerId: localAgentId,
      occupantsOrdered: playOccupants(),
      mode: "manual",
      manualPicks,
    });
    if (!seatsOut.ok) {
      return {
        ok: false,
        reason: seatsOut.reason,
        ...(seatsOut.missingRoles
          ? { missingRoles: seatsOut.missingRoles }
          : {}),
      };
    }
    return offerPlay({ catalogId, seats: seatsOut.seats });
  }

  async function endPlay(): Promise<
    | { ok: true; state: RoomSessionPlayState }
    | { ok: false; reason: string }
  > {
    if (endingPlay) {
      return { ok: true, state: sessionPlay.getState() };
    }
    endingPlay = true;
    try {
      playBootstrapSeq += 1;
      if (playHost) {
        try {
          await playHost.closeSessionKeepPeers({ message: "已結束這一局" });
        } catch {
          /* ignore */
        }
      }
      clearPlayCanvas();
      const out = sessionPlay.hostEnd();
      if (!out.ok) {
        // Already idle（e.g. close→onClosed→endPlay after keep-peers）
        return { ok: true, state: sessionPlay.getState() };
      }
      fanoutPlay(out.message);
      return { ok: true, state: out.state };
    } finally {
      endingPlay = false;
    }
  }

  function buildHubSnapshot(): import("@pg/roster/boothChannel").BoothStateSnapshot {
    const inviteGate =
      status.inviteDoor === "live"
        ? "live"
        : status.inviteDoor === "expired"
          ? "expired"
          : "none";
    return {
      sessionId: hubRef.engine?.sessionId ?? "",
      ownerUserId: goAuth.profile?.user_id ?? "",
      engineMode: "embedded",
      hostPeerId: localAgentId,
      hostDisplayName: roomHostDisplayName(goAuth.profile),
      members: [
        {
          peerId: localAgentId,
          displayName: roomHostDisplayName(goAuth.profile),
          kind: "host",
          isHost: true,
        },
        ...status.occupantPeers.map((p) => ({
          peerId: p.peerId,
          displayName: p.name,
          kind:
            p.kind === "operator" || p.kind === "peer" || p.kind === "guest"
              ? p.kind
              : ("guest" as const),
          isHost: false,
        })),
      ],
      inviteGate,
      inviteShortUrl: status.shortUrl ?? undefined,
      inviteExpiresAt: status.inviteExpiresAt ?? undefined,
      shareFileCount: goRoomFiles.entries.length,
      privateFileCount: goRoomPrivateFiles.entries.length,
      guestCount: status.guestCount,
      anchor: anchorBridge.isEnabled() ? "online" : "offline",
      director: hubRef.engine?.getDirector() ?? undefined,
    };
  }

  async function teardownBooth(opts?: {
    message?: string;
    /** Default `ended` (Host「結束」). `idle` for logout — back to login gate. */
    landOn?: "idle" | "ended";
  }): Promise<void> {
    const landOn = opts?.landOn ?? "ended";
    if (closing) return;
    if (status.phase === "idle") return;
    if (status.phase === "ended" && landOn === "ended") return;
    closing = true;
    await anchorBridge.stop();
    clearInviteExpiryTimer();
    clearRoomInviteSession(inviteSession);
    playBootstrapSeq += 1;
    if (playHost) {
      try {
        await playHost.closeSessionKeepPeers();
      } catch {
        /* ignore */
      }
    }
    clearPlayCanvas();
    sessionPlay.reset();
    goSessionChat.detach();
    shareCatalogSync?.stop();
    shareCatalogSync = null;
    goRoomFiles.detach();
    goRoomPrivateFiles.detach();
    goRoomMedia.detach();
    fileHub = null;
    surfaceAttached = false;
    for (const slot of slots) {
      slot.lost = true;
      try {
        slot.session?.close();
      } catch {
        /* ignore */
      }
      slot.session = null;
    }
    slots.length = 0;
    for (const slot of peerSlots) {
      slot.lost = true;
      try {
        slot.session?.close();
      } catch {
        /* ignore */
      }
      slot.session = null;
    }
    peerSlots.length = 0;
    disposePeerSignal?.();
    disposePeerSignal = null;
    const inviteId = status.inviteId;
    if (inviteId) {
      try {
        await goAuth.revokePlatformInvite(inviteId);
      } catch {
        /* already closed / expired */
      }
    }
    set({
      phase: landOn === "idle" ? "idle" : "ended",
      message:
        landOn === "idle" ? "" : opts?.message ?? "已結束這一間",
      error: null,
      inviteId: null,
      shortUrl: null,
      inviteExpiresAt: null,
      inviteDoor: "none",
      peerName: null,
      guestCount: 0,
      occupantNames: [],
      occupantPeers: [],
      playCatalogId: null,
      playLoadProgress: null,
      playCanvasUrl: null,
      playCanvasSrcdoc: null,
      playCanvasMode: null,
      playCanvasGeneration: 0,
      peerJoinUrl: null,
      peerCapId: null,
      peerCapExpiresAt: null,
    });
    closing = false;
  }

  const hubEngine = createEmbeddedBoothHubEngine({
    ownerUserId: () => goAuth.profile?.user_id ?? null,
    buildSnapshot: buildHubSnapshot,
    onDirectorChanged: () => anchorBridge.publishSnapshot(),
    acceptPeerOffer: acceptPeerJoinOffer,
    handlers: {
      inviteMint: async () => {
        const out = await mintInviteAndAnswerInner();
        if (!out) throw new Error("invite_mint_failed");
      },
      inviteRevoke: async () => {
        revokeInviteDoor();
      },
      castOffer: async (payload) => {
        if (payload.kind === "live" && payload.peerId) {
          const resolved =
            payload.peerId === "local" ? localAgentId : payload.peerId;
          const out = await goRoomMedia.putLiveOnTv(resolved, payload.label);
          if (!out.ok) throw new Error(out.error);
          anchorBridge.refreshProgram();
          return;
        }
        if (payload.kind === "file" && payload.id) {
          const out =
            payload.scope === "private"
              ? await goRoomMedia.startPrivateProgram(payload.id)
              : await goRoomMedia.startListedProgram(payload.id);
          if (!out.ok) throw new Error(out.error);
          return;
        }
        throw new Error("invalid_cast_offer");
      },
      castUnoffer: async () => {
        await goRoomMedia.stopProgram();
      },
      castState: async (payload) => {
        applyBoothCastStateToMedia(goRoomMedia, payload);
      },
      ejectPeer: async (peerId) => {
        if (!kickPeer(peerId)) throw new Error("peer_gone");
      },
      end: async () => {
        await teardownBooth();
      },
      privateRemove: async (id) => {
        await goRoomPrivateFiles.remove(id);
        anchorBridge.publishSnapshot();
      },
      privateMountToShare: async (id) => {
        const file = await goRoomPrivateFiles.getFile(id);
        if (!file) throw new Error("private_not_found");
        const result = await goRoomFiles.shareLocalFile(file);
        if (!result.ok) throw new Error(result.error);
        anchorBridge.publishSnapshot();
      },
      shareUnshare: async (id) => {
        if (!goRoomFiles.unshare(id, { host: true })) {
          throw new Error("share_not_found");
        }
        anchorBridge.publishSnapshot();
      },
      shareRescan: async () => {
        await shareCatalogSync?.rescan();
        anchorBridge.publishSnapshot();
      },
    },
  });
  hubRef.engine = hubEngine;
  hubEngine.registerShell(embeddedHostShellContext());
  const shellClient: BoothShellClient = createBoothShellClient({
    engine: hubEngine,
    mode: "embedded",
  });

  async function close(opts?: {
    message?: string;
    landOn?: "idle" | "ended";
  }): Promise<void> {
    if (closing) return;
    if (status.phase === "idle") return;
    if (status.phase === "ended" && (opts?.landOn ?? "ended") === "ended") {
      return;
    }
    const ack = await hubRef.engine!.dispatch(
      { type: "end" },
      embeddedHostShellContext()
    );
    if (!ack.ok && ack.error === "session_ended") {
      await teardownBooth(opts);
    } else if (!ack.ok) {
      set({
        error:
          ack.error === "not_director"
            ? "目前無法結束這一間"
            : "無法結束這一間",
      });
      return;
    }
    if (opts?.message && status.phase !== "idle") {
      set({ message: opts.message });
    }
    if (opts?.landOn === "idle" && status.phase === "ended") {
      set({ phase: "idle", message: "" });
    }
  }

  async function mintPeerCap(label?: string): Promise<{
    peerCap: string;
    joinUrl: string;
    peerCapId: string;
    expiresAt: number;
  } | null> {
    const ack = await hubRef.engine!.dispatch(
      { type: "peer.mint", label },
      embeddedHostShellContext()
    );
    if (!ack.ok || !ack.payload) return null;
    const peerCap = String(ack.payload.peerCap ?? "");
    const joinUrl = String(ack.payload.joinUrl ?? "");
    const peerCapId = String(ack.payload.peerCapId ?? "");
    const expiresAt = Number(ack.payload.expiresAt ?? 0);
    set({
      peerJoinUrl: joinUrl || null,
      peerCapId: peerCapId || null,
      peerCapExpiresAt: expiresAt || null,
    });
    return { peerCap, joinUrl, peerCapId, expiresAt };
  }

  async function revokePeerCap(): Promise<boolean> {
    const peerCapId = status.peerCapId;
    if (!peerCapId) return false;
    const ack = await hubRef.engine!.dispatch(
      { type: "peer.revoke", peerCapId },
      embeddedHostShellContext()
    );
    if (!ack.ok) return false;
    set({
      peerJoinUrl: null,
      peerCapId: null,
      peerCapExpiresAt: null,
    });
    return true;
  }

  operatorHooks.mintInvite = async () => {
    const out = await mintInviteAndAnswerInner();
    if (!out) throw new Error("invite_mint_failed");
    anchorBridge.publishSnapshot();
  };
  operatorHooks.revokeInvite = async () => {
    revokeInviteDoor();
    anchorBridge.publishSnapshot();
  };
  operatorHooks.castState = async (payload) => {
    applyBoothCastStateToMedia(goRoomMedia, payload);
    anchorBridge.publishSnapshot();
  };
  operatorHooks.kickPeer = async (peerId: string) => {
    kickPeer(peerId);
  };
  operatorHooks.endBooth = async () => {
    await teardownBooth();
  };
  operatorHooks.stopTv = async () => {
    await goRoomMedia.stopProgram();
  };
  operatorHooks.castFile = async (fileId, scope) => {
    const out =
      scope === "private"
        ? await goRoomMedia.startPrivateProgram(fileId)
        : await goRoomMedia.startListedProgram(fileId);
    if (!out.ok) throw new Error(out.error);
  };
  operatorHooks.haltLive = async (peerId, layer) => {
    const resolved = peerId === "local" ? localAgentId : peerId;
    const out = await goRoomMedia.haltLive(resolved, layer);
    if (!out.ok) throw new Error(out.error);
  };
  operatorHooks.startAutoPlay = (catalogId) => startAutoPlay(catalogId);
  operatorHooks.startManualPlay = (catalogId, picks) =>
    startManualPlay(catalogId, picks);
  operatorHooks.endPlay = () => endPlay();

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      listener({ ...status });
      return () => listeners.delete(listener);
    },
    getStatus(): RoomStatus {
      return { ...status };
    },
    getPlayState(): RoomSessionPlayState {
      return sessionPlay.getState();
    },
    /** Booth host: fanout session_play.offer on existing peers (no compose). */
    offerPlay,
    startAutoPlay,
    startManualPlay,
    endPlay,
    openBooth,
    mintInviteAndAnswer,
    revokeInviteAndAnswer,
    mintPeerCap,
    revokePeerCap,
    kickPeer,
    close,
    getShellClient: (): BoothShellClient => shellClient,
    getHubEngine: (): BoothHubEngine => hubRef.engine ?? hubEngine,
    setRemoteAnchorEnabled: (enabled: boolean) => anchorBridge.setEnabled(enabled),
    getRemoteAnchorEnabled: () => anchorBridge.isEnabled(),
  };
}

export type RoomRuntime = ReturnType<typeof createRoomRuntime>;
