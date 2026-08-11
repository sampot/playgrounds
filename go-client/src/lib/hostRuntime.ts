/**
 * Pure-play Host runtime (GO-INVITE): a logged-in go player hosts a `gomoku.v1`
 * session from within the go-client and invites an opponent.
 *
 * Host authority lives in the Host SAM's `functions.js` (pg-gomoku) via go's
 * `env.KV` (goWebKv, `catalog:<id>`) — mirroring the author shell's session
 * engine but without the full sessionRuntime machinery. The Host:
 *  1. runs the Platform Host answer loop (`startPlatformHostAnswerLoop`) to
 *     accept the guest's WebRTC offer,
 *  2. dispatches guest relay (accept → seat_bound; act → Host SAM act; events →
 *     fan out to the guest),
 *  3. exposes go-page controls (open / start / place / reset / close).
 *
 * The memory field API key never leaves page memory; it is only handed to the
 * trusted Host answer loop (never injected into the SAM env).
 */

import {
  isAvatarRelayMessage,
  isPresenceMessage,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import {
  SESSION_EVENT_KIND,
  SESSION_INVITE_REJECT_KIND,
  SESSION_SEAT_BOUND_KIND,
  isSessionActPayload,
  isSessionInviteAcceptPayload,
  type SessionActPayload,
} from "@pg/roster/rosterSessionBridge";
import { buildSessionActResultPayload } from "@pg/roster/rosterSessionActTunnel";
import { startPlatformHostAnswerLoop } from "@pg/platform/platformHostLoop";
import { goAuth } from "./goAuth.svelte";
import type { FileMap } from "@pg/projectTypes";

export type HostPhase =
  | "idle"
  | "open"
  | "waiting"
  | "ready"
  | "active"
  | "ended"
  | "error";

export type HostStatus = {
  phase: HostPhase;
  message: string;
  error: string | null;
  sessionId: string | null;
  channelName: string | null;
  inviteId: string | null;
  shortUrl: string | null;
  playerSeated: boolean;
  firstRole: "host" | "player" | null;
};

type Listener = (s: HostStatus) => void;

export type HostRuntimeDeps = {
  /** Resolve the Host SAM files (pg-gomoku). */
  getFiles: () => FileMap | null;
  /** Sandbox id of the mounted Host canvas / functions runtime. */
  getSandboxId: () => string | null;
  /**
   * Invoke the Host SAM `functions.js` (env.KV-backed). Host authority calls
   * go `/api/session/*`; non-session paths are not forwarded.
   */
  invokeHostSession: (
    path: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ) => Promise<unknown>;
};

export function createHostRuntime(deps: HostRuntimeDeps) {
  let status: HostStatus = {
    phase: "idle",
    message: "",
    error: null,
    sessionId: null,
    channelName: null,
    inviteId: null,
    shortUrl: null,
    playerSeated: false,
    firstRole: null,
  };
  const listeners = new Set<Listener>();
  let loop: ReturnType<typeof startPlatformHostAnswerLoop> | null = null;
  let peerSession: RosterPeerSession | null = null;
  const localAgentId = `go-host-${crypto.randomUUID().slice(0, 8)}`;
  let playerPeerId: string | null = null;
  const seatBoundSent = new Set<string>();
  let seq = 0;

  function emit() {
    for (const l of listeners) l({ ...status });
  }
  function set(partial: Partial<HostStatus>) {
    status = { ...status, ...partial };
    emit();
  }

  function sendRelay(payload: Record<string, unknown>, to?: string): void {
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

  async function hostSessionFetch(
    path: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  ): Promise<unknown> {
    if (!deps.getFiles()) throw new Error("Host 小品尚未載入");
    if (!deps.getSandboxId()) throw new Error("Host 沙盒尚未就緒");
    return deps.invokeHostSession(path, {
      method: init?.method || "GET",
      headers: init?.headers,
      body: init?.body,
    });
  }

  function publishEvents(events: unknown[]): void {
    for (const event of events) {
      seq += 1;
      sendRelay(
        {
          kind: SESSION_EVENT_KIND,
          sessionId: status.sessionId,
          seq,
          event,
        },
        playerPeerId || undefined
      );
    }
    emit();
  }

  /** Forward a guest `session_act` to the Host SAM `/api/session/act`. */
  async function forwardGuestAct(act: SessionActPayload): Promise<{
    ok: boolean;
    result?: unknown;
    error?: { code: string; message: string };
  }> {
    try {
      const body = {
        role: "player",
        seatId: act.seatId,
        payload: act.payload,
      };
      const result = (await hostSessionFetch("/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })) as { ok?: boolean; events?: unknown[] };
      const events = Array.isArray(result?.events) ? result.events : [];
      if (events.length > 0) publishEvents(events);
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

  function onRelay(raw: unknown): void {
    if (!isAvatarRelayMessage(raw)) return;
    const msg = raw;
    if (msg.from === localAgentId) return;
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
    playerPeerId = fromPeerId;
    const seatId = `seat-${crypto.randomUUID().slice(0, 8)}`;
    sendRelay(
      {
        kind: SESSION_SEAT_BOUND_KIND,
        inviteId: payload.inviteId,
        sessionId: payload.sessionId,
        seatId,
        role: payload.role || "player",
        channelName: status.channelName,
      },
      fromPeerId
    );
    set({
      phase: "ready",
      playerSeated: true,
      message: "對手已入座 — 選誰先再按「開始」",
      error: null,
    });
    try {
      await hostSessionFetch("/api/session/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerSeated: true }),
      });
    } catch {
      /* presence is best-effort */
    }
  }

  async function handleGuestAct(
    act: SessionActPayload,
    fromPeerId: string
  ): Promise<void> {
    if (fromPeerId !== playerPeerId) return;
    const { ok, result, error } = await forwardGuestAct(act);
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

  function relayHandlers(): RosterPeerHandlers {
    return {
      onMessage: (data: unknown) => {
        if (isPresenceMessage(data)) {
          if (!playerPeerId) playerPeerId = data.agentId;
        } else if (isAvatarRelayMessage(data)) {
          onRelay(data);
        }
      },
      onChannelOpen: () => {
        set({ message: "已連線，等待對手入座…" });
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
      playerSeated: false,
      firstRole: "host",
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

  /**
   * Start (or restart) the Platform Host answer loop for `inviteId`. Used both
   * by `mintInviteAndAnswer` and when the Host SAM mints by itself (its own CTA
   * calls `/api/shell/platform/invite`, which go proxies — the page then adopts
   * the minted invite here and runs the answer side).
   */
  async function startAnswerLoopForInvite(opts: {
    inviteId: string;
    shortUrl: string;
  }): Promise<void> {
    set({
      inviteId: opts.inviteId,
      shortUrl: opts.shortUrl,
      error: null,
    });
    loop?.stop();
    const apiKey = goAuth.getPlatformApiKeyForHostLoop();
    if (!apiKey) {
      set({ phase: "error", error: "通行證已失效，請重新登入" });
      return;
    }
    loop = startPlatformHostAnswerLoop({
      inviteId: opts.inviteId,
      apiKey,
      localPresence: { agentId: localAgentId, name: "玩家 A" },
      prepareHandlers: () => {
        const slot: { s: RosterPeerSession | null } = { s: null };
        return {
          handlers: relayHandlers(),
          attachSession: (sess: RosterPeerSession) => {
            slot.s = sess;
            peerSession = sess;
          },
        };
      },
      maxAnswers: 1,
      onStatus: (msg: string) => set({ message: msg }),
      onError: (msg: string) => set({ error: msg, message: "" }),
      onAnswered: async () => {
        set({ message: "握手完成，等待對方入座…" });
      },
      onDone: () => {
        set({ message: "對方已連上", error: null });
      },
    });
  }

  /**
   * Mint an invite to the opponent and run the Platform Host answer loop.
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
  }): Promise<void> {
    if (!status.sessionId || status.phase === "idle") {
      set({ phase: "error", error: "請先開場再邀請" });
      return;
    }
    await startAnswerLoopForInvite(opts);
  }

  /** Host act (start/place/reset) — forward to Host SAM, fan out events. */
  async function hostAct(
    payload: { type: string } & Record<string, unknown>
  ): Promise<unknown> {
    if (!status.sessionId) throw new Error("尚未開場");
    const result = (await hostSessionFetch("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "host", payload }),
    })) as { ok?: boolean; events?: unknown[]; state?: unknown };
    const events = Array.isArray(result?.events) ? result.events : [];
    if (events.length) publishEvents(events);
    return result;
  }

  async function start(firstRole: "host" | "player"): Promise<void> {
    set({ message: "開始中…" });
    await hostAct({ type: "start", firstRole });
    set({ phase: "active", firstRole, message: "對局開始", error: null });
  }

  async function place(row: number, col: number): Promise<void> {
    await hostAct({ type: "place", row, col });
  }

  async function reset(firstRole?: "host" | "player"): Promise<void> {
    const role = firstRole || status.firstRole || "host";
    const result = (await hostAct({ type: "reset", firstRole: role })) as {
      state?: { status?: string };
    };
    const st = result?.state?.status;
    set({
      phase:
        st === "ended"
          ? "ended"
          : st === "active"
            ? "active"
            : st === "ready"
              ? "ready"
              : "waiting",
      firstRole: role,
      message:
        st === "active" ? "已開下一局" : "棋盤已清空 — 等候對手入座",
      error: null,
    });
  }

  async function close(): Promise<void> {
    loop?.stop();
    loop = null;
    if (peerSession) {
      try {
        peerSession.close();
      } catch {
        /* ignore */
      }
      peerSession = null;
    }
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
          body: JSON.stringify({ playerSeated: false }),
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
      playerSeated: false,
      firstRole: null,
    });
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
    start,
    place,
    reset,
    close,
    dispose() {
      loop?.stop();
      loop = null;
      if (peerSession) {
        try {
          peerSession.close();
        } catch {
          /* ignore */
        }
        peerSession = null;
      }
    },
  };
}

export type HostRuntime = ReturnType<typeof createHostRuntime>;
