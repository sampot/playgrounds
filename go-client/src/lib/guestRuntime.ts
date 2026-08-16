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
import { assertSamHasIndex, loadSamFiles } from "./samLoad";
import {
  applyRosterAnswer,
  createRosterOffer,
  isAvatarRelayMessage,
  isPresenceMessage,
  type RosterPeerSession,
  type RosterPresenceMsg,
} from "@pg/roster/rosterPeer";
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
  };
  const listeners = new Set<Listener>();
  let localAgentId = newAgentId();
  let sandboxId: string | null = null;
  let generation = 1;
  let samFiles: FileMap | null = null;
  let canvasMode: GuestCanvasMode | null = null;
  let memoryBlobUrls: string[] = [];
  let peerSession: RosterPeerSession | null = null;
  let peerAgentId: string | null = null;
  let composeProtocolId: string | null = null;
  let pendingInvite: SessionInvitePayload | null = null;
  let accepted = false;
  let unlistenApi: (() => void) | null = null;
  let homeSandboxByInvite = new Map<string, string>();
  let tunnelChannelBySession = new Map<string, string>();

  function clearMemoryBlobs() {
    if (memoryBlobUrls.length) {
      revokeGoMemoryBlobs(memoryBlobUrls);
      memoryBlobUrls = [];
    }
  }

  function buildMemorySrcdoc(): string {
    if (!samFiles) throw new Error("小品尚未載入");
    clearMemoryBlobs();
    const built = buildGoMemoryCanvas(samFiles, generation);
    memoryBlobUrls = built.blobUrls;
    return built.srcdoc;
  }

  /**
   * Remount canvas after seat_bound so SAM re-probes `/api/session/seat`
   * (gomoku tryBootAsPlayer is one-shot at boot).
   */
  async function remountCanvasAfterSeat(): Promise<
    Partial<GuestStatus> | null
  > {
    if (!sandboxId || !samFiles || !canvasMode) return null;
    generation += 1;
    if (canvasMode === "memory") {
      const srcdoc = buildMemorySrcdoc();
      return {
        canvasMode: "memory",
        canvasSrcdoc: srcdoc,
        canvasUrl: null,
        canvasGeneration: generation,
      };
    }
    await syncGoCanvasSnapshot(sandboxId, generation, samFiles);
    return {
      canvasMode: "sw",
      canvasUrl: canvasEntryUrl(sandboxId, generation),
      canvasSrcdoc: null,
      canvasGeneration: generation,
    };
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
      status.phase === "cancelled" ||
      status.phase === "idle"
    ) {
      return;
    }
    pendingInvite = null;
    composeProtocolId = null;
    accepted = false;
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
      canvasGeneration: 0,
      loadProgress: null,
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
    accepted = true;
    composeProtocolId = null;
    void acceptInvite(peer);
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
      const event =
        payload.event && typeof payload.event === "object"
          ? (payload.event as { type?: unknown; reason?: unknown })
          : null;
      if (
        event &&
        (event.type === "session.closed" || event.type === "match.closed")
      ) {
        markHostEnded(
          event.reason === "host_closed"
            ? "主持已結束這一場"
            : "這一場已結束"
        );
      }
    }
  }

  async function bootFromShortId(shortId: string): Promise<void> {
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
      try {
        const n = localStorage.getItem("playgrounds-roster-display-name");
        if (n?.trim()) status.displayName = n.trim();
      } catch {
        /* ignore */
      }
      set({
        phase: "consent",
        meta,
        message: "請確認加入",
        displayName: status.displayName,
      });
    } catch (e) {
      set({
        phase: "error",
        error: friendlyInviteError(e),
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
    const name = displayName.trim() || "對手";
    try {
      localStorage.setItem("playgrounds-roster-display-name", name);
    } catch {
      /* ignore */
    }
    set({ displayName: name, error: null });

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
      message: "正在下載小品…",
      loadProgress: { ratio: null, detail: "準備中…" },
    });
    try {
      const files = await loadSamFiles(source, {
        onProgress: p => {
          const loadProgress = goLoadProgressFromFiles(p);
          set({
            loadProgress,
            message: `正在下載小品… ${loadProgress.detail}`,
          });
        },
      });
      assertSamHasIndex(files);
      set({
        loadProgress: { ratio: 1, detail: "下載完成" },
        message: "小品已下載，正在準備…",
      });
      sandboxId = `go-guest-${crypto.randomUUID().slice(0, 8)}`;
      samFiles = files;
      generation += 1;
      unlistenApi?.();
      clearMemoryBlobs();

      const apiCtx = {
        getSandboxId: () => sandboxId,
        getFiles: () => samFiles,
        getCatalogId: () => null as string | null,
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
            }
          },
          onChannelOpen: () => {
            set({
              phase: "waiting_invite",
              message: "已連線，等待主持邀請入座…",
            });
          },
          onChannelClose: () => {
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
    bootFromShortId,
    consentAndPlay,
    decline,
    setDisplayName(name: string) {
      set({ displayName: name });
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
    __testOnChannelClose() {
      markHostEnded("主持已結束連線");
    },
  };
}

export type GuestRuntime = ReturnType<typeof createGuestRuntime>;
