<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    acceptRosterOffer,
    applyRosterAnswer,
    createRosterOffer,
    decodeRosterQrFromBlob,
    encodeRosterQrPngDataUrl,
    isPresenceMessage,
    listRosterAvatars,
    clearRosterAvatars,
    removeRosterAvatar,
    subscribeRosterAvatars,
    upsertRosterAvatar,
    type RosterAvatarStub,
    type RosterPeerHandlers,
    type RosterPeerSession,
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

  onMount(() => {
    avatars = listRosterAvatars();
    unsub = subscribeRosterAvatars(() => {
      avatars = listRosterAvatars();
    });
    try {
      const n = localStorage.getItem("playgrounds-roster-display-name");
      if (n) localName = n;
    } catch {
      /* ignore */
    }
  });

  onDestroy(() => {
    unsub?.();
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

  function closeSession(): void {
    session?.close();
    session = null;
  }

  function localPresence() {
    return {
      agentId: localAgentId,
      name: localName.trim() || "我",
    };
  }

  function onRemotePresence(data: {
    agentId: string;
    name: string;
  }): void {
    if (data.agentId === localAgentId) return;
    peerAgentId = data.agentId;
    upsertRosterAvatar({
      agentId: data.agentId,
      name: data.name,
      connectionState: "connected",
    });
    status = `已與「${data.name}」連上`;
    // Handshake is one-shot; drop invite/reply text + QR once both sides are up.
    resetExchangeUi();
    startOpen = false;
    joinOpen = false;
    error = null;
  }

  function onPeerDisconnected(): void {
    if (peerAgentId) {
      removeRosterAvatar(peerAgentId);
      peerAgentId = null;
    } else {
      clearRosterAvatars();
    }
    status = "連線已結束";
  }

  function peerHandlers(): RosterPeerHandlers {
    return {
      onMessage: data => {
        if (isPresenceMessage(data)) onRemotePresence(data);
      },
      onChannelClose: () => onPeerDisconnected(),
      onConnectionState: state => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          onPeerDisconnected();
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
    clearRosterAvatars();
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
    clearRosterAvatars();
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
          },
        },
      });
      session = result.session;
      replyWire = result.wire;
      status = "已建立回覆 — 請回傳給發起連線的一方";
      busy = false;
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
        <ul class="m-0 list-none space-y-1.5 p-0">
          {#each avatars as a (a.agentId)}
            <li
              class="border-skin-line bg-skin-card flex items-center gap-2 rounded border px-2 py-1.5"
            >
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
                  {a.connectionState === "connected" ? "連線中" : a.connectionState}
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

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
