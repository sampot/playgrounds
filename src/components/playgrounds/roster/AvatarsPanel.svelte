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
    PLAYGROUNDS_API_KEY_SECRET,
    postOfferAndWaitAnswer,
    previewInvite,
    type InviteMeta,
  } from "../platform/platformClient";
  import { hostCreatePlatformInvite } from "../platform/platformHostProxy";
  import {
    composeNeedsMaximize,
    composeSamSource,
    composeSessionProtocol,
    wantsRosterSignal,
  } from "../platform/platformCompose";
  import { getPlatformComposeShell } from "../platform/platformComposeShell";
  import { startPlatformHostAnswerLoop } from "../platform/platformHostLoop";
  import {
    clearPgInviteHashFromLocation,
    parsePgInviteFromLocation,
  } from "../platform/platformInviteUrl";
  import {
    getSecretPlaintext,
    isSecretStoreUnlocked,
  } from "../secretStore";

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
  let platformInvite = $state<{
    inviteId: string;
    secret: string;
    shortUrl: string;
    deepLink: string;
  } | null>(null);
  let platformShortQr = $state<string | null>(null);
  let pendingPgSecret = $state<string | null>(null);
  let pendingPgMeta = $state<InviteMeta | null>(null);
  let pendingComposeProtocol = $state<unknown | null>(null);
  let pendingComposeConsent = $state(false);
  let avatars = $state<RosterAvatarStub[]>([]);
  let localName = $state("我");
  let peerAgentId = $state<string | null>(null);
  /** Exchange panels: shown only after CTA (or deep-link); hidden when connected. */
  let startOpen = $state(false);
  let joinOpen = $state(false);

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
    startOpen = true;
    error = null;
  }

  function openJoinPanel(): void {
    if (cameraScanning === "reply") stopLiveCameraScan();
    startOpen = false;
    joinOpen = true;
    error = null;
  }

  function closeExchangePanels(): void {
    stopLiveCameraScan();
    startOpen = false;
    joinOpen = false;
  }

  onMount(() => {
    avatars = listRosterAvatars();
    unsub = subscribeRosterAvatars(() => {
      avatars = listRosterAvatars();
    });
    unsubHub = subscribeRosterSessionHub(refreshCanInvite);
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
    consumePgInviteHash();
  });

  function consumeRosterInviteHash(): void {
    const parsed = parseRosterInviteFromLocation({
      hash: window.location.hash,
      search: window.location.search,
    });
    if (!parsed) return;
    clearRosterInviteHashFromLocation();
    if (parsed.role === "offer") {
      pendingLinkOffer = parsed.wire;
      pasteInvite = parsed.wire;
      lan = parsed.lan;
      openJoinPanel();
      status = "收到邀請連結 — 確認後即可加入";
    } else {
      // Answer links are for pasting back to the initiator, not auto-navigate.
      pasteReply = parsed.wire;
      openStartPanel();
      status = "已從連結讀取回覆 — 請確認回覆";
    }
  }

  function consumePgInviteHash(): void {
    const parsed = parsePgInviteFromLocation({
      hash: window.location.hash,
      search: window.location.search,
    });
    if (!parsed) return;
    clearPgInviteHashFromLocation();
    pendingPgSecret = parsed.secret;
    void loadPendingPgMeta();
  }

  async function loadPendingPgMeta(): Promise<void> {
    if (!pendingPgSecret) return;
    try {
      pendingPgMeta = await previewInvite(pendingPgSecret);
      status = "收到 Platform 邀請 — 確認後加入";
    } catch (e) {
      error =
        e instanceof Error
          ? `無法讀取邀請：${e.message}`
          : `無法讀取邀請：${String(e)}`;
      pendingPgSecret = null;
    }
  }

  onDestroy(() => {
    stopLiveCameraScan();
    platformHostLoop?.stop();
    platformHostLoop = null;
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
          ? `化身投影載入失敗：${e.message}`
          : `化身投影載入失敗：${String(e)}`;
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

    if (stub.sandboxId) return;
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
          ? `無法建立化身投影：${e.message}`
          : `無法建立化身投影：${String(e)}`;
    }
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
      status = `收到 session 邀請（${payload.protocol.protocolId}）`;
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
        status = "收到 seat_bound，但本機參與者沙盒遺失";
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
      status = "遠端座位橋已就緒（可發言）";
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

  async function acceptIncomingInvite(): Promise<void> {
    const invite = pendingIncoming;
    if (!invite || !peerAgentId) return;
    const peerId = peerAgentId;
    inviteBusy = true;
    error = null;
    status = "解析型錄／安裝座位中…";
    try {
      const role = invite.role || SESSION_PARTICIPANT_DEFAULT_ROLE;
      const seated = await materializeRosterInviteSeat(invite);
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
      status = `已接受邀請（${viaLabel}；等待 seat_bound）`;
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
    if (!isSecretStoreUnlocked()) {
      throw new Error("請先解鎖密鑰庫（SecretStore）");
    }
    try {
      return await getSecretPlaintext(PLAYGROUNDS_API_KEY_SECRET);
    } catch {
      throw new Error(
        `密鑰庫沒有 ${PLAYGROUNDS_API_KEY_SECRET} — 請在後台建立 API key 後寫入密鑰庫`
      );
    }
  }

  async function handlePlatformMint(): Promise<void> {
    error = null;
    busy = true;
    persistName();
    try {
      const created = await hostCreatePlatformInvite({
        kind: "signal.handshake",
        targetField: window.location.host,
      });
      const apiKey = await readPlatformApiKey();
      platformInvite = {
        inviteId: created.invite_id,
        secret: created.secret,
        shortUrl: created.short_url,
        deepLink: created.deep_link,
      };
      platformHostLoop?.stop();
      platformHostLoop = startPlatformHostAnswerLoop({
        inviteId: created.invite_id,
        apiKey,
        lan,
        localPresence: localPresence(),
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
      });
      status = "已建立 Platform 邀請 — 分享短網址；本機正在作答循環";
      try {
        platformShortQr = await encodeRosterQrPngDataUrl(created.short_url);
      } catch {
        platformShortQr = null;
      }
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
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

  function dismissPendingPg(): void {
    pendingPgSecret = null;
    pendingPgMeta = null;
    pendingComposeProtocol = null;
    pendingComposeConsent = false;
  }

  async function confirmPendingPgJoin(): Promise<void> {
    if (!pendingPgSecret || !pendingPgMeta) return;
    const meta = pendingPgMeta;
    const secret = pendingPgSecret;
    error = null;
    busy = true;
    persistName();
    try {
      if (meta.kind === "invite.compose") {
        const proto = composeSessionProtocol(meta.intent);
        pendingComposeProtocol = proto;
        const sam = composeSamSource(meta.intent);
        const shell = getPlatformComposeShell();
        if (sam && shell) {
          await shell.openSamSource(sam);
          if (composeNeedsMaximize(meta.intent)) shell.maximizePreview();
        }
        if (proto) {
          pendingComposeConsent = true;
          status = "已開啟小品 — 請確認是否加入 session";
          busy = false;
          return;
        }
      }
      await runPlatformTicketJoin(secret, meta);
      dismissPendingPg();
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  async function confirmComposeAndJoin(): Promise<void> {
    if (!pendingPgSecret || !pendingPgMeta) return;
    pendingComposeConsent = false;
    busy = true;
    try {
      await runPlatformTicketJoin(pendingPgSecret, pendingPgMeta);
      dismissPendingPg();
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
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
    const result = await createRosterOffer({
      lan,
      localPresence: localPresence(),
      handlers: peerHandlersSlot(slot),
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

  function stopPlatformHost(): void {
    platformHostLoop?.stop();
    platformHostLoop = null;
    platformInvite = null;
    platformShortQr = null;
    status = "已停止 Platform 作答循環";
  }

  function friendlyError(msg: string): string {
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

<div class="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-[12px]">
  <div class="space-y-3">
    <label class="text-skin-base/70 block text-[11px]">
      顯示名稱
      <input
        class="{inputCls} mt-0.5"
        bind:value={localName}
        disabled={busy}
        onchange={persistName}
        placeholder="對方會看到的名字"
      />
    </label>

    <section class="space-y-2">
      <h3 class="text-skin-base m-0 text-[11px] font-semibold tracking-wide">
        線上名冊
      </h3>
      {#if avatars.length === 0}
        <p class="text-skin-base/45 m-0 text-[11px]">還沒有連上任何人</p>
      {:else}
        <ul class="m-0 list-none space-y-2 p-0">
          {#each avatars as a (a.agentId)}
            <li
              class="border-skin-line bg-skin-card overflow-hidden rounded border"
            >
              <div class="flex items-center gap-2 px-2 py-1.5">
                <img
                  src={a.identiconUrl}
                  alt=""
                  width="28"
                  height="28"
                  class="rounded"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-skin-base truncate text-[12px] font-medium">
                    {a.name}
                  </div>
                  <div class="text-skin-base/40 truncate text-[10px]">
                    {a.connectionState === "connected"
                      ? a.sandboxId
                        ? "投影就緒"
                        : "連線中…"
                      : a.connectionState}
                  </div>
                </div>
              </div>
              {#if a.sandboxId}
                <iframe
                  title={`化身 ${a.name}`}
                  class="border-skin-line bg-skin-fill block h-40 w-full border-t"
                  use:avatarFrameAction={a.agentId}
                ></iframe>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      <div class="flex flex-wrap gap-1">
        <button
          type="button"
          class={btn}
          disabled={busy}
          onclick={openStartPanel}>發起連線</button
        >
        <button
          type="button"
          class={btn}
          disabled={busy}
          onclick={openJoinPanel}>加入連線</button
        >
      </div>
      {#if avatars.length > 0}
        <p class="text-skin-base/40 m-0 text-[10px]">
          Platform 邀請可同時多人；OOB 發起／加入仍會重置現有 OOB 連線
        </p>
      {/if}
    </section>

    <section
      class="border-skin-line bg-skin-card space-y-2 rounded border px-2 py-2"
    >
      <h3 class="text-skin-base m-0 text-[11px] font-semibold">
        Platform 邀請
      </h3>
      <p class="text-skin-base/55 m-0 text-[10px]">
        短連結多人加入（Ticket：加入者出邀請）。需密鑰庫
        <code class="font-mono">PLAYGROUNDS_API_KEY</code>
      </p>
      <div class="flex flex-wrap gap-1">
        <button
          type="button"
          class={btn}
          disabled={busy}
          onclick={() => void handlePlatformMint()}>建立短連結邀請</button
        >
        {#if platformHostLoop}
          <button
            type="button"
            class={btn}
            disabled={busy}
            onclick={stopPlatformHost}>停止作答</button
          >
        {/if}
      </div>
      {#if platformInvite}
        <div class="space-y-1">
          <p class="text-skin-base/70 m-0 break-all font-mono text-[10px]">
            {platformInvite.shortUrl}
          </p>
          <div class="flex flex-wrap gap-1">
            <button
              type="button"
              class={btn}
              onclick={() =>
                void navigator.clipboard.writeText(platformInvite!.shortUrl)
              }>複製短網址</button
            >
          </div>
          {#if platformShortQr}
            <img
              src={platformShortQr}
              alt="邀請 QR"
              class="border-skin-line max-w-[10rem] rounded border bg-white p-1"
            />
          {/if}
        </div>
      {/if}
    </section>

    {#if pendingPgSecret && pendingPgMeta}
      <section
        class="border-skin-line bg-skin-card space-y-2 rounded border px-2 py-2"
      >
        <h3 class="text-skin-base m-0 text-[11px] font-semibold">
          Platform 邀請連結
        </h3>
        <p class="text-skin-base/70 m-0 text-[11px]">
          {pendingPgMeta.kind}
          {#if pendingPgMeta.expiresAt}
            · 到期 {new Date(pendingPgMeta.expiresAt).toLocaleTimeString()}
          {/if}
        </p>
        {#if pendingComposeConsent}
          <p class="text-skin-base/70 m-0 text-[11px]">
            將加入 session
            {#if pendingComposeProtocol && typeof pendingComposeProtocol === "object" && pendingComposeProtocol && "protocolId" in pendingComposeProtocol}
              （{(pendingComposeProtocol as { protocolId: string }).protocolId}）
            {/if}
            。同意後開始連線。
          </p>
          <div class="flex flex-wrap gap-1">
            <button
              type="button"
              class={btn}
              disabled={busy}
              onclick={() => void confirmComposeAndJoin()}>同意入座並連線</button
            >
            <button
              type="button"
              class={btn}
              disabled={busy}
              onclick={dismissPendingPg}>拒絕</button
            >
          </div>
        {:else}
          <div class="flex flex-wrap gap-1">
            <button
              type="button"
              class={btn}
              disabled={busy}
              onclick={() => void confirmPendingPgJoin()}>加入</button
            >
            <button
              type="button"
              class={btn}
              disabled={busy}
              onclick={dismissPendingPg}>忽略</button
            >
          </div>
        {/if}
      </section>
    {/if}

    {#if pendingLinkOffer}
      <section
        class="border-skin-line bg-skin-card space-y-2 rounded border px-2 py-2"
      >
        <h3 class="text-skin-base m-0 text-[11px] font-semibold">
          連線邀請連結
        </h3>
        <p class="text-skin-base/70 m-0 text-[11px]">
          有人用連結邀請你加入這場連線。確認後會建立回覆，再把回覆傳回去。
        </p>
        <div class="flex flex-wrap gap-1">
          <button
            type="button"
            class={btn}
            disabled={busy}
            onclick={() => void confirmPendingLinkOffer()}>加入連線</button
          >
          <button
            type="button"
            class={btn}
            disabled={busy}
            onclick={dismissPendingLinkOffer}>忽略</button
          >
        </div>
      </section>
    {/if}

    {#if pendingIncoming}
      <section
        class="border-skin-line bg-skin-card space-y-2 rounded border px-2 py-2"
      >
        <h3 class="text-skin-base m-0 text-[11px] font-semibold">
          入座邀請
        </h3>
        <p class="text-skin-base/70 m-0 text-[11px]">
          {pendingIncoming.protocol.protocolId}@{pendingIncoming.protocol
            .apiVersion}
          · 角色 {pendingIncoming.role}
        </p>
        <div class="flex flex-wrap gap-1">
          <button
            type="button"
            class={btn}
            disabled={inviteBusy}
            onclick={() => void acceptIncomingInvite()}>接受</button
          >
          <button
            type="button"
            class={btn}
            disabled={inviteBusy}
            onclick={rejectIncomingInvite}>拒絕</button
          >
        </div>
      </section>
    {/if}

    {#if canInvite || outboundInviteId}
      <section class="space-y-1">
        <div class="flex flex-wrap gap-1">
          <button
            type="button"
            class={btn}
            disabled={!canInvite || Boolean(outboundInviteId) || busy}
            onclick={handleInviteAvatar}>邀請化身入座</button
          >
          {#if outboundInviteId}
            <button
              type="button"
              class={btn}
              onclick={cancelOutboundInvite}>取消邀請</button
            >
          {/if}
        </div>
        <p class="text-skin-base/45 m-0 text-[10px]">
          需已開啟多人通道（如腦力激盪）且化身已連線
        </p>
      </section>
    {/if}

    {#if status}
      <p class="text-skin-base/60 m-0 text-[11px]">{status}</p>
    {/if}
    {#if error}
      <p class="text-red-600/90 m-0 text-[11px]">{error}</p>
    {/if}

    {#if startOpen}
      <section class="border-skin-line space-y-2 rounded border p-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-skin-base m-0 text-[11px] font-semibold">發起連線</h3>
          <button type="button" class={btn} onclick={closeExchangePanels}
            >隱藏</button
          >
        </div>
        <p class="text-skin-base/50 m-0 text-[11px]">
          建立邀請交給對方，再貼上對方的回覆即可連上。
        </p>
        <label class="text-skin-base/70 flex items-center gap-2 text-[11px]">
          <input type="checkbox" bind:checked={lan} disabled={busy} />
          我們在同一區網（邀請較短、較好掃）
        </label>
        <div class="flex flex-wrap gap-1">
          <button
            type="button"
            class={btn}
            disabled={busy}
            onclick={() => void handleStartInvite()}>建立邀請</button
          >
          <button
            type="button"
            class={btn}
            disabled={!inviteWire}
            onclick={() => void copyText(inviteWire)}>複製邀請</button
          >
          <button
            type="button"
            class={btn}
            disabled={!inviteWire}
            onclick={() => void copyInviteLink()}>複製邀請連結</button
          >
          <button
            type="button"
            class={btn}
            disabled={!session || busy}
            onclick={() => void handleConfirmReply()}>確認回覆</button
          >
        </div>
        {#if inviteQrUrl}
          <img
            src={inviteQrUrl}
            alt="連線邀請 QR"
            class="border-skin-line bg-white mx-auto block max-w-full rounded border"
            width="200"
            height="200"
          />
        {/if}
        {#if inviteWire}
          <textarea
            class="{inputCls} min-h-[4.5rem] resize-y"
            readonly
            value={inviteWire}
            aria-label="邀請文字"
          ></textarea>
        {/if}
        <label class="text-skin-base/70 block text-[11px]">
          貼上對方的回覆
          <textarea
            class="{inputCls} mt-0.5 min-h-[3.5rem] resize-y"
            bind:value={pasteReply}
            disabled={busy}
            placeholder="對方給你的回覆或回覆連結…"
          ></textarea>
        </label>
        <label class={btn}>
          從檔案讀取回覆 QR
          <input
            type="file"
            accept="image/png,image/jpeg,image/*"
            class="hidden"
            disabled={busy}
            onchange={e => void onScanFile(e, "reply")}
          />
        </label>
        {#if cameraSupported}
          {#if cameraScanning === "reply"}
            <button
              type="button"
              class={btn}
              onclick={stopLiveCameraScan}>停止相機</button
            >
          {:else}
            <button
              type="button"
              class={btn}
              disabled={busy}
              onclick={() => void startLiveCameraScan("reply")}>相機掃回覆</button
            >
          {/if}
        {/if}
        {#if cameraScanning === "reply"}
          <video
            bind:this={scanVideoEl}
            class="border-skin-line bg-black mx-auto block max-h-48 w-full rounded border object-cover"
            playsinline
            muted
            aria-label="相機預覽"
          ></video>
        {/if}
      </section>
    {/if}

    {#if joinOpen}
      <section class="border-skin-line space-y-2 rounded border p-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-skin-base m-0 text-[11px] font-semibold">加入連線</h3>
          <button type="button" class={btn} onclick={closeExchangePanels}
            >隱藏</button
          >
        </div>
        <p class="text-skin-base/50 m-0 text-[11px]">
          貼上對方的邀請（或邀請連結），建立回覆後再傳回去。
        </p>
        <label class="text-skin-base/70 flex items-center gap-2 text-[11px]">
          <input type="checkbox" bind:checked={lan} disabled={busy} />
          我們在同一區網（邀請較短、較好掃）
        </label>
        <label class="text-skin-base/70 block text-[11px]">
          貼上對方的邀請
          <textarea
            class="{inputCls} mt-0.5 min-h-[3.5rem] resize-y"
            bind:value={pasteInvite}
            disabled={busy}
            placeholder="對方給你的邀請或邀請連結…"
          ></textarea>
        </label>
        <div class="flex flex-wrap gap-1">
          <label class={btn}>
            從檔案讀取邀請 QR
            <input
              type="file"
              accept="image/png,image/jpeg,image/*"
              class="hidden"
              disabled={busy}
              onchange={e => void onScanFile(e, "invite")}
            />
          </label>
          {#if cameraSupported}
            {#if cameraScanning === "invite"}
              <button
                type="button"
                class={btn}
                onclick={stopLiveCameraScan}>停止相機</button
              >
            {:else}
              <button
                type="button"
                class={btn}
                disabled={busy}
                onclick={() => void startLiveCameraScan("invite")}>相機掃邀請</button
              >
            {/if}
          {/if}
          <button
            type="button"
            class={btn}
            disabled={busy}
            onclick={() => void handleJoinWithInvite()}>建立回覆</button
          >
          <button
            type="button"
            class={btn}
            disabled={!replyWire}
            onclick={() => void copyText(replyWire)}>複製回覆</button
          >
          <button
            type="button"
            class={btn}
            disabled={!replyWire}
            onclick={() => void copyReplyLink()}>複製回覆連結</button
          >
        </div>
        {#if cameraScanning === "invite"}
          <video
            bind:this={scanVideoEl}
            class="border-skin-line bg-black mx-auto block max-h-48 w-full rounded border object-cover"
            playsinline
            muted
            aria-label="相機預覽"
          ></video>
        {/if}
        {#if replyQrUrl}
          <img
            src={replyQrUrl}
            alt="連線回覆 QR"
            class="border-skin-line bg-white mx-auto block max-w-full rounded border"
            width="200"
            height="200"
          />
        {/if}
        {#if replyWire}
          <textarea
            class="{inputCls} min-h-[4.5rem] resize-y"
            readonly
            value={replyWire}
            aria-label="回覆文字"
          ></textarea>
        {/if}
      </section>
    {/if}
  </div>
</div>
