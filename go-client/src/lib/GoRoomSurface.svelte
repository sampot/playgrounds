<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { encodeRosterQrPngDataUrl } from "@pg/roster/rosterQr";
  import {
    SESSION_CHAT_MAX_TEXT_CHARS,
    isSessionChatHostMessage,
  } from "@pg/roster/rosterSessionChat";
  import { goSessionChat } from "$lib/goSessionChat.svelte";
  import { goRoomFiles } from "$lib/goRoomFiles.svelte";
  import GoShareSheet from "$lib/GoShareSheet.svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import {
    GO_ROOM_SHARE_HINT,
    GO_ROOM_SHARE_TITLE,
  } from "$lib/goRoom";

  type RoomUiPhase = "idle" | "waiting" | "ready" | "ended" | "error" | "connecting";

  type Props = {
    role: "host" | "guest";
    phase: RoomUiPhase;
    message: string;
    error: string | null;
    loggedIn?: boolean;
    shortUrl: string | null;
    inviteExpiresAt: number | null;
    peerName: string | null;
    onLogin?: () => void;
    onInvite?: () => void;
    onEnd?: () => void | Promise<void>;
    onReissue?: () => void;
  };

  let {
    role,
    phase,
    message,
    error,
    loggedIn = false,
    shortUrl = null,
    inviteExpiresAt = null,
    peerName = null,
    onLogin,
    onInvite,
    onEnd,
    onReissue,
  }: Props = $props();

  let draft = $state("");
  let listEl = $state<HTMLDivElement | null>(null);
  let quickOpen = $state(false);
  let shareOpen = $state(false);
  let qrUrl = $state<string | null>(null);
  let confirmEnd = $state(false);
  let leaveAfterEnd = $state(false);
  let confirmDialog = $state<HTMLDialogElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let fileError = $state("");
  let now = $state(Date.now());

  const messages = $derived(goSessionChat.messages);
  const connected = $derived(goSessionChat.connected);
  const freeText = $derived(goSessionChat.freeTextAllowed);
  const quickReplies = $derived(goSessionChat.quickReplies);
  const files = $derived(goRoomFiles.entries);
  const pendingFile = $derived(goRoomFiles.pendingIncoming);

  const spoken = $derived.by(() => {
    if (!shortUrl) return "";
    try {
      const u = new URL(shortUrl);
      return `${u.host}${u.pathname}`;
    } catch {
      return shortUrl.replace(/^https?:\/\//, "");
    }
  });

  const remainLabel = $derived.by(() => {
    if (!inviteExpiresAt) return "";
    const ms = inviteExpiresAt - now;
    if (ms <= 0) return "門牌已過期";
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `門牌還有 ${m}:${String(r).padStart(2, "0")}`;
  });

  const statusLabel = $derived.by(() => {
    if (error) return error;
    if (phase === "ready") return peerName ? `已連線 · ${peerName}` : "已連線";
    if (phase === "waiting") return message || "等待對方進來";
    if (phase === "connecting") return message || "正在進包廂…";
    if (phase === "ended") return message || "這一間已結束";
    return message;
  });

  const showComposer = $derived(phase === "ready" && connected);
  const live = $derived(phase === "waiting" || phase === "ready" || phase === "connecting");

  $effect(() => {
    const t = window.setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => window.clearInterval(t);
  });

  $effect(() => {
    const url = shortUrl;
    if (!url || phase !== "waiting") {
      qrUrl = null;
      return;
    }
    let cancelled = false;
    void encodeRosterQrPngDataUrl(url, { scale: 6, border: 2 }).then(
      (data) => {
        if (!cancelled) qrUrl = data;
      },
      () => {
        if (!cancelled) qrUrl = null;
      }
    );
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    void messages.length;
    void files.length;
    if (!listEl) return;
    void tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  });

  $effect(() => {
    chromeSession.escapeGuard = () => {
      if (!live) return true;
      leaveAfterEnd = true;
      confirmEnd = true;
      return false;
    };
    return () => {
      if (chromeSession.escapeGuard) chromeSession.escapeGuard = null;
    };
  });

  $effect(() => {
    const el = confirmDialog;
    if (!el) return;
    if (confirmEnd && !el.open) el.showModal();
    if (!confirmEnd && el.open) el.close();
  });

  function isHostMsg(m: (typeof messages)[number]): boolean {
    if (m.local && goSessionChat.localRole === "host") return true;
    return isSessionChatHostMessage(m);
  }

  function who(m: (typeof messages)[number]): string {
    if (m.local) return "我";
    if (isHostMsg(m)) return "";
    return (m.name && m.name.trim()) || "對方";
  }

  function onSubmit(ev: Event) {
    ev.preventDefault();
    if (!freeText) return;
    if (goSessionChat.sendText(draft)) draft = "";
  }

  function onQuick(q: string) {
    if (goSessionChat.sendQuickReply(q)) quickOpen = false;
  }

  async function onPickFile(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    fileError = "";
    const result = await goRoomFiles.offerLocalFile(file);
    if (!result.ok) fileError = result.error;
  }

  function askEnd(leaveHome = false) {
    if (!live) {
      if (leaveHome) void goto("/");
      else void onEnd?.();
      return;
    }
    leaveAfterEnd = leaveHome;
    confirmEnd = true;
  }

  async function confirmEndNow() {
    confirmEnd = false;
    await onEnd?.();
    if (leaveAfterEnd) void goto("/");
    leaveAfterEnd = false;
  }

  function formatSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<p class="room-back">
  {#if live}
    <button type="button" class="room-back-btn" onclick={() => askEnd(true)}>← 回遊樂場大廳</button>
  {:else}
    <a href="/">← 回遊樂場大廳</a>
  {/if}
</p>

<header class="room-head">
  <h1 class="pixel-text">包廂</h1>
  <p class="room-status" role="status">{statusLabel || "臨時隔間：對話與檔案只在雙方瀏覽器之間。"}</p>
</header>

{#if role === "host" && phase === "idle"}
  <section class="pixel-frame room-card">
    <p>
      請人進來這一間，連上之後可以傳文字和檔案。關分頁或結束就沒了，不會存到遊樂場伺服器。
    </p>
    {#if loggedIn}
      <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onInvite?.()}>
        邀請進包廂
      </button>
    {:else}
      <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onLogin?.()}>
        登入後邀請
      </button>
      <p class="muted">沒有通行證也能被邀請進來。單機小品不受影響。</p>
    {/if}
  </section>
{/if}

{#if role === "host" && phase === "waiting"}
  <section class="room-wait pixel-frame" aria-labelledby="room-wait-title">
    <h2 id="room-wait-title">等對方掃碼進來</h2>
    {#if qrUrl}
      <img class="room-qr" src={qrUrl} alt="包廂邀請 QR" width="240" height="240" />
    {:else}
      <p class="muted">正在準備 QR…</p>
    {/if}
    {#if spoken}
      <p class="room-spoken">{spoken}</p>
    {/if}
    {#if remainLabel}
      <p class="muted">{remainLabel}</p>
    {/if}
    <div class="room-actions">
      <button
        type="button"
        class="pixel-btn pixel-btn--primary"
        disabled={!shortUrl}
        onclick={() => (shareOpen = true)}
      >
        分享邀請
      </button>
      <button type="button" class="pixel-btn pixel-btn--danger-outline" onclick={() => askEnd()}>
        結束這一間
      </button>
    </div>
  </section>
{/if}

{#if phase === "connecting"}
  <section class="pixel-frame room-card" role="status">
    <p>{message || "正在進包廂…"}</p>
  </section>
{/if}

{#if phase === "error"}
  <section class="pixel-frame room-card" role="alert">
    <p class="err">{error || "無法開始"}</p>
    {#if role === "host"}
      <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onInvite?.()}>
        再試一次
      </button>
    {/if}
  </section>
{/if}

{#if phase === "ended"}
  <section class="pixel-frame room-card" role="status">
    <p>{message || "這一間已結束"}</p>
    <div class="room-actions">
      {#if role === "host" && loggedIn}
        <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onReissue?.()}>
          再發一張
        </button>
      {/if}
      <a class="pixel-btn" href="/">回遊樂場大廳</a>
    </div>
  </section>
{/if}

{#if phase === "ready"}
  <div class="room-main">
    <div class="room-timeline pixel-frame" bind:this={listEl} role="log" aria-label="包廂時間線">
      {#if messages.length === 0 && files.length === 0}
        <p class="muted">還沒有訊息。跟對方打聲招呼，或傳一個檔。</p>
      {/if}
      {#each messages as m (m.id)}
        <div
          class={[
            "bubble",
            m.local && "bubble--local",
            isHostMsg(m) && "bubble--host",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span class="bubble-who">
            {#if isHostMsg(m)}
              <span class="host-tag">主持</span>
            {/if}
            {#if who(m)}<span>{who(m)}</span>{/if}
          </span>
          <span class="bubble-text">{m.text}</span>
        </div>
      {/each}
      {#each files as f (f.id)}
        <div class={["file-row", f.direction === "out" && "file-row--out"].filter(Boolean).join(" ")}>
          <p class="file-name">{f.name}</p>
          <p class="muted">
            {formatSize(f.size)}
            {#if f.status === "offering"} · 等待對方同意
            {:else if f.status === "pending"} · 對方想傳檔過來
            {:else if f.status === "transferring"} · 傳送中 {formatSize(f.received)}
            {:else if f.status === "done"} · 完成
            {:else if f.status === "rejected"} · 已拒絕
            {:else if f.status === "cancelled"} · 已取消
            {:else if f.status === "error"} · {f.error || "失敗"}
            {/if}
          </p>
          {#if f.status === "done" && f.blobUrl}
            <a class="pixel-btn" href={f.blobUrl} download={f.name}>下載到這台裝置</a>
          {/if}
        </div>
      {/each}
    </div>

    <aside class="room-side pixel-frame">
      <p class="side-title">這一間</p>
      <p class="room-status">{statusLabel}</p>
      <button type="button" class="pixel-btn pixel-btn--danger-outline" onclick={() => askEnd()}>
        結束這一間
      </button>
    </aside>
  </div>

  {#if pendingFile}
    <section class="pixel-frame room-card incoming" aria-labelledby="room-file-title">
      <h2 id="room-file-title">對方想傳檔過來</h2>
      <p>{pendingFile.name}（{formatSize(pendingFile.size)}）</p>
      <div class="room-actions">
        <button
          type="button"
          class="pixel-btn pixel-btn--primary"
          onclick={() => goRoomFiles.acceptIncoming(pendingFile.id)}
        >
          接收
        </button>
        <button
          type="button"
          class="pixel-btn"
          onclick={() => goRoomFiles.rejectIncoming(pendingFile.id)}
        >
          拒絕
        </button>
      </div>
    </section>
  {/if}

  {#if showComposer}
    {#if fileError}
      <p class="err" role="alert">{fileError}</p>
    {/if}
    {#if quickReplies.length > 0}
      <button
        type="button"
        class="quick-toggle"
        aria-expanded={quickOpen}
        onclick={() => (quickOpen = !quickOpen)}
      >
        {quickOpen ? "▾" : "▸"} 快捷語
      </button>
      {#if quickOpen}
        <div class="quick" role="group" aria-label="快捷語">
          {#each quickReplies as q (q)}
            <button type="button" class="pixel-btn" onclick={() => onQuick(q)}>{q}</button>
          {/each}
        </div>
      {/if}
    {/if}
    <form class="composer" onsubmit={onSubmit}>
      <input
        class="pixel-input composer-input"
        type="text"
        maxlength={SESSION_CHAT_MAX_TEXT_CHARS}
        placeholder="說點什麼…"
        autocomplete="off"
        enterkeyhint="send"
        bind:value={draft}
      />
      <input
        bind:this={fileInput}
        class="file-hidden"
        type="file"
        onchange={(e) => void onPickFile(e)}
      />
      <button
        type="button"
        class="pixel-btn composer-attach"
        onclick={() => fileInput?.click()}
      >
        附加檔案
      </button>
      <button type="submit" class="pixel-btn pixel-btn--primary" disabled={!draft.trim()}>
        送出
      </button>
    </form>
  {/if}
{/if}

<dialog
  bind:this={confirmDialog}
  class="confirm-dialog"
  aria-labelledby="room-end-title"
  oncancel={(e) => {
    e.preventDefault();
    confirmEnd = false;
  }}
  onclick={(e) => {
    if (e.target === confirmDialog) confirmEnd = false;
  }}
>
  <div class="confirm pixel-frame">
    <h2 id="room-end-title" class="confirm-title">結束這一間？</h2>
    <p class="confirm-body">對話和檔案只留在這一頁，結束後對方也會斷線，無法復原。</p>
    <div class="confirm-actions">
      <button type="button" class="pixel-btn" onclick={() => (confirmEnd = false)}>取消</button>
      <button type="button" class="pixel-btn pixel-btn--danger" onclick={() => void confirmEndNow()}>
        結束
      </button>
    </div>
  </div>
</dialog>

{#if shortUrl}
  <GoShareSheet
    open={shareOpen}
    title={GO_ROOM_SHARE_TITLE}
    url={shortUrl}
    spoken={spoken}
    hint={GO_ROOM_SHARE_HINT}
    onClose={() => (shareOpen = false)}
    onFlash={(msg) => chromeSession.setFlash(msg)}
  />
{/if}

<style>
  .room-back {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
  }
  .room-back a,
  .room-back-btn {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-weight: 600;
    text-decoration: none;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .room-head {
    margin: 0 0 1rem;
  }
  .room-status {
    margin: 0.35rem 0 0;
    font-size: 0.92rem;
    line-height: 1.4;
  }
  .room-card,
  .room-wait,
  .incoming {
    margin: 0 0 1rem;
  }
  .room-card p,
  .room-wait p {
    margin: 0 0 0.75rem;
    line-height: 1.45;
  }
  .room-qr {
    display: block;
    width: min(240px, 70vw);
    height: auto;
    margin: 0 auto 0.75rem;
    image-rendering: pixelated;
  }
  .room-spoken {
    font-family: var(--pixel);
    font-size: 0.95rem;
    text-align: center;
    word-break: break-all;
  }
  .room-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .room-actions .pixel-btn {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
  .muted {
    color: color-mix(in oklab, rgb(var(--ink)) 72%, transparent);
    font-size: 0.88rem;
  }
  .err {
    color: rgb(180 35 45);
    margin: 0 0 0.5rem;
  }
  .room-main {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 0 0 0.75rem;
  }
  .room-timeline {
    min-height: 12rem;
    max-height: min(50vh, 24rem);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .bubble {
    align-self: flex-start;
    max-width: 90%;
  }
  .bubble--local {
    align-self: flex-end;
    text-align: right;
  }
  .bubble-who {
    display: flex;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: rgb(var(--muted));
  }
  .bubble--local .bubble-who {
    justify-content: flex-end;
  }
  .host-tag {
    font-weight: 700;
  }
  .bubble-text {
    display: inline-block;
    margin-top: 0.15rem;
    padding: 0.4rem 0.55rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
  }
  .file-row {
    padding: 0.4rem 0;
    border-top: 1px dashed rgb(var(--line));
  }
  .file-name {
    margin: 0;
    font-weight: 700;
  }
  .side-title {
    margin: 0 0 0.4rem;
    font-family: var(--pixel);
    font-weight: 700;
  }
  .room-side .pixel-btn {
    margin-top: 0.5rem;
    min-height: 44px;
    width: 100%;
  }
  .quick-toggle {
    min-height: 44px;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .quick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.35rem 0 0.5rem;
  }
  .composer {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.5rem 0 1rem;
  }
  .composer-input {
    flex: 1 1 12rem;
    min-height: 44px;
  }
  .composer-attach,
  .composer button[type="submit"] {
    min-height: 44px;
  }
  .file-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  .confirm-dialog {
    border: none;
    padding: 0;
    background: transparent;
    max-width: min(28rem, calc(100vw - 1.5rem));
  }
  .confirm-dialog::backdrop {
    background: color-mix(in oklab, rgb(var(--ink)) 45%, transparent);
  }
  .confirm {
    padding: 1rem;
  }
  .confirm-title {
    margin: 0 0 0.5rem;
    font-family: var(--pixel);
  }
  .confirm-body {
    margin: 0 0 0.85rem;
    line-height: 1.45;
  }
  .confirm-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .confirm-actions .pixel-btn {
    min-height: 44px;
  }
  @media (min-width: 48rem) {
    .room-main {
      flex-direction: row;
      align-items: stretch;
    }
    .room-timeline {
      flex: 1 1 auto;
      max-height: min(60vh, 32rem);
    }
    .room-side {
      flex: 0 0 16rem;
    }
    .room-actions,
    .confirm-actions {
      flex-direction: row;
    }
  }
</style>
