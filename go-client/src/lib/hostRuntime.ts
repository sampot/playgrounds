/**
 * Pure-play host session framework (GO-INVITE).
 *
 * A logged-in go player hosts a session for ANY catalog SAM that declares a
 * roster session protocol (see `hostableProtocolFor`). This module is
 * protocol-agnostic: it owns connection establishment (Platform host answer
 * loop → WebRTC peers), session open/channel, invite minting/adoption, and
 * relays opaque `act`/`event` payloads between the local Host SAM's
 * `functions.js` and any number of remote Guests.
 *
 * The Host SAM is the session authority: its `functions.js` (env.KV-backed via
 * goWebKv `catalog:<id>`) validates moves and emits events. Protocol rules
 * (gomoku, mahjong, big-two…) live ONLY there — the framework never inspects
 * act payloads.
 *
 * Connection ownership: any number of Guests may connect (each is one
 * `RosterPeerSession`); seats are assigned from the declared protocol roles.
 * The local Host occupies `hostRole`; the rest are filled by invited Guests.
 * No local Avatar projection spawn is needed — every participant runs the same
 * SAM directly.
 */

import {
  isAvatarRelayMessage,
  isPresenceMessage,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import {
  broadcastSessionChat,
  isSessionChatMessage,
  SESSION_CHAT_HOST_DISPLAY_NAME,
} from "@pg/roster/rosterSessionChat";
import {
  SESSION_EVENT_KIND,
  SESSION_INVITE_CANCEL_KIND,
  SESSION_INVITE_REJECT_KIND,
  SESSION_SEAT_BOUND_KIND,
  buildSessionInvitePayload,
  isSessionActPayload,
  isSessionInviteAcceptPayload,
  type SessionActPayload,
} from "@pg/roster/rosterSessionBridge";
import { buildSessionActResultPayload } from "@pg/roster/rosterSessionActTunnel";
import { publishRosterRelayedSessionEvent } from "@pg/roster/rosterHomeSessionTunnel";
import { startPlatformHostAnswerLoop } from "@pg/platform/platformHostLoop";
import { composeWantsRelay } from "@pg/platform/platformCompose";
import { goAuth } from "./goAuth.svelte";
import { chromeSession } from "./chromeSession.svelte";
import { goSessionChat } from "./goSessionChat.svelte";
import { publishGoMemoryBroadcast } from "./goMemoryCanvas";
import type { FileMap } from "@pg/projectTypes";
import type { HostableProtocol } from "./goCatalog";

/** Platform Invite default TTL (DEC-047) — must match platform-api `INVITE_TTL_MS`. */
export const DEFAULT_INVITE_TTL_MS = 5 * 60 * 1000;

/** True while `now` is strictly before invite expiry. */
export function isInviteUnexpired(
  expiresAt: number | null | undefined,
  now = Date.now()
): boolean {
  return (
    typeof expiresAt === "number" &&
    Number.isFinite(expiresAt) &&
    now < expiresAt
  );
}

export type HostPhase =
  | "idle"
  | "open"
  | "waiting"
  | "ready"
  | "active"
  | "ended"
  | "error";

export type HostGuestSeat = {
  seatId: string;
  role: string;
  peerId: string;
  inviteId: string;
  /** From Guest `presence.name` when provided. */
  displayName?: string;
};

export type HostStatus = {
  phase: HostPhase;
  message: string;
  error: string | null;
  sessionId: string | null;
  channelName: string | null;
  inviteId: string | null;
  shortUrl: string | null;
  /** Unix ms; Platform Invite expiry (default 5m). */
  inviteExpiresAt: number | null;
  hostRole: string;
  guestRoles: string[];
  /** Number of remote Guests the protocol expects to seat. */
  guestTarget: number;
  seats: HostGuestSeat[];
  /** Protocol metadata (DEC-053 env.HOST mirror). */
  protocolId: string;
  apiVersion: string;
};

type Listener = (s: HostStatus) => void;

export type HostRuntimeDeps = {
  /** Resolve the Host SAM files. */
  getFiles: () => FileMap | null;
  /** Sandbox id of the mounted Host canvas / functions runtime. */
  getSandboxId: () => string | null;
  /** The session protocol this SAM declares (drives seats + answer cap). */
  protocol: HostableProtocol;
  /** Role the local Host occupies (default "host"). */
  hostRole?: string;
  /**
   * Invoke the Host SAM `functions.js` (env.KV-backed). Host authority calls
   * go `/api/session/*`; non-session paths are not forwarded.
   */
  invokeHostSession: (
    path: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ) => Promise<unknown>;
};

/** Host role default when the protocol doesn't declare one. */
const DEFAULT_HOST_ROLE = "host";

function guestTargetFor(protocol: HostableProtocol, hostRole: string): number {
  const roles = protocol.roles?.length ? protocol.roles : ["host", "player"];
  if (protocol.roleLimits) {
    const n = Object.entries(protocol.roleLimits)
      .filter(([r]) => r !== hostRole && roles.includes(r))
      .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
    return n >= 0 ? n : 0;
  }
  return Math.max(0, roles.filter(r => r !== hostRole).length);
}

export function createHostRuntime(deps: HostRuntimeDeps) {
  const hostRole = deps.hostRole?.trim() || DEFAULT_HOST_ROLE;
  const guestRoles = (deps.protocol.roles || []).filter(r => r !== hostRole);
  const guestTarget = guestTargetFor(deps.protocol, hostRole);

  let status: HostStatus = {
    phase: "idle",
    message: "",
    error: null,
    sessionId: null,
    channelName: null,
    inviteId: null,
    shortUrl: null,
    inviteExpiresAt: null,
    hostRole,
    guestRoles,
    guestTarget,
    seats: [],
    protocolId: deps.protocol.protocolId,
    apiVersion: deps.protocol.apiVersion || "1",
  };
  const listeners = new Set<Listener>();
  let loop: ReturnType<typeof startPlatformHostAnswerLoop> | null = null;
  let inviteExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  const localAgentId = `go-host-${crypto.randomUUID().slice(0, 8)}`;
  const seatBoundSent = new Set<string>();
  const sessionInviteSent = new Set<string>();
  /** peerAgentId → session (one DataChannel per connected Guest). */
  const peerSessions = new Map<string, RosterPeerSession>();
  let seq = 0;

  /** Per-answer slot; peerId is resolved from the first presence message. */
  type RelaySlot = {
    peerId: string | null;
    session: RosterPeerSession | null;
    /** From Guest `presence.name`. */
    displayName: string | null;
    /** Idempotent tear-down when Guest closes tab／PC fails. */
    lost?: boolean;
  };
  const slots: RelaySlot[] = [];

  function emit() {
    for (const l of listeners) l({ ...status });
  }
  function set(partial: Partial<HostStatus>) {
    status = { ...status, ...partial };
    if (partial.phase && goSessionChat.connected) {
      const p = partial.phase;
      goSessionChat.setUiPhase(
        p === "active" ? "active" : p === "idle" ? "ended" : "waiting"
      );
    }
    emit();
  }

  function collectChatPeers(): RosterPeerSession[] {
    const seen = new Set<RosterPeerSession>();
    const peers: RosterPeerSession[] = [];
    for (const s of slots) {
      if (s.session && !seen.has(s.session)) {
        seen.add(s.session);
        peers.push(s.session);
      }
    }
    for (const sess of peerSessions.values()) {
      if (!seen.has(sess)) {
        seen.add(sess);
        peers.push(sess);
      }
    }
    return peers;
  }

  function refreshSessionChatPeers(): void {
    const peers = collectChatPeers();
    if (peers.length === 0) {
      if (goSessionChat.connected) goSessionChat.setPeers([]);
      return;
    }
    const broadcast = (msg: Parameters<typeof broadcastSessionChat>[1]) =>
      broadcastSessionChat(peers, msg);
    if (!goSessionChat.connected) {
      goSessionChat.attach({
        localAgentId,
        localName: SESSION_CHAT_HOST_DISPLAY_NAME,
        localRole: "host",
        peers,
        broadcast,
      });
      goSessionChat.setUiPhase(
        status.phase === "active" ? "active" : "waiting"
      );
    } else {
      goSessionChat.setBroadcast(broadcast);
    }
  }

  function sendRelay(payload: Record<string, unknown>, to?: string): void {
    if (to) {
      const sess = peerSessions.get(to);
      if (!sess) return;
      const msg = {
        type: "avatar_relay",
        from: localAgentId,
        to,
        payload,
      };
      try {
        sess.send(msg);
      } catch {
        /* channel may be closed */
      }
      return;
    }
    for (const sess of peerSessions.values()) {
      const msg = { type: "avatar_relay", from: localAgentId, payload };
      try {
        sess.send(msg);
      } catch {
        /* channel may be closed */
      }
    }
  }

  async function hostSessionFetch(
    path: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ): Promise<unknown> {
    if (!deps.getFiles()) throw new Error("Host 小品尚未載入");
    if (!deps.getSandboxId()) throw new Error("Host 沙盒尚未就緒");
    const result = (await deps.invokeHostSession(path, {
      method: init?.method || "GET",
      headers: init?.headers,
      body: init?.body,
    })) as { ok?: boolean; events?: unknown[]; state?: unknown };
    // Mirror play hostSessionDomainFetch: fan out domain events to Guests.
    const events = Array.isArray(result?.events) ? result.events : [];
    if (events.length > 0) publishEvents(events);
    trackPhaseFromState(result?.state);
    return result;
  }

  function publishEvents(events: unknown[]): void {
    for (const event of events) {
      seq += 1;
      const sessionId = status.sessionId;
      if (!sessionId) continue;
      const relay = {
        kind: SESSION_EVENT_KIND,
        sessionId,
        seq,
        event,
      };
      sendRelay(relay);
      if (status.channelName) {
        publishRosterRelayedSessionEvent(status.channelName, relay);
        publishGoMemoryBroadcast(status.channelName, {
          type: "session-event",
          sessionId,
          seq,
          event,
        });
      }
    }
    emit();
  }

  /** Forward a Guest `session_act` to the Host SAM `/api/session/act`. */
  async function forwardGuestAct(
    act: SessionActPayload,
    fromPeerId: string
  ): Promise<{
    ok: boolean;
    result?: unknown;
    error?: { code: string; message: string };
  }> {
    try {
      const seat = status.seats.find(
        candidate =>
          candidate.seatId === act.seatId &&
          candidate.peerId === fromPeerId &&
          candidate.inviteId === act.inviteId
      );
      if (!seat || act.sessionId !== status.sessionId) {
        throw Object.assign(new Error("座位與連線不符"), {
          code: "seat_forbidden",
        });
      }
      const body = {
        role: seat.role,
        seatId: act.seatId,
        payload: act.payload,
      };
      const result = (await hostSessionFetch("/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })) as { ok?: boolean; events?: unknown[]; state?: unknown };
      return { ok: true, result };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: {
          code:
            e && typeof e === "object" && "code" in e
              ? String((e as { code: unknown }).code)
              : "act_rejected",
          message,
        },
      };
    }
  }

  /** Derive a generic phase from the opaque `state.status` the SAM returns. */
  function trackPhaseFromState(state: unknown): void {
    const st =
      state && typeof state === "object"
        ? String((state as { status?: unknown }).status ?? "")
        : "";
    if (!st) return;
    if (st === "active") set({ phase: "active", error: null });
    else if (st === "ended") set({ phase: "ended", error: null });
    else if (st === "ready") set({ phase: "ready", error: null });
    else if (st === "waiting" || st === "open") set({ phase: "waiting", error: null });
  }

  function onRelay(raw: unknown, slot: RelaySlot): void {
    if (!isAvatarRelayMessage(raw)) return;
    const msg = raw;
    if (msg.from === localAgentId) return;
    if (!slot.peerId) slot.peerId = msg.from;
    const payload = msg.payload;
    if (isSessionInviteAcceptPayload(payload)) {
      void handleGuestAccepted(payload, msg.from);
      return;
    }
    if (isSessionActPayload(payload)) {
      void handleGuestAct(payload, msg.from);
      return;
    }
  }

  async function handleGuestAccepted(
    payload: {
      kind: string;
      inviteId: string;
      sessionId: string;
      role?: string;
    },
    fromPeerId: string
  ): Promise<void> {
    if (payload.sessionId !== status.sessionId) {
      sendRelay(
        {
          kind: SESSION_INVITE_REJECT_KIND,
          inviteId: payload.inviteId,
          sessionId: payload.sessionId,
          reason: "session 不符",
        },
        fromPeerId
      );
      return;
    }
    if (seatBoundSent.has(payload.inviteId)) return;
    seatBoundSent.add(payload.inviteId);
    const role = payload.role?.trim() || guestRoles[0] || "player";
    const seatId = `seat-${crypto.randomUUID().slice(0, 8)}`;
    const displayName =
      slots.find(s => s.peerId === fromPeerId)?.displayName || undefined;
    const seat: HostGuestSeat = {
      seatId,
      role,
      peerId: fromPeerId,
      inviteId: payload.inviteId,
      ...(displayName ? { displayName } : {}),
    };
    set({ seats: [...status.seats, seat] });
    sendRelay(
      {
        kind: SESSION_SEAT_BOUND_KIND,
        inviteId: payload.inviteId,
        sessionId: payload.sessionId,
        seatId,
        role,
        channelName: status.channelName,
      },
      fromPeerId
    );
    const filled = status.seats.length;
    const who = displayName || "對手";
    if (guestTarget > 0 && filled >= guestTarget) {
      set({
        phase: "ready",
        message: displayName ? `${displayName} 已入座` : "所有對手已入座",
        error: null,
      });
    } else {
      set({
        message: `${who}已入座（${filled}/${guestTarget} 位對手）`,
        error: null,
      });
    }
    try {
      await hostSessionFetch("/api/session/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerSeated: true, seats: status.seats }),
      });
    } catch {
      /* presence is best-effort */
    }
  }

  async function handleGuestAct(
    act: SessionActPayload,
    fromPeerId: string
  ): Promise<void> {
    const { ok, result, error } = await forwardGuestAct(act, fromPeerId);
    sendRelay(
      buildSessionActResultPayload({
        requestId: act.requestId,
        sessionId: act.sessionId,
        ok,
        result,
        error,
      }),
      fromPeerId
    );
  }

  /**
   * Guest closed the page／DataChannel or PeerConnection failed.
   * Clear seat, update Host chrome, notify SAM presence.
   */
  function handlePeerDisconnected(slot: RelaySlot): void {
    if (slot.lost) return;
    slot.lost = true;
    const peerId = slot.peerId;
    const wasActive = status.phase === "active";
    const who =
      (peerId &&
        (slot.displayName ||
          status.seats.find(s => s.peerId === peerId)?.displayName)) ||
      "對手";
    const removedInviteIds = new Set(
      status.seats
        .filter(s => (peerId ? s.peerId === peerId : false))
        .map(s => s.inviteId)
    );
    if (peerId) {
      peerSessions.delete(peerId);
      sessionInviteSent.delete(peerId);
    }
    for (const inviteId of removedInviteIds) seatBoundSent.delete(inviteId);
    const seats = peerId
      ? status.seats.filter(s => s.peerId !== peerId)
      : status.seats;
    const sess = slot.session;
    slot.session = null;
    if (sess) {
      try {
        sess.close();
      } catch {
        /* ignore */
      }
    }
    refreshSessionChatPeers();
    const message = wasActive
      ? `${who}已離開，這一局結束`
      : `${who}已離開`;
    const nextPhase: HostPhase =
      seats.length === 0 && wasActive && guestTarget === 1
        ? "ended"
        : seats.length === 0 &&
            (status.phase === "ready" ||
              status.phase === "active" ||
              status.phase === "ended")
          ? "waiting"
          : status.phase;
    set({
      seats,
      message,
      error: null,
      phase: nextPhase,
    });
    chromeSession.setFlash(message, 2800);
    if (status.sessionId) {
      void hostSessionFetch("/api/session/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerSeated: seats.length > 0,
          seats,
        }),
      }).catch(() => {
        /* presence is best-effort */
      });
    }
    // Same invite short URL can accept a replacement Guest — only while unexpired.
    const inviteId = status.inviteId;
    const shortUrl = status.shortUrl;
    if (
      inviteId &&
      shortUrl &&
      seats.length < guestTarget &&
      isInviteUnexpired(status.inviteExpiresAt)
    ) {
      void startAnswerLoopForInvite({
        inviteId,
        shortUrl,
        expiresAt: status.inviteExpiresAt ?? undefined,
        useRelay: goAuth.wantsTurnRelay(),
      });
    }
  }

  function relayHandlers(slot: RelaySlot): RosterPeerHandlers {
    return {
      onMessage: (data: unknown) => {
        if (isPresenceMessage(data)) {
          if (!slot.peerId) slot.peerId = data.agentId;
          if (typeof data.name === "string" && data.name.trim()) {
            slot.displayName = data.name.trim();
          }
          if (slot.peerId && slot.session) {
            peerSessions.set(slot.peerId, slot.session);
            refreshSessionChatPeers();
          }
          if (slot.peerId && !status.seats.some(s => s.peerId === slot.peerId)) {
            set({
              message: slot.displayName
                ? `${slot.displayName} 已連線，等待入座…`
                : "有人連上了，等待入座…",
            });
          }
          if (
            slot.peerId &&
            status.sessionId &&
            status.inviteId &&
            !sessionInviteSent.has(slot.peerId)
          ) {
            sessionInviteSent.add(slot.peerId);
            sendRelay(
              buildSessionInvitePayload({
                sessionId: status.sessionId,
                inviteId: status.inviteId,
                role: guestRoles[0] || "player",
                protocol: {
                  protocolId: deps.protocol.protocolId,
                  apiVersion: deps.protocol.apiVersion || "1",
                  roles: [...deps.protocol.roles],
                  roleLimits: deps.protocol.roleLimits
                    ? { ...deps.protocol.roleLimits }
                    : undefined,
                  joinPolicy: "invite_only",
                },
              }),
              slot.peerId
            );
          }
        } else if (isAvatarRelayMessage(data)) {
          onRelay(data, slot);
        } else if (isSessionChatMessage(data)) {
          const toast = goSessionChat.onIncoming(data);
          if (toast) chromeSession.setFlash(toast, 2800);
        }
      },
      onChannelOpen: () => {
        refreshSessionChatPeers();
        set({ message: "已連線，等待對手入座…" });
      },
      onChannelClose: () => {
        handlePeerDisconnected(slot);
      },
      onConnectionState: (state: RTCPeerConnectionState) => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          handlePeerDisconnected(slot);
        }
      },
      onError: (err: Error) => {
        set({ error: err.message, message: "" });
      },
    };
  }

  /** Open the Host session: create a session id / channel in Host SAM. */
  async function open(): Promise<void> {
    const sessionId = `sess-${Math.random().toString(36).slice(2, 10)}`;
    const channelName = `playgrounds-session:${sessionId}`;
    set({
      phase: "open",
      sessionId,
      channelName,
      message: "已開場 — 按「邀請對手」取得短網址",
      error: null,
    });
    try {
      await hostSessionFetch("/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, channelName }),
      });
      set({
        phase: "waiting",
        message: "已開場 — 按「邀請對手」取得短網址",
        error: null,
      });
    } catch (e) {
      set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  function clearInviteExpiryTimer(): void {
    if (inviteExpiryTimer != null) {
      clearTimeout(inviteExpiryTimer);
      inviteExpiryTimer = null;
    }
  }

  /**
   * Invite TTL elapsed: stop answering. If nobody joined, drop invite chrome.
   * Seated peers keep playing; we just won't restart／accept more joins.
   */
  function abandonExpiredInvite(inviteId: string): void {
    if (status.inviteId !== inviteId) return;
    clearInviteExpiryTimer();
    loop?.stop();
    loop = null;
    const joined = status.seats.length > 0 || peerSessions.size > 0;
    if (joined) {
      set({
        message: "邀請連結已過期（已入座對手不受影響）",
        error: null,
      });
      return;
    }
    set({
      inviteId: null,
      shortUrl: null,
      inviteExpiresAt: null,
      message: "邀請已過期，請重新邀請",
      error: null,
    });
    chromeSession.setFlash("邀請已過期", 2800);
    void goAuth.revokePlatformInvite(inviteId).catch(() => {
      /* best-effort */
    });
  }

  function scheduleInviteExpiry(inviteId: string, expiresAt: number): void {
    clearInviteExpiryTimer();
    const delay = Math.max(0, expiresAt - Date.now());
    inviteExpiryTimer = setTimeout(() => {
      inviteExpiryTimer = null;
      abandonExpiredInvite(inviteId);
    }, delay);
  }

  /**
   * Start (or restart) the Platform Host answer loop for `inviteId`. Used both
   * by `mintInviteAndAnswer` and when the Host SAM mints by itself.
   */
  async function startAnswerLoopForInvite(opts: {
    inviteId: string;
    shortUrl: string;
    /** Unix ms; omitted → now + DEFAULT_INVITE_TTL_MS. */
    expiresAt?: number;
    useRelay?: boolean;
  }): Promise<void> {
    const expiresAt =
      typeof opts.expiresAt === "number" && Number.isFinite(opts.expiresAt)
        ? opts.expiresAt
        : Date.now() + DEFAULT_INVITE_TTL_MS;
    if (!isInviteUnexpired(expiresAt)) {
      set({
        inviteId: null,
        shortUrl: null,
        inviteExpiresAt: null,
        message: "邀請已過期，請重新邀請",
        error: null,
      });
      return;
    }
    set({
      inviteId: opts.inviteId,
      shortUrl: opts.shortUrl,
      inviteExpiresAt: expiresAt,
      error: null,
    });
    sessionInviteSent.clear();
    loop?.stop();
    scheduleInviteExpiry(opts.inviteId, expiresAt);
    const apiKey = goAuth.getPlatformApiKeyForHostLoop();
    if (!apiKey) {
      clearInviteExpiryTimer();
      set({ phase: "error", error: "通行證已失效，請重新登入" });
      return;
    }
    loop = startPlatformHostAnswerLoop({
      inviteId: opts.inviteId,
      apiKey,
      useRelay: opts.useRelay === true,
      localPresence: {
        agentId: localAgentId,
        name: SESSION_CHAT_HOST_DISPLAY_NAME,
      },
      prepareHandlers: () => {
        const slot: RelaySlot = {
          peerId: null,
          session: null,
          displayName: null,
        };
        slots.push(slot);
        return {
          handlers: relayHandlers(slot),
          attachSession: (sess: RosterPeerSession) => {
            slot.session = sess;
            if (slot.peerId) peerSessions.set(slot.peerId, sess);
            refreshSessionChatPeers();
          },
        };
      },
      // Accept one answer per expected Guest seat (multi-player protocols).
      maxAnswers: guestTarget > 0 ? guestTarget : 0,
      onStatus: (msg: string) => set({ message: msg }),
      onError: (msg: string) => set({ error: msg, message: "" }),
      onAnswered: async () => {
        set({ message: "握手完成，等待對方入座…" });
      },
      onDone: () => {
        set({ message: "所有人已連上", error: null });
      },
    });
  }

  /**
   * Mint an invite to the opponent(s) and run the Platform Host answer loop.
   * `intent` carries invite.compose (same shape as the author shell).
   */
  async function mintInviteAndAnswer(opts: {
    kind?: string;
    intent?: unknown;
    ttlMs?: number;
  }): Promise<{ inviteId: string; shortUrl: string } | null> {
    if (!status.sessionId || status.phase === "idle") {
      set({ phase: "error", error: "請先開場再邀請" });
      return null;
    }
    try {
      const created = await goAuth.mintPlatformInvite({
        kind: opts.kind || "invite.compose",
        intent: opts.intent,
        ttlMs: opts.ttlMs,
      });
      await startAnswerLoopForInvite({
        inviteId: created.invite_id,
        shortUrl: created.short_url,
        expiresAt: created.expires_at,
        useRelay:
          composeWantsRelay(opts.intent) || goAuth.wantsTurnRelay(),
      });
      return { inviteId: created.invite_id, shortUrl: created.short_url };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: unknown }).code)
          : /通行證|登入|not_provisioned/i.test(message)
            ? "not_provisioned"
            : "error";
      set({ phase: "error", error: message });
      throw Object.assign(new Error(message), { code });
    }
  }

  /** Adopt an invite the Host SAM minted through `/api/shell/platform/invite`. */
  async function adoptSamInvite(opts: {
    inviteId: string;
    shortUrl: string;
    expiresAt?: number;
    useRelay?: boolean;
  }): Promise<void> {
    if (!status.sessionId || status.phase === "idle") {
      set({ phase: "error", error: "請先開場再邀請" });
      return;
    }
    await startAnswerLoopForInvite(opts);
  }

  function stopAnsweringInvite(inviteId: string): void {
    if (!inviteId || status.inviteId !== inviteId) return;
    clearInviteExpiryTimer();
    loop?.stop();
    loop = null;
    set({ message: "已停止接受新對手" });
  }

  /**
   * Host act — forward an opaque protocol payload to the Host SAM and fan out
   * returned events. The framework never interprets `payload`.
   */
  async function hostAct(payload: unknown): Promise<unknown> {
    if (!status.sessionId) throw new Error("尚未開場");
    const result = (await hostSessionFetch("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: hostRole, payload }),
    })) as { ok?: boolean; events?: unknown[]; state?: unknown };
    const events = Array.isArray(result?.events) ? result.events : [];
    if (events.length) publishEvents(events);
    trackPhaseFromState(result?.state);
    return result;
  }

  async function close(): Promise<void> {
    clearInviteExpiryTimer();
    loop?.stop();
    loop = null;
    // Notify remote Guests before tearing DataChannels (mirror play shell).
    if (status.sessionId && peerSessions.size > 0) {
      try {
        publishEvents([{ type: "session.closed", reason: "host_closed" }]);
      } catch {
        /* still close locally */
      }
      if (status.inviteId) {
        sendRelay({
          kind: SESSION_INVITE_CANCEL_KIND,
          inviteId: status.inviteId,
          sessionId: status.sessionId,
        });
      }
    }
    for (const sess of peerSessions.values()) {
      try {
        sess.close();
      } catch {
        /* ignore */
      }
    }
    peerSessions.clear();
    sessionInviteSent.clear();
    if (status.inviteId) {
      try {
        await goAuth.revokePlatformInvite(status.inviteId);
      } catch {
        /* best-effort */
      }
    }
    if (status.sessionId) {
      try {
        await hostSessionFetch("/api/session/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playerSeated: false, seats: [] }),
        });
      } catch {
        /* ignore */
      }
    }
    set({
      phase: "idle",
      message: "已結束邀請場",
      error: null,
      sessionId: null,
      channelName: null,
      inviteId: null,
      shortUrl: null,
      inviteExpiresAt: null,
      seats: [],
    });
    goSessionChat.detach();
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener({ ...status });
    return () => listeners.delete(listener);
  }

  return {
    subscribe,
    getStatus: () => ({ ...status }),
    open,
    mintInviteAndAnswer,
    adoptSamInvite,
    stopAnsweringInvite,
    /** Generic opaque host act (framework never inspects payload). */
    act: hostAct,
    hostSessionFetch,
    close,
    dispose() {
      clearInviteExpiryTimer();
      loop?.stop();
      loop = null;
      goSessionChat.detach();
      for (const sess of peerSessions.values()) {
        try {
          sess.close();
        } catch {
          /* ignore */
        }
      }
      peerSessions.clear();
      sessionInviteSent.clear();
    },
  };
}

export type HostRuntime = ReturnType<typeof createHostRuntime>;
