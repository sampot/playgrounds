<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    ensureCanvasServiceWorker,
    syncCanvasSnapshot,
  } from "../canvasSw";
  import { buildCanvasEntryUrl } from "../canvasSwProtocol";
  import { applyIframeColorScheme } from "../playgroundsTheme";
  import type { FileMap } from "../projectTypes";
  import { createProject } from "../sandboxAuthority";
  import {
    createSessionParticipantStarterFiles,
    SESSION_PARTICIPANT_DEFAULT_ROLE,
  } from "../sessionParticipantStarter";
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
    rosterCanInviteToSession,
    type RosterAvatarRelayMsg,
    type RosterAvatarStub,
    type RosterPeerHandlers,
    type RosterPeerSession,
    type SessionInvitePayload,
  } from "./index";

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
  let avatars = $state<RosterAvatarStub[]>([]);
  let localName = $state("我");
  let peerAgentId = $state<string | null>(null);
  /** Collapsed by default: start = initiator, join = responder. */
  let startOpen = $state(false);
  let joinOpen = $state(false);

  let pendingIncoming = $state<SessionInvitePayload | null>(null);
  let outboundInviteId = $state<string | null>(null);
  let outboundSessionId = $state<string | null>(null);
  let canInvite = $state(false);
  let inviteBusy = $state(false);

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

  onMount(() => {
    avatars = listRosterAvatars();
    unsub = subscribeRosterAvatars(() => {
      avatars = listRosterAvatars();
    });
    unsubHub = subscribeRosterSessionHub(refreshCanInvite);
    unregTransport = registerRosterRelayTransport({
      send: (payload, to) => sendAvatarRelay(payload, to),
      getPeerAgentId: () => peerAgentId,
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
  });

  onDestroy(() => {
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
    if (!session) return;
    const msg: RosterAvatarRelayMsg = {
      type: "avatar_relay",
      from: localAgentId,
      ...(to ? { to } : {}),
      payload,
    };
    try {
      session.send(msg);
    } catch (e) {
      error = friendlyError(e instanceof Error ? e.message : String(e));
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
    startOpen = false;
    joinOpen = false;
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
    // Deliver ping／pong into the local projection that represents the sender.
    postRelayToIframe(msg.from, payload);
  }

  async function acceptIncomingInvite(): Promise<void> {
    const invite = pendingIncoming;
    if (!invite || !peerAgentId) return;
    inviteBusy = true;
    error = null;
    try {
      const role = invite.role || SESSION_PARTICIPANT_DEFAULT_ROLE;
      const files = createSessionParticipantStarterFiles();
      const meta = await createProject(`遠端座位 · ${role}`, files, {
        agentManaged: true,
        inWorkingSet: false,
        cloneIntent: "session_seat",
        source: "playgrounds-roster-session-seat",
      });
      sendAvatarRelay(
        {
          kind: SESSION_INVITE_ACCEPT_KIND,
          inviteId: invite.inviteId,
          sessionId: invite.sessionId,
          role,
          homeSandboxId: meta.id,
        },
        peerAgentId
      );
      pendingIncoming = null;
      status = "已接受邀請（本機參與者已備妥；act 橋尚未接通）";
    } catch (e) {
      error =
        e instanceof Error
          ? `接受邀請失敗：${e.message}`
          : `接受邀請失敗：${String(e)}`;
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
      const invite = inviteRosterAvatarToSession({
        role: SESSION_PARTICIPANT_DEFAULT_ROLE,
      });
      outboundInviteId = invite.inviteId;
      outboundSessionId = invite.sessionId;
      status = `已送出入座邀請（${invite.protocol.protocolId}）`;
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

  function peerHandlers(): RosterPeerHandlers {
    return {
      onMessage: data => {
        if (isPresenceMessage(data)) void onRemotePresence(data);
        else if (isAvatarRelayMessage(data)) onAvatarRelay(data);
      },
      onChannelClose: () => void onPeerDisconnected(),
      onConnectionState: state => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          void onPeerDisconnected();
        }
      },
      onError: err => {
        error = friendlyError(err.message);
      },
    };
  }

  function friendlyError(msg: string): string {
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
      status = "已建立邀請 — 請交給對方，並等待對方的回覆";
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
    const wire = pasteReply.trim();
    if (!wire) {
      error = "請貼上對方的回覆";
      return;
    }
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
    const wire = pasteInvite.trim();
    if (!wire) {
      error = "請貼上對方的邀請";
      return;
    }
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
      status = "已建立回覆 — 請回傳給發起連線的一方";
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
        已連線的化身
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
    </section>

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

    <details class="border-skin-line rounded border" bind:open={startOpen}>
      <summary
        class="text-skin-base/80 hover:bg-skin-card cursor-pointer list-none px-2 py-1.5 text-[11px] font-semibold tracking-wide select-none [&::-webkit-details-marker]:hidden"
      >
        <span class="inline-flex items-center gap-1">
          <span class="text-skin-base/40 w-3 tabular-nums" aria-hidden="true"
            >{startOpen ? "▾" : "▸"}</span
          >
          發起連線
        </span>
      </summary>
      <div class="border-skin-line space-y-2 border-t p-2">
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
            placeholder="對方給你的回覆…"
          ></textarea>
        </label>
        <label class={btn}>
          掃描回覆 QR
          <input
            type="file"
            accept="image/png,image/jpeg,image/*"
            class="hidden"
            disabled={busy}
            onchange={e => void onScanFile(e, "reply")}
          />
        </label>
      </div>
    </details>

    <details class="border-skin-line rounded border" bind:open={joinOpen}>
      <summary
        class="text-skin-base/80 hover:bg-skin-card cursor-pointer list-none px-2 py-1.5 text-[11px] font-semibold tracking-wide select-none [&::-webkit-details-marker]:hidden"
      >
        <span class="inline-flex items-center gap-1">
          <span class="text-skin-base/40 w-3 tabular-nums" aria-hidden="true"
            >{joinOpen ? "▾" : "▸"}</span
          >
          加入連線
        </span>
      </summary>
      <div class="border-skin-line space-y-2 border-t p-2">
        <p class="text-skin-base/50 m-0 text-[11px]">
          貼上對方的邀請，建立回覆後再傳回去。
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
            placeholder="對方給你的邀請…"
          ></textarea>
        </label>
        <div class="flex flex-wrap gap-1">
          <label class={btn}>
            掃描邀請 QR
            <input
              type="file"
              accept="image/png,image/jpeg,image/*"
              class="hidden"
              disabled={busy}
              onchange={e => void onScanFile(e, "invite")}
            />
          </label>
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
        </div>
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
      </div>
    </details>
  </div>
</div>
