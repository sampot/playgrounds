/**
 * Pure-play 包廂 Host runtime (DEC-050 / PG-GO-ROOM-PLAN).
 * Enter `/room` → booth UI; invite is in-booth; multi-peer fanout (no 1:1 lock).
 */

import {
  isPresenceMessage,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import {
  broadcastSessionChat,
  isSessionChatMessage,
} from "@pg/roster/rosterSessionChat";
import { isSessionFileControl } from "@pg/roster/rosterSessionFile";
import { isSessionMeshMessage } from "@pg/roster/rosterSessionMesh";
import { isSessionCastMessage } from "@pg/roster/rosterSessionCast";
import {
  isSessionCameraMessage,
  isSessionMicMessage,
} from "@pg/roster/rosterSessionCamera";
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
import { goRoomMedia } from "./goRoomMedia.svelte";
import { createRoomFileStarHub, type RoomFileStarHub } from "./goRoomFileStar";
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

export function createRoomRuntime() {
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
    void goRoomMedia.refresh();
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
      ownerOf: (id) => goRoomFiles.listingOwner(id),
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
        }
      },
      onBinary: (buf) => {
        if (slot.peerId && fileHub) fileHub.onPeerBinary(slot.peerId, buf);
      },
      onChannelOpen: () => {
        if (status.phase !== "ended") {
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
      loop = startPlatformHostAnswerLoop({
        inviteId: created.invite_id,
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
    } finally {
      opening = false;
    }
  }

  async function close(opts?: { message?: string }): Promise<void> {
    if (closing || status.phase === "ended") return;
    closing = true;
    clearInviteExpiryTimer();
    loop?.stop();
    loop = null;
    goSessionChat.detach();
    goRoomFiles.detach();
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
    openBooth,
    mintInviteAndAnswer,
    close,
  };
}

export type RoomRuntime = ReturnType<typeof createRoomRuntime>;
