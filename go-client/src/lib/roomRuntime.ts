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
import { isSessionPlayMessage } from "@pg/roster/rosterSessionPlay";
import type { SessionPlaySeat } from "@pg/roster/rosterSessionPlay";
import { createRoomMeshBroker } from "./goRoomMeshBroker";
import { startPlatformHostAnswerLoop } from "@pg/platform/platformHostLoop";
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
import { isRoomPrivateFileId } from "./goRoomPrivateOpfs";
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
} from "./goRoomPlayBootstrap";
import {
  getGoCatalogEntry,
  hostableProtocolFor,
} from "./goCatalog";
import type { HostRuntime } from "./hostRuntime";
import type { MountedGoCanvas } from "./mountGoCanvas";
import type { FileMap } from "@pg/projectTypes";
import { canvasEntryUrl, syncGoCanvasSnapshot } from "./goCanvas";
import { buildGoMemoryCanvas } from "./goMemoryCanvas";
import { withGoPgSurfaceQuery } from "./goPgSurface";
import {
  GO_ROOM_QUICK_REPLIES,
  GO_ROOM_MESH_ENABLED,
  roomHostDisplayName,
  roomOccupantSummary,
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
  /** Booth play canvas (TV slot); null when idle. */
  playCatalogId: string | null;
  playCanvasUrl: string | null;
  playCanvasSrcdoc: string | null;
  playCanvasMode: "sw" | "memory" | null;
  playCanvasGeneration: number;
};

type Listener = (s: RoomStatus) => void;

type PeerSlot = {
  peerId: string | null;
  session: RosterPeerSession | null;
  displayName: string | null;
  lost?: boolean;
  fileRouted?: boolean;
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
    playCatalogId: null,
    playCanvasUrl: null,
    playCanvasSrcdoc: null,
    playCanvasMode: null,
    playCanvasGeneration: 0,
  };
  const listeners = new Set<Listener>();
  let loop: ReturnType<typeof startPlatformHostAnswerLoop> | null = null;
  let inviteExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  const localAgentId = `go-room-${crypto.randomUUID().slice(0, 8)}`;
  const slots: PeerSlot[] = [];
  let surfaceAttached = false;
  let closing = false;
  let opening = false;
  let mintInflight: Promise<{
    inviteId: string;
    shortUrl: string;
  } | null> | null = null;
  let fileHub: RoomFileStarHub | null = null;
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

  function clearPlayCanvas(): void {
    playCanvas?.dispose();
    playCanvas = null;
    playFiles = null;
    playHost = null;
    set({
      playCatalogId: null,
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
    return out;
  }

  function liveGuestCount(): number {
    return liveSessions().length;
  }

  function otherSessions(except: PeerSlot): RosterPeerSession[] {
    return liveSessions().filter((s) => s !== except.session);
  }

  function refreshGuestSummary(): void {
    const live = slots.filter((s) => !s.lost && s.session);
    const names = live
      .map((s) => s.displayName?.trim())
      .filter((n): n is string => Boolean(n));
    const occupantPeers = live
      .filter((s) => Boolean(s.peerId))
      .map((s) => ({
        peerId: s.peerId,
        name: s.displayName?.trim() || "訪客",
      }));
    set({
      guestCount: live.length,
      peerName: names[0] ?? null,
      occupantNames: names,
      occupantPeers,
      message: roomOccupantSummary({ guestCount: live.length }),
    });
    fanoutOccupancy();
    void goRoomMedia.refresh();
  }

  function occupancyRows(): { peerId: string; name: string }[] {
    const host = hostName().slice(0, 64) || "主持";
    const guests = slots
      .filter((s) => !s.lost && s.session && s.peerId)
      .map((s) => ({
        peerId: s.peerId as string,
        name: (s.displayName?.trim() || "訪客").slice(0, 64),
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
      bufferedAmount: () => hub.requesterBufferedAmount(),
    });
    goRoomPrivateFiles.attach();
    goRoomMedia.attach({
      localAgentId,
      occupantCount: () => liveGuestCount() + 1,
      peers: () =>
        slots
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
    if (slot.peerId && fileHub) fileHub.removePeer(slot.peerId);
    if (GO_ROOM_MESH_ENABLED && slot.peerId) meshBroker.removePeer(slot.peerId);
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

  function kickPeer(peerId: string): boolean {
    const id = peerId?.trim();
    if (!id || id === "local") return false;
    const slot = slots.find((s) => !s.lost && s.peerId === id && s.session);
    if (!slot?.session) return false;
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
    dropPeer(slot);
    return true;
  }

  function handlers(slot: PeerSlot): RosterPeerHandlers {
    return {
      onMessage: (data: unknown) => {
        if (isPresenceMessage(data)) {
          slot.peerId = data.agentId;
          slot.displayName = data.name;
          routeFilePeer(slot);
          if (GO_ROOM_MESH_ENABLED) {
            meshBroker.addPeer(data.agentId);
            meshBroker.introduce(data.agentId);
          }
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
          if (!slot.peerId && data.owner) slot.peerId = data.owner;
          if (!slot.peerId && data.from) slot.peerId = data.from;
          routeFilePeer(slot);
          if (slot.peerId && fileHub) fileHub.onPeerControl(slot.peerId, data);
        } else if (
          GO_ROOM_MESH_ENABLED &&
          isSessionMeshMessage(data) &&
          slot.peerId
        ) {
          meshBroker.forward(slot.peerId, data);
        } else if (
          isSessionCastMessage(data) ||
          isSessionCameraMessage(data) ||
          isSessionMicMessage(data)
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
              playHost.attachExistingPeer({
                peerId: slot.peerId,
                session: sess,
                displayName: slot.displayName,
              });
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
      isInviteUnexpired(status.inviteExpiresAt) &&
      Boolean(loop)
    );
  }

  function expireDoor(inviteId: string): void {
    if (status.inviteId !== inviteId) return;
    loop?.stop();
    loop = null;
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

  function startAnswerLoop(inviteId: string, apiKey: string): void {
    loop?.stop();
    loop = startPlatformHostAnswerLoop({
      inviteId,
      apiKey,
      useRelay: false,
      media: "ready",
      maxAnswers: 0,
      localPresence: {
        agentId: localAgentId,
        name: hostName(),
      },
      prepareHandlers: () => {
        const slot: PeerSlot = {
          peerId: null,
          session: null,
          displayName: null,
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
      },
      onError: (msg) => set({ error: msg }),
    });
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
    startAnswerLoop(snap.inviteId, apiKey);
  }

  async function mintInviteAndAnswer(): Promise<{
    inviteId: string;
    shortUrl: string;
  } | null> {
    if (doorIsLive() && status.inviteId && status.shortUrl) {
      return { inviteId: status.inviteId, shortUrl: status.shortUrl };
    }
    if (mintInflight) return mintInflight;
    mintInflight = mintInviteAndAnswerInner().finally(() => {
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
      loop?.stop();
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
      scheduleInviteExpiry(created.invite_id, expiresAt);
      persistDoor({
        inviteId: created.invite_id,
        shortUrl: created.short_url,
        expiresAt,
      });
      startAnswerLoop(created.invite_id, apiKey);
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
      const bundle = await loadRoomPlaySam({ catalogId });
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
    set({ playCatalogId: input.catalogId });
    void bootstrapPlayHost(input.catalogId, input.seats);
    return { ok: true, state: out.state };
  }

  /**
   * Host shortcut: auto-seat + offerPlay for a catalog game (first knife UX).
   */
  async function startAutoPlay(catalogId: string): Promise<
    | { ok: true; state: RoomSessionPlayState }
    | { ok: false; reason: string }
  > {
    const entry = getGoCatalogEntry(catalogId);
    const protocol = hostableProtocolFor(entry ?? null);
    if (!protocol) return { ok: false, reason: "not_playable" };
    const occupants = [
      {
        peerId: localAgentId,
        displayName: roomHostDisplayName(goAuth.profile) || "主持",
        joinedAt: 0,
      },
      ...slots
        .filter((s) => !s.lost && s.peerId && s.session)
        .map((s, i) => ({
          peerId: s.peerId!,
          displayName: s.displayName?.trim() || "訪客",
          joinedAt: i + 1,
        })),
    ];
    const seatsOut = assignRoomPlaySeats({
      protocolRoles: protocol.roles,
      roleLimits: protocol.roleLimits,
      hostPeerId: localAgentId,
      occupantsOrdered: occupants,
      mode: "auto",
    });
    if (!seatsOut.ok) {
      chromeSession.setFlash("人數不夠開局，請先請人進來", 2800);
      return { ok: false, reason: seatsOut.reason };
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

  async function close(opts?: { message?: string }): Promise<void> {
    if (closing || status.phase === "ended") return;
    closing = true;
    clearInviteExpiryTimer();
    clearRoomInviteSession(inviteSession);
    loop?.stop();
    loop = null;
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
    const inviteId = status.inviteId;
    if (inviteId) {
      try {
        await goAuth.revokePlatformInvite(inviteId);
      } catch {
        /* already closed / expired */
      }
    }
    set({
      phase: "ended",
      message: opts?.message ?? "已結束這一間",
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
      playCanvasUrl: null,
      playCanvasSrcdoc: null,
      playCanvasMode: null,
      playCanvasGeneration: 0,
    });
    closing = false;
  }

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
    endPlay,
    openBooth,
    mintInviteAndAnswer,
    kickPeer,
    close,
  };
}

export type RoomRuntime = ReturnType<typeof createRoomRuntime>;
