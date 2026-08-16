<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import {
    ensureCanvasServiceWorker,
    syncCanvasSnapshot,
  } from "../canvasSw";
  import { buildCanvasEntryUrl } from "../canvasSwProtocol";
  import { applyIframeColorScheme } from "../playgroundsTheme";
  import type { FileMap } from "../projectTypes";
  import { SESSION_PARTICIPANT_DEFAULT_ROLE } from "../sessionParticipantStarter";
  import {
    acceptRosterOffer,
    applyRosterAnswer,
    createRosterOffer,
    decodeRosterQrFromBlob,
    encodeRosterQrPngDataUrl,
    isAvatarRelayMessage,
    isPresenceMessage,
    isSessionInviteAcceptPayload,
    isSessionInviteCancelPayload,
    isSessionInvitePayload,
    isSessionInviteRejectPayload,
    isSessionSeatBoundPayload,
    isSessionActPayload,
    isSessionActResultPayload,
    isSessionEventRelayPayload,
    listRosterAvatars,
    clearRosterAvatars,
    removeRosterAvatar,
    subscribeRosterAvatars,
    upsertRosterAvatar,
    setRosterAvatarSandboxId,
    spawnRosterAvatarProjection,
    teardownRosterAvatarProjection,
    ROSTER_AVATAR_BRIDGE,
    SESSION_INVITE_ACCEPT_KIND,
    SESSION_INVITE_CANCEL_KIND,
    SESSION_INVITE_REJECT_KIND,
    registerRosterRelayTransport,
    subscribeRosterSessionHub,
    inviteRosterAvatarToSession,
    notifyRosterInviteAccepted,
    notifyRosterRemoteAct,
    notifyRosterHomeSeatReady,
    rosterCanInviteToSession,
    getRosterProjectionSandboxId,
    createRosterSessionTunnelBridge,
    publishRosterRelayedSessionEvent,
    applySessionActResultFromRelay,
    bindingFromSeatBound,
    materializeRosterInviteSeat,
    buildRosterInviteUrl,
    extractRosterWireFromText,
    parseRosterInviteFromLocation,
    clearRosterInviteHashFromLocation,
    startRosterCameraQrScan,
    rosterCameraScanSupported,
    type RosterAvatarRelayMsg,
    type RosterAvatarStub,
    type RosterPeerHandlers,
    type RosterPeerSession,
    type SessionInvitePayload,
    type RosterCameraScanStop,
  } from "./index";
  import { registerSessionBridge } from "../sessionBridge";
  import {
    createJoin,
    fetchGuestTurnIceServers,
    platformFieldLoginUrl,
    postOfferAndWaitAnswer,
    previewInvite,
    revokePlatformInvite,
    type InviteMeta,
  } from "../platform/platformClient";
  import { hostCreatePlatformInvite } from "../platform/platformHostProxy";
  import {
    getPlatformFieldApiKey,
    subscribePlatformFieldCredential,
  } from "../platform/platformFieldCredential";
  import { wantsRosterSignal } from "../platform/platformCompose";
  import { getPlatformComposeShell } from "../platform/platformComposeShell";
  import { registerPlatformInviteShell } from "../platform/platformInviteShell";
  import { startPlatformHostAnswerLoop } from "../platform/platformHostLoop";
  import { presentPlatformInviteShare } from "../platform/platformInviteShareShell";
  import { registerPlatformGuestJoinBridge } from "../platform/platformGuestJoinBridge";
  import { resolvePlatformInviteSecretFromText } from "../platform/platformInviteUrl";
  const btn =
    "inline-flex items-center justify-center rounded-md border border-skin-line bg-skin-card px-2 py-1 text-xs font-medium text-skin-base transition hover:bg-skin-card disabled:opacity-40";
  const inputCls =
    "border-skin-line bg-skin-fill text-skin-base w-full rounded border px-2 py-1.5 font-mono text-[11px]";

  let lan = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let status = $state<string | null>(null);

  /** Wire payloads (internal); UI calls them 邀請／回覆. */
  let inviteWire = $state("");
  let replyWire = $state("");
  let inviteQrUrl = $state<string | null>(null);
  let replyQrUrl = $state<string | null>(null);
  let pasteInvite = $state("");
  let pasteReply = $state("");

  let session = $state<RosterPeerSession | null>(null);
  /** Platform Ticket peers (DEC-047); OOB still uses `session`. */
  let platformByPeer = $state(new Map<string, RosterPeerSession>());
  let platformHostLoop = $state<{ stop: () => void; inviteId: string } | null>(
    null
  );
  /** Roster-only Platform invite shown inline (QR + paste text) while waiting. */
  let platformConnInvite = $state<{
    inviteId: string;
    shareText: string;
    qrUrl: string | null;
    expiresLabel: string | null;
  } | null>(null);
  /** After shell compose consent, auto-accept matching session_invite once. */
  let composeConsentProtocolId = $state<string | null>(null);
  let autoInvitedPeerId: string | null = null;
  let unregInviteShell: (() => void) | null = null;
  let unregGuestJoin: (() => void) | null = null;
  let avatars = $state<RosterAvatarStub[]>([]);
  let localName = $state("我");
  let peerAgentId = $state<string | null>(null);
  /** Exchange panels: shown only after CTA (or deep-link); hidden when connected. */
  let startOpen = $state(false);
  let joinOpen = $state(false);
  /** Logged-in users: OOB join is separate from Platform paste join. */
  let oobJoinOpen = $state(false);
  /** Logged-in: collapse OOB wire exchange behind advanced. */
  let advancedOobOpen = $state(false);
  let platformLoggedIn = $state(Boolean(getPlatformFieldApiKey()));
  let unsubPlatformCred: (() => void) | null = null;

  let pendingIncoming = $state<SessionInvitePayload | null>(null);
  let outboundInviteId = $state<string | null>(null);
  let outboundSessionId = $state<string | null>(null);
  let canInvite = $state(false);
  let inviteBusy = $state(false);
  /** Offer wire arrived via `#roster=` — confirm before joining. */
  let pendingLinkOffer = $state<string | null>(null);
  let cameraSupported = $state(false);
  let cameraScanning = $state<"invite" | "reply" | null>(null);
  let scanVideoEl = $state<HTMLVideoElement | null>(null);
  let stopCameraScan: RosterCameraScanStop | null = null;
  /** inviteId → homePeer participant sandbox (accept path). */
  const homeSandboxByInvite = new Map<string, string>();
  /** sessionId → BroadcastChannel name for relayed events. */
  const tunnelChannelBySession = new Map<string, string>();
  /** inviteId → seatId for tunnel bridge teardown. */
  const tunnelSeatByInvite = new Map<string, string>();

  const localAgentId = (() => {
    try {
      const key = "playgrounds-roster-agent-id";
      let id = sessionStorage.getItem(key);
      if (!id) {
        id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `roster-${Date.now().toString(36)}`;
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch {
      return `roster-${Date.now().toString(36)}`;
    }
  })();

  let unsub: (() => void) | null = null;
  let unsubHub: (() => void) | null = null;
  let unregTransport: (() => void) | null = null;
  let canvasSwReady = false;
  const iframeByAgent = new Map<string, HTMLIFrameElement>();
  const filesByAgent = new Map<string, FileMap>();
  const generationByAgent = new Map<string, number>();
  const mountingAgents = new Set<string>();

  function refreshCanInvite(): void {
    canInvite = rosterCanInviteToSession();
  }

  function openStartPanel(): void {
    if (cameraScanning === "invite") stopLiveCameraScan();
    joinOpen = false;
    oobJoinOpen = false;
    startOpen = true;
    if (platformLoggedIn) advancedOobOpen = true;
    error = null;
  }

  function openJoinPanel(): void {
    if (cameraScanning === "reply") stopLiveCameraScan();
    startOpen = false;
    oobJoinOpen = false;
    joinOpen = true;
    error = null;
  }

  function openOobJoinPanel(): void {
    if (cameraScanning === "reply") stopLiveCameraScan();
    startOpen = false;
    joinOpen = false;
    oobJoinOpen = true;
    advancedOobOpen = true;
    error = null;
  }

  function closeExchangePanels(): void {
    stopLiveCameraScan();
    startOpen = false;
    joinOpen = false;
    oobJoinOpen = false;
  }

  onMount(() => {
    avatars = listRosterAvatars();
    unsub = subscribeRosterAvatars(() => {
      avatars = listRosterAvatars();
    });
    unsubHub = subscribeRosterSessionHub(() => {
      refreshCanInvite();
      if (peerAgentId) maybeAutoInviteRoster(peerAgentId);
    });
    platformLoggedIn = Boolean(getPlatformFieldApiKey());
    unsubPlatformCred = subscribePlatformFieldCredential(() => {
      platformLoggedIn = Boolean(getPlatformFieldApiKey());
    });
    unregTransport = registerRosterRelayTransport({
      send: (payload, to) => sendAvatarRelay(payload, to),
      getPeerAgentId: () => {
        const connected = listRosterAvatars().find(
          a => a.connectionState === "connected"
        );
        return connected?.agentId ?? peerAgentId;
      },
      getProjectionSandboxId: id =>
        listRosterAvatars().find(a => a.agentId === id)?.sandboxId,
    });
    refreshCanInvite();
    try {
      const n = localStorage.getItem("playgrounds-roster-display-name");
      if (n) localName = n;
    } catch {
      /* ignore */
    }
    window.addEventListener("message", onWindowMessage);
    cameraSupported = rosterCameraScanSupported();
    consumeRosterInviteHash();
    unregInviteShell = registerPlatformInviteShell({
      mintAndAnswer: opts => mintPlatformInviteAndAnswer(opts),
      stopAnswering: inviteId => {
        if (platformHostLoop?.inviteId !== inviteId) return;
        platformHostLoop.stop();
        platformHostLoop = null;
        platformConnInvite = null;
        status = "已停止等待對方連線";
      },
      getPreferSeatSandboxId: () =>
        getPlatformComposeShell()?.getActiveSandboxId?.() ?? null,
    });
    // Product consent UI is shell modal; this bridge is WebRTC／入座 only.
    unregGuestJoin = registerPlatformGuestJoinBridge({
      setLocalDisplayName: name => {
        localName = name.trim() || "對手";
        persistName();
      },
      joinTicket: async opts => {
        const protoId = opts.composeProtocolId?.trim();
        if (protoId) composeConsentProtocolId = protoId;
        error = null;
        status = "正在與主持握手…";
        await runPlatformTicketJoin(opts.secret, opts.meta);
        status =
          opts.meta.kind === "invite.compose" || protoId
            ? "連線完成，等待入座…"
            : "連線完成";
      },
    });
  });

  function consumeRosterInviteHash(): void {
    // OOB `#roster=` Avatars-tab UX cancelled — clear hash only.
    // Session invite／join is SAM + Shell (Platform `#pg=`).
    const parsed = parseRosterInviteFromLocation({
      hash: window.location.hash,
      search: window.location.search,
    });
    if (!parsed) return;
    clearRosterInviteHashFromLocation();
  }

  onDestroy(() => {
    unregInviteShell?.();
    unregInviteShell = null;
    unregGuestJoin?.();
    unregGuestJoin = null;
    unsubPlatformCred?.();
    unsubPlatformCred = null;
    stopLiveCameraScan();
    platformHostLoop?.stop();
    platformHostLoop = null;
    platformConnInvite = null;
    for (const s of platformByPeer.values()) {
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    platformByPeer = new Map();
    unsub?.();
    unsubHub?.();
    unregTransport?.();
    window.removeEventListener("message", onWindowMessage);
    void teardownAllProjections();
    session?.close();
  });

  function persistName(): void {
    try {
      localStorage.setItem(
        "playgrounds-roster-display-name",
        localName.trim() || "我"
      );
    } catch {
      /* ignore */
    }
  }

  function resetExchangeUi(): void {
    inviteWire = "";
    replyWire = "";
    inviteQrUrl = null;
    replyQrUrl = null;
    pasteInvite = "";
    pasteReply = "";
  }

  async function teardownSandboxIds(ids: string[]): Promise<void> {
    for (const id of ids) {
      await teardownRosterAvatarProjection(id);
    }
  }

  async function teardownAllProjections(): Promise<void> {
    clearHomeSessionTunnels();
    const ids = clearRosterAvatars();
    iframeByAgent.clear();
    filesByAgent.clear();
    generationByAgent.clear();
    mountingAgents.clear();
    pendingIncoming = null;
    outboundInviteId = null;
    outboundSessionId = null;
    await teardownSandboxIds(ids);
    refreshCanInvite();
  }

  function closeSession(): void {
    session?.close();
    session = null;
    refreshCanInvite();
  }

  function localPresence() {
    return {
      agentId: localAgentId,
      name: localName.trim() || "我",
    };
  }

  function postRelayToIframe(
    agentId: string,
    payload: RosterAvatarRelayMsg["payload"]
  ): void {
    const el = iframeByAgent.get(agentId);
    el?.contentWindow?.postMessage(
      {
        type: ROSTER_AVATAR_BRIDGE,
        action: "relay",
        peerAgentId: agentId,
        payload,
      },
      "*"
    );
  }

  function sendAvatarRelay(
    payload: RosterAvatarRelayMsg["payload"],
    to?: string
  ): void {
    const msg: RosterAvatarRelayMsg = {
      type: "avatar_relay",
      from: localAgentId,
      ...(to ? { to } : {}),
      payload,
    };
    const targets: RosterPeerSession[] = [];
    if (to) {
      const plat = platformByPeer.get(to);
      if (plat) targets.push(plat);
      else if (session && peerAgentId === to) targets.push(session);
    } else {
      if (session) targets.push(session);
      for (const s of platformByPeer.values()) targets.push(s);
    }
    for (const s of targets) {
      try {
        s.send(msg);
      } catch (e) {
        error = friendlyError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  function onWindowMessage(ev: MessageEvent): void {
    const data = ev.data;
    if (!data || data.type !== ROSTER_AVATAR_BRIDGE) return;
    const peerId =
      typeof data.peerAgentId === "string" ? data.peerAgentId : null;
    if (!peerId) return;
    if (data.action === "ping") {
      sendAvatarRelay({ kind: "ping", at: Date.now() }, peerId);
    } else if (data.action === "pong") {
      sendAvatarRelay({ kind: "pong", at: Date.now() }, peerId);
    }
  }

  async function mountAvatarIframe(
    agentId: string,
    el: HTMLIFrameElement
  ): Promise<void> {
    const files = filesByAgent.get(agentId);
    const stub = listRosterAvatars().find(a => a.agentId === agentId);
    if (!files || !stub?.sandboxId) return;
    if (mountingAgents.has(agentId)) return;
    mountingAgents.add(agentId);
    try {
      if (!canvasSwReady) {
        await ensureCanvasServiceWorker();
        canvasSwReady = true;
      }
      const generation = (generationByAgent.get(agentId) ?? 0) + 1;
      generationByAgent.set(agentId, generation);
      await syncCanvasSnapshot(stub.sandboxId, generation, files);
      applyIframeColorScheme(el);
      el.src = buildCanvasEntryUrl(stub.sandboxId, generation);
    } catch (e) {
      console.error("[roster avatar]", agentId, e);
      error =
        e instanceof Error
          ? `對方畫面載入失敗：${e.message}`
          : `對方畫面載入失敗：${String(e)}`;
    } finally {
      mountingAgents.delete(agentId);
    }
  }

  function avatarFrameAction(node: HTMLIFrameElement, agentId: string) {
    iframeByAgent.set(agentId, node);
    void mountAvatarIframe(agentId, node);
    return {
      destroy() {
        iframeByAgent.delete(agentId);
      },
    };
  }

  async function onRemotePresence(data: {
    agentId: string;
    name: string;
  }): Promise<void> {
    if (data.agentId === localAgentId) return;
    peerAgentId = data.agentId;
    const stub = upsertRosterAvatar({
      agentId: data.agentId,
      name: data.name,
      connectionState: "connected",
    });
    status = `已與「${data.name}」連上`;
    resetExchangeUi();
    closeExchangePanels();
    error = null;
    refreshCanInvite();

    // Host must have a projection sandbox before sending session_invite —
    // otherwise onRosterInviteAccepted cannot seat the peer.
    if (!stub.sandboxId) {
      try {
        const spawned = await spawnRosterAvatarProjection({
          agentId: data.agentId,
          name: data.name,
          identiconUrl: stub.identiconUrl,
        });
        filesByAgent.set(data.agentId, spawned.files);
        setRosterAvatarSandboxId(data.agentId, spawned.sandboxId);
        const el = iframeByAgent.get(data.agentId);
        if (el) await mountAvatarIframe(data.agentId, el);
      } catch (e) {
        console.error("[roster avatar spawn]", e);
        error =
          e instanceof Error
            ? `無法建立對方畫面：${e.message}`
            : `無法建立對方畫面：${String(e)}`;
        return;
      }
    }
    maybeAutoInviteRoster(data.agentId);
    tryComposeAutoAccept(data.agentId);
  }

  /** Compose guest: auto-accept matching session_invite once peer id is known. */
  function tryComposeAutoAccept(fromPeerId?: string): void {
    if (!composeConsentProtocolId || !pendingIncoming) return;
    if (pendingIncoming.protocol.protocolId !== composeConsentProtocolId) {
      return;
    }
    const peer = fromPeerId || peerAgentId;
    if (!peer) return;
    composeConsentProtocolId = null;
    void acceptIncomingInvite(peer);
  }

  function clearHomeSessionTunnels(): void {
    for (const [inviteId, seatId] of tunnelSeatByInvite) {
      const sandboxId = homeSandboxByInvite.get(inviteId);
      if (sandboxId) registerSessionBridge(seatId, sandboxId, null);
    }
    tunnelSeatByInvite.clear();
    tunnelChannelBySession.clear();
    homeSandboxByInvite.clear();
  }

  function onAvatarRelay(msg: RosterAvatarRelayMsg): void {
    if (msg.from === localAgentId) return;
    const payload = msg.payload;
    if (isSessionInvitePayload(payload)) {
      pendingIncoming = payload;
      if (!peerAgentId) peerAgentId = msg.from;
      status = `收到 session 邀請（${payload.protocol.protocolId}）`;
      tryComposeAutoAccept(msg.from);
      return;
    }
    if (isSessionInviteAcceptPayload(payload)) {
      if (outboundInviteId && payload.inviteId !== outboundInviteId) return;
      outboundInviteId = null;
      outboundSessionId = null;
      status = "對方已接受入座邀請";
      notifyRosterInviteAccepted({
        peerAgentId: msg.from,
        inviteId: payload.inviteId,
        sessionId: payload.sessionId,
        role: payload.role,
        homeSandboxId: payload.homeSandboxId,
      });
      return;
    }
    if (isSessionInviteRejectPayload(payload)) {
      if (outboundInviteId && payload.inviteId !== outboundInviteId) return;
      outboundInviteId = null;
      outboundSessionId = null;
      status = payload.reason
        ? `對方拒絕入座：${payload.reason}`
        : "對方拒絕入座邀請";
      return;
    }
    if (isSessionInviteCancelPayload(payload)) {
      if (pendingIncoming?.inviteId === payload.inviteId) {
        pendingIncoming = null;
        status = "對方已取消入座邀請";
      }
      return;
    }
    if (isSessionSeatBoundPayload(payload)) {
      const homeSandboxId = homeSandboxByInvite.get(payload.inviteId);
      if (!homeSandboxId) {
        status = "收到入座確認，但本機參與畫面遺失";
        return;
      }
      const binding = bindingFromSeatBound(
        payload,
        homeSandboxId,
        msg.from
      );
      const bridge = createRosterSessionTunnelBridge({
        binding,
        send: (act, to) => sendAvatarRelay(act, to),
      });
      registerSessionBridge(binding.seatId, homeSandboxId, bridge);
      tunnelChannelBySession.set(binding.sessionId, binding.channelName);
      tunnelSeatByInvite.set(binding.inviteId, binding.seatId);
      notifyRosterHomeSeatReady({
        sandboxId: homeSandboxId,
        seatId: binding.seatId,
        sessionId: binding.sessionId,
        inviteId: binding.inviteId,
      });
      status = "已入座，可以開始";
      return;
    }
    if (isSessionActPayload(payload)) {
      notifyRosterRemoteAct({ fromPeerId: msg.from, act: payload });
      return;
    }
    if (isSessionActResultPayload(payload)) {
      applySessionActResultFromRelay(payload);
      return;
    }
    if (isSessionEventRelayPayload(payload)) {
      const channel = tunnelChannelBySession.get(payload.sessionId);
      if (channel) publishRosterRelayedSessionEvent(channel, payload);
      return;
    }
    // Deliver ping／pong into the local projection that represents the sender.
    postRelayToIframe(msg.from, payload);
  }

  function maybeAutoInviteRoster(peerId: string): void {
    if (autoInvitedPeerId === peerId) return;
    if (!rosterCanInviteToSession()) return;
    // Projection sandbox must exist before invite — host seats via this id.
    if (!getRosterProjectionSandboxId(peerId)) return;
    try {
      const invite = inviteRosterAvatarToSession();
      autoInvitedPeerId = peerId;
      outboundInviteId = invite.inviteId;
      outboundSessionId = invite.sessionId;
      status = `已自動送出入座邀請（${invite.protocol.protocolId}）`;
    } catch {
      /* session may not be ready yet */
    }
  }

  async function mintPlatformInviteAndAnswer(opts: {
    kind?: string;
    intent?: unknown;
    ttlMs?: number;
  }) {
    const kind = opts.kind || "invite.compose";
    const handshake = kind === "signal.handshake";
    const created = await hostCreatePlatformInvite({
      kind,
      intent: opts.intent,
      ttlMs: opts.ttlMs,
      targetField: window.location.origin,
    });
    const apiKey = await readPlatformApiKey();
    platformHostLoop?.stop();
    platformHostLoop = startPlatformHostAnswerLoop({
      inviteId: created.invite_id,
      apiKey,
      lan,
      localPresence: localPresence(),
      // Connection invite: one guest only (API replaces host reply paste).
      maxAnswers: handshake ? 1 : undefined,
      prepareHandlers: () => {
        const slot: { s: RosterPeerSession | null } = { s: null };
        return {
          handlers: peerHandlersSlot(slot),
          attachSession: sess => {
            slot.s = sess;
          },
        };
      },
      onStatus: msg => {
        status = msg;
      },
      onError: msg => {
        error = friendlyError(msg);
      },
      onAnswered: async () => {
        if (!handshake) return;
        try {
          await revokePlatformInvite({
            inviteId: created.invite_id,
            apiKey,
          });
        } catch {
          /* already closed／network — ignore */
        }
      },
      onDone: () => {
        if (!handshake) return;
        platformHostLoop = null;
        platformConnInvite = null;
        status = "對方已連上";
      },
    });
    status = "已建立邀請 — 請分享給對方，等待連上";
    if (handshake) {
      // Guest already in Playgrounds: Shell／SAM invite UI (no login).
      const shareText = (created.short_url || created.deep_link).trim();
      let qrUrl: string | null = null;
      try {
        qrUrl = await encodeRosterQrPngDataUrl(shareText);
      } catch {
        qrUrl = null;
      }
      platformConnInvite = {
        inviteId: created.invite_id,
        shareText,
        qrUrl,
        expiresLabel: Number.isFinite(created.expires_at)
          ? new Date(created.expires_at).toLocaleString("zh-Hant", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : null,
      };
      status = "等待對方掃 QR 或貼上邀請文字（對方不必登入）…";
    } else {
      platformConnInvite = null;
      presentPlatformInviteShare({
        shortUrl: created.short_url,
        deepLink: created.deep_link,
        expiresAt: Number.isFinite(created.expires_at)
          ? new Date(created.expires_at).toLocaleString("zh-Hant", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : undefined,
        kind: created.kind,
        title: "邀請對手",
        hint: "對手無需註冊。請保持本頁在線；入座後由主持按「開始」開局。",
      });
    }
    return created;
  }

  async function handlePlatformMintConnection(): Promise<void> {
    error = null;
    busy = true;
    persistName();
    closeExchangePanels();
    try {
      await mintPlatformInviteAndAnswer({ kind: "signal.handshake" });
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  async function copyPlatformConnInvite(): Promise<void> {
    const text = platformConnInvite?.shareText?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      status = "已複製邀請文字 — 可貼到聊天或另一分頁";
    } catch {
      error = "無法複製，請改用選取文字手動複製";
    }
  }

  async function handlePlatformJoinFromPaste(): Promise<void> {
    const text = pasteInvite.trim();
    if (!text) {
      error = "請掃描對方的 QR，或貼上對方傳來的邀請文字";
      return;
    }
    error = null;
    busy = true;
    persistName();
    try {
      const secret = await resolvePlatformInviteSecretFromText(text);
      const meta = await previewInvite(secret);
      if (meta.revoked || !meta.open) {
        throw new Error(meta.revoked ? "邀請已撤銷" : "邀請已關閉或過期");
      }
      status = "正在與對方握手…";
      await runPlatformTicketJoin(secret, meta);
      status =
        meta.kind === "invite.compose"
          ? "連線完成（入座另需對方邀請）"
          : "連線完成";
      closeExchangePanels();
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  function stopPlatformHost(): void {
    platformHostLoop?.stop();
    platformHostLoop = null;
    platformConnInvite = null;
    status = "已停止等待對方連線";
  }

  async function acceptIncomingInvite(toPeerId?: string): Promise<void> {
    const invite = pendingIncoming;
    const peerId = toPeerId || peerAgentId;
    if (!invite || !peerId) return;
    if (!peerAgentId) peerAgentId = peerId;
    inviteBusy = true;
    error = null;
    status = "解析型錄／安裝座位中…";
    try {
      const role = invite.role || SESSION_PARTICIPANT_DEFAULT_ROLE;
      const preferReuseSandboxId =
        getPlatformComposeShell()?.getActiveSandboxId?.() ?? null;
      const seated = await materializeRosterInviteSeat(invite, {
        preferReuseSandboxId,
      });
      sendAvatarRelay(
        {
          kind: SESSION_INVITE_ACCEPT_KIND,
          inviteId: invite.inviteId,
          sessionId: invite.sessionId,
          role,
          homeSandboxId: seated.sandboxId,
        },
        peerId
      );
      homeSandboxByInvite.set(invite.inviteId, seated.sandboxId);
      pendingIncoming = null;
      const viaLabel =
        seated.via === "catalog"
          ? "型錄安裝"
          : seated.via === "installed"
            ? "本機 clone"
            : "內建範本";
      status = `已接受邀請（${viaLabel}；等待主持確認座位）`;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : String(e);
      error = `接受邀請失敗：${message}`;
      status = null;
      sendAvatarRelay(
        {
          kind: SESSION_INVITE_REJECT_KIND,
          inviteId: invite.inviteId,
          sessionId: invite.sessionId,
          reason: message.slice(0, 200),
        },
        peerId
      );
      pendingIncoming = null;
    } finally {
      inviteBusy = false;
    }
  }

  function rejectIncomingInvite(): void {
    const invite = pendingIncoming;
    if (!invite || !peerAgentId) return;
    sendAvatarRelay(
      {
        kind: SESSION_INVITE_REJECT_KIND,
        inviteId: invite.inviteId,
        sessionId: invite.sessionId,
        reason: "使用者拒絕",
      },
      peerAgentId
    );
    pendingIncoming = null;
    status = "已拒絕入座邀請";
  }

  function handleInviteAvatar(): void {
    error = null;
    try {
      const invite = inviteRosterAvatarToSession();
      outboundInviteId = invite.inviteId;
      outboundSessionId = invite.sessionId;
      status = `已送出入座邀請（${invite.protocol.protocolId}／${invite.role}）`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function cancelOutboundInvite(): void {
    if (!outboundInviteId || !peerAgentId || !outboundSessionId) return;
    sendAvatarRelay(
      {
        kind: SESSION_INVITE_CANCEL_KIND,
        inviteId: outboundInviteId,
        sessionId: outboundSessionId,
      },
      peerAgentId
    );
    outboundInviteId = null;
    outboundSessionId = null;
    status = "已取消入座邀請";
  }

  async function onPeerDisconnected(): Promise<void> {
    pendingIncoming = null;
    outboundInviteId = null;
    outboundSessionId = null;
    clearHomeSessionTunnels();
    if (peerAgentId) {
      const sandboxId = removeRosterAvatar(peerAgentId);
      filesByAgent.delete(peerAgentId);
      generationByAgent.delete(peerAgentId);
      iframeByAgent.delete(peerAgentId);
      if (sandboxId) await teardownRosterAvatarProjection(sandboxId);
      peerAgentId = null;
    } else {
      await teardownAllProjections();
    }
    refreshCanInvite();
    status = "連線已結束";
  }

  async function onPlatformPeerDisconnected(
    sess: RosterPeerSession
  ): Promise<void> {
    let peerId: string | null = null;
    for (const [id, s] of platformByPeer) {
      if (s === sess) {
        peerId = id;
        break;
      }
    }
    if (peerId) {
      const next = new Map(platformByPeer);
      next.delete(peerId);
      platformByPeer = next;
      const sandboxId = removeRosterAvatar(peerId);
      filesByAgent.delete(peerId);
      generationByAgent.delete(peerId);
      iframeByAgent.delete(peerId);
      if (sandboxId) await teardownRosterAvatarProjection(sandboxId);
      if (peerAgentId === peerId) {
        peerAgentId =
          listRosterAvatars().find(a => a.connectionState === "connected")
            ?.agentId ?? null;
      }
    }
    try {
      sess.close();
    } catch {
      /* ignore */
    }
    refreshCanInvite();
    status = peerId ? "一位連線已結束（其他人仍在）" : "連線已結束";
  }

  function peerHandlers(bindSession?: RosterPeerSession): RosterPeerHandlers {
    return {
      onMessage: data => {
        if (isPresenceMessage(data)) {
          if (bindSession) {
            const next = new Map(platformByPeer);
            next.set(data.agentId, bindSession);
            platformByPeer = next;
          }
          void onRemotePresence(data);
        } else if (isAvatarRelayMessage(data)) onAvatarRelay(data);
      },
      onChannelClose: () => {
        if (bindSession) void onPlatformPeerDisconnected(bindSession);
        else void onPeerDisconnected();
      },
      onConnectionState: state => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          if (bindSession) void onPlatformPeerDisconnected(bindSession);
          else void onPeerDisconnected();
        }
      },
      onError: err => {
        error = friendlyError(err.message);
      },
    };
  }

  async function readPlatformApiKey(): Promise<string> {
    const key = getPlatformFieldApiKey();
    if (!key) {
      throw new Error(
        "尚未登入遊樂場通行證 — 請按工具列「登入」"
      );
    }
    return key;
  }

  function peerHandlersSlot(slot: {
    s: RosterPeerSession | null;
  }): RosterPeerHandlers {
    return {
      onMessage: data => {
        if (isPresenceMessage(data)) {
          if (slot.s) {
            const next = new Map(platformByPeer);
            next.set(data.agentId, slot.s);
            platformByPeer = next;
          }
          void onRemotePresence(data);
        } else if (isAvatarRelayMessage(data)) onAvatarRelay(data);
      },
      onChannelClose: () => {
        if (slot.s) void onPlatformPeerDisconnected(slot.s);
      },
      onConnectionState: state => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          if (slot.s) void onPlatformPeerDisconnected(slot.s);
        }
      },
      onError: err => {
        error = friendlyError(err.message);
      },
    };
  }

  async function runPlatformTicketJoin(
    secret: string,
    meta: InviteMeta
  ): Promise<void> {
    if (!wantsRosterSignal(meta.kind, meta.intent)) {
      status = "邀請不含 Roster signal — 已處理 intent";
      return;
    }
    // Reuse if already connected to someone? Spec: reuse if already have PC with host.
    // Without stable host peer id we always signal for new joiners.
    const join = await createJoin(secret);
    const slot: { s: RosterPeerSession | null } = { s: null };
    const iceServers = lan
      ? undefined
      : ((await fetchGuestTurnIceServers({
          inviteId: meta.inviteId,
          joinCap: join.join_cap,
        })) ?? undefined);
    const result = await createRosterOffer({
      lan,
      transport: "signal",
      localPresence: localPresence(),
      handlers: peerHandlersSlot(slot),
      iceServers,
    });
    slot.s = result.session;
    const answered = await postOfferAndWaitAnswer({
      inviteId: meta.inviteId,
      joinCap: join.join_cap,
      offerWire: result.wire,
    });
    await applyRosterAnswer(result.session, answered.answer);
    status = "Platform 握手完成，正在連線…";
  }

  function friendlyError(msg: string): string {
    if (/not_provisioned|登入我的遊樂場|通行證/.test(msg)) {
      return msg;
    }
    if (/secret_locked|解鎖密鑰庫/.test(msg)) {
      return msg;
    }
    if (/PLAYGROUNDS_API_KEY/.test(msg)) {
      return msg;
    }
    if (/offer/i.test(msg) && /貼上|空|缺少/.test(msg)) {
      return "請先貼上對方的邀請";
    }
    if (/answer/i.test(msg) && /貼上|空|缺少/.test(msg)) {
      return "請先貼上對方的回覆";
    }
    if (/host candidate/i.test(msg) || /找不到可用/.test(msg)) {
      return "同區網模式下找不到可用連線資訊，可取消「同一區網」再試";
    }
    if (/ICE gathering/i.test(msg)) {
      return "連線資訊收集逾時（可重試；同機／同網通常數秒內完成）";
    }
    if (/ICE/i.test(msg)) {
      return "連線準備逾時，請重試";
    }
    if (/timeout/i.test(msg)) {
      return "等待對方回覆逾時（邀請者須在線）";
    }
    return msg
      .replace(/\boffer\b/gi, "邀請")
      .replace(/\banswer\b/gi, "回覆")
      .replace(/\bSDP\b/g, "連線資訊")
      .replace(/\bDataChannel\b/gi, "連線");
  }

  /** Initiator: create invite, wait for reply. */
  async function handleStartInvite(): Promise<void> {
    error = null;
    status = null;
    busy = true;
    resetExchangeUi();
    closeSession();
    peerAgentId = null;
    await teardownAllProjections();
    persistName();
    try {
      const result = await createRosterOffer({
        lan,
        localPresence: localPresence(),
        handlers: peerHandlers(),
      });
      session = result.session;
      inviteWire = result.wire;
      status = "已建立邀請 — 複製邀請連結交給對方，並等待對方的回覆";
      busy = false;
      refreshCanInvite();
      try {
        inviteQrUrl = await encodeRosterQrPngDataUrl(result.wire);
      } catch (qrErr) {
        error =
          qrErr instanceof Error
            ? `邀請已建立，但 QR 失敗：${qrErr.message}`
            : `邀請已建立，但 QR 失敗：${String(qrErr)}`;
      }
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
      busy = false;
    }
  }

  async function handleConfirmReply(): Promise<void> {
    if (!session) {
      error = "請先建立邀請";
      return;
    }
    const wire = extractRosterWireFromText(pasteReply) || pasteReply.trim();
    if (!wire) {
      error = "請貼上對方的回覆";
      return;
    }
    pasteReply = wire;
    error = null;
    busy = true;
    try {
      await applyRosterAnswer(session, wire);
      status = "已收下回覆，正在連線…";
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  /** Responder: paste invite, create reply. */
  async function handleJoinWithInvite(): Promise<void> {
    error = null;
    status = null;
    const wire = extractRosterWireFromText(pasteInvite) || pasteInvite.trim();
    if (!wire) {
      error = "請貼上對方的邀請";
      return;
    }
    pasteInvite = wire;
    pendingLinkOffer = null;
    busy = true;
    replyWire = "";
    replyQrUrl = null;
    inviteWire = "";
    inviteQrUrl = null;
    pasteReply = "";
    closeSession();
    peerAgentId = null;
    await teardownAllProjections();
    persistName();
    try {
      // Align LAN mode with the invite payload when possible.
      try {
        const fromLink = parseRosterInviteFromLocation({
          hash: `#roster=${wire}`,
        });
        if (fromLink) lan = fromLink.lan;
      } catch {
        /* ignore */
      }
      const result = await acceptRosterOffer({
        offerWire: wire,
        lan,
        localPresence: localPresence(),
        handlers: {
          ...peerHandlers(),
          onChannelOpen: () => {
            status = "連線已開啟，等待對方出現…";
            refreshCanInvite();
          },
        },
      });
      session = result.session;
      replyWire = result.wire;
      status = "已建立回覆 — 請回傳給發起連線的一方（可複製回覆或回覆連結）";
      busy = false;
      refreshCanInvite();
      try {
        replyQrUrl = await encodeRosterQrPngDataUrl(result.wire);
      } catch (qrErr) {
        error =
          qrErr instanceof Error
            ? `回覆已建立，但 QR 失敗：${qrErr.message}`
            : `回覆已建立，但 QR 失敗：${String(qrErr)}`;
      }
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
      busy = false;
    }
  }

  async function confirmPendingLinkOffer(): Promise<void> {
    if (!pendingLinkOffer) return;
    pasteInvite = pendingLinkOffer;
    openJoinPanel();
    await handleJoinWithInvite();
  }

  function dismissPendingLinkOffer(): void {
    pendingLinkOffer = null;
    status = "已忽略邀請連結";
  }

  async function copyInviteLink(): Promise<void> {
    if (!inviteWire) return;
    try {
      const url = buildRosterInviteUrl({
        origin: location.origin,
        pathname: location.pathname,
        wire: inviteWire,
      });
      await navigator.clipboard.writeText(url);
      status = "已複製邀請連結";
    } catch {
      error = "無法複製邀請連結";
    }
  }

  async function copyReplyLink(): Promise<void> {
    if (!replyWire) return;
    try {
      const url = buildRosterInviteUrl({
        origin: location.origin,
        pathname: location.pathname,
        wire: replyWire,
      });
      await navigator.clipboard.writeText(url);
      status = "已複製回覆連結（請傳回發起方貼上）";
    } catch {
      error = "無法複製回覆連結";
    }
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      status = "已複製";
    } catch {
      error = "無法複製，請改用選取文字手動複製";
    }
  }

  async function onScanFile(
    ev: Event,
    which: "invite" | "reply"
  ): Promise<void> {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    error = null;
    busy = true;
    try {
      const text = await decodeRosterQrFromBlob(file);
      if (which === "invite") pasteInvite = text;
      else pasteReply = text;
      status = "已從 QR 讀取";
      if (joinOpen && which === "invite") {
        busy = false;
        await handlePlatformJoinFromPaste();
        return;
      }
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  function stopLiveCameraScan(): void {
    stopCameraScan?.();
    stopCameraScan = null;
    cameraScanning = null;
  }

  async function startLiveCameraScan(which: "invite" | "reply"): Promise<void> {
    if (!cameraSupported || busy) return;
    error = null;
    stopLiveCameraScan();
    cameraScanning = which;
    await tick();
    const video = scanVideoEl;
    if (!video) {
      cameraScanning = null;
      error = "無法顯示相機預覽";
      return;
    }
    try {
      stopCameraScan = await startRosterCameraQrScan({
        video,
        onCode: text => {
          const wire = extractRosterWireFromText(text) || text.trim();
          if (which === "invite") {
            pasteInvite = wire;
            status = "已用相機讀取邀請 QR";
          } else {
            pasteReply = wire;
            status = "已用相機讀取回覆 QR";
          }
          stopLiveCameraScan();
          if (joinOpen && which === "invite") {
            void handlePlatformJoinFromPaste();
          }
        },
        onError: err => {
          error = friendlyError(err.message);
        },
      });
    } catch (e) {
      stopLiveCameraScan();
      error = friendlyError(e instanceof Error ? e.message : String(e));
    }
  }
</script>

<!-- Transport-only: Platform Invite / WebRTC / session bridge. No Avatars tab UI. -->
<div hidden aria-hidden="true"></div>
