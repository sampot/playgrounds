<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import {
    SESSION_CHAT_MAX_TEXT_CHARS,
    isSessionChatHostMessage,
  } from "@pg/roster/rosterSessionChat";
  import { goSessionChat } from "$lib/goSessionChat.svelte";
  import { goRoomFiles } from "$lib/goRoomFiles.svelte";
  import { pickRoomFileSave } from "$lib/goRoomFileSave";
  import GoShareSheet from "$lib/GoShareSheet.svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import {
    GO_ROOM_EMPTY_TIMELINE,
    GO_ROOM_END_CONFIRM_HOST,
    GO_ROOM_KEEP_OPEN,
    GO_ROOM_LEAVE_CONFIRM_GUEST,
    GO_ROOM_LOGIN_HINT,
    GO_ROOM_SHARE_HINT,
    GO_ROOM_SHARE_TITLE,
    isRoomInviteShareable,
    roomChatWhoLabel,
    roomInviteRemainLabel,
    roomOccupantSummary,
    takePickedFiles,
    type RoomInviteDoor,
  } from "$lib/goRoom";

  type RoomUiPhase = "idle" | "open" | "ended" | "error" | "connecting" | "ready";

  type Props = {
    role: "host" | "guest";
    phase: RoomUiPhase;
    message: string;
    error: string | null;
    loggedIn?: boolean;
    shortUrl: string | null;
    inviteExpiresAt: number | null;
    inviteDoor?: RoomInviteDoor;
    peerName: string | null;
    guestCount?: number;
    occupantNames?: string[];
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
    inviteDoor = "none",
    peerName = null,
    guestCount = 0,
    occupantNames = [],
    onLogin,
    onInvite,
    onEnd,
    onReissue,
  }: Props = $props();

  let draft = $state("");
  let listEl = $state<HTMLDivElement | null>(null);
  let quickOpen = $state(false);
  let shareOpen = $state(false);
  let confirmEnd = $state(false);
  let leaveAfterEnd = $state(false);
  let confirmDialog = $state<HTMLDialogElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let fileError = $state("");
  let now = $state(Date.now());
  let filesOpen = $state(false);
  let pendingShare = $state(false);

  const messages = $derived(goSessionChat.messages);
  const connected = $derived(goSessionChat.connected);
  const freeText = $derived(goSessionChat.freeTextAllowed);
  const quickReplies = $derived(goSessionChat.quickReplies);
  const files = $derived(goRoomFiles.entries);
  let dropping = $state(false);

  const spoken = $derived.by(() => {
    if (!shortUrl) return "";
    try {
      const u = new URL(shortUrl);
      return `${u.host}${u.pathname}`;
    } catch {
      return shortUrl.replace(/^https?:\/\//, "");
    }
  });

  const remainLabel = $derived(
    roomInviteRemainLabel(inviteExpiresAt, now)
  );
  const shareable = $derived(
    isRoomInviteShareable({ shortUrl, expiresAt: inviteExpiresAt, now })
  );
  const door = $derived.by((): RoomInviteDoor => {
    if (inviteDoor === "expired" || inviteDoor === "live" || inviteDoor === "none") {
      return inviteDoor;
    }
    return shareable ? "live" : "none";
  });

  const inBooth = $derived(
    role === "guest"
      ? phase === "ready"
      : phase === "open" || (loggedIn && phase === "idle")
  );

  const statusLabel = $derived.by(() => {
    if (error) return error;
    if (phase === "ready" && role === "guest") {
      return peerName ? `已連線 · ${peerName}` : "已連線";
    }
    if (phase === "connecting") return message || "正在進包廂…";
    if (phase === "ended") return message || "這一間已結束";
    if (inBooth) return message || roomOccupantSummary({ guestCount });
    return message;
  });

  const showComposer = $derived(
    inBooth && (role === "host" || connected)
  );
  const live = $derived(
    inBooth || phase === "connecting" || phase === "open"
  );

  $effect(() => {
    const t = window.setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => window.clearInterval(t);
  });

  $effect(() => {
    if (pendingShare && shareable && shortUrl) {
      shareOpen = true;
      pendingShare = false;
    }
  });

  $effect(() => {
    void messages.length;
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
    return roomChatWhoLabel({
      local: m.local,
      host: isHostMsg(m),
      name: m.name,
    });
  }

  function onSubmit(ev: Event) {
    ev.preventDefault();
    if (!freeText) return;
    if (goSessionChat.sendText(draft)) draft = "";
  }

  function onQuick(q: string) {
    if (goSessionChat.sendQuickReply(q)) quickOpen = false;
  }

  async function shareFiles(list: FileList | File[]): Promise<void> {
    const picked = Array.from(list);
    if (picked.length === 0) return;
    fileError = "";
    for (const file of picked) {
      const result = await goRoomFiles.shareLocalFile(file);
      if (!result.ok) {
        fileError = result.error;
        return;
      }
    }
  }

  async function onPickFile(ev: Event) {
    const picked = takePickedFiles(ev.currentTarget as HTMLInputElement);
    if (picked.length === 0) return;
    await shareFiles(picked);
  }

  async function onDownload(id: string) {
    fileError = "";
    const result = await goRoomFiles.download(id, (opts) =>
      pickRoomFileSave(opts.suggestedName)
    );
    if (!result.ok && !result.cancelled) fileError = result.error;
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

  function inviteInBooth() {
    if (door === "live" && shareable && shortUrl) {
      shareOpen = true;
      return;
    }
    pendingShare = true;
    onInvite?.();
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
  <div class="room-head-row">
    <h1 class="pixel-text">包廂</h1>
    {#if inBooth}
      <div class="room-head-actions">
        {#if role === "host"}
          <button
            type="button"
            class="pixel-btn pixel-btn--primary"
            onclick={() => inviteInBooth()}
          >
            {door === "expired" ? "再發一張" : "請人進來"}
          </button>
        {/if}
        <button type="button" class="pixel-btn pixel-btn--danger-outline" onclick={() => askEnd()}>
          {role === "host" ? "結束" : "離開"}
        </button>
      </div>
    {/if}
  </div>
  <p class="room-status" role="status">{statusLabel || "臨時隔間：對話只在在場者之間；檔案點下載才存到你選的位置。"}</p>
</header>

{#if role === "host" && !loggedIn && phase === "idle"}
  <section class="pixel-frame room-card">
    <p>
      這一間可以傳文字，也可以在分享區掛檔。點下載才會存到你選的位置。關分頁或結束就沒了目錄，不會存到遊樂場伺服器。
    </p>
    <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onLogin?.()}>
      登入後開包廂
    </button>
    <p class="muted">{GO_ROOM_LOGIN_HINT} 單機小品不受影響。</p>
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
          再開一間
        </button>
      {/if}
      <a class="pixel-btn" href="/">回遊樂場大廳</a>
    </div>
  </section>
{/if}

{#if inBooth}
  <div class="room-main">
    <div class="room-col">
    <div class="room-timeline pixel-frame" bind:this={listEl} role="log" aria-label="包廂時間線">
      {#if messages.length === 0}
        <p class="muted">{GO_ROOM_EMPTY_TIMELINE}</p>
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
    </div>

    {#if showComposer}
    <section
      class={["file-tray", "pixel-frame", dropping && "file-tray--drop"]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby="room-files-title"
      ondragover={(e) => {
        e.preventDefault();
        dropping = true;
        filesOpen = true;
      }}
      ondragleave={() => (dropping = false)}
      ondrop={(e) => {
        e.preventDefault();
        dropping = false;
        filesOpen = true;
        const list = e.dataTransfer?.files;
        if (list) void shareFiles(list);
      }}
    >
      <button
        type="button"
        id="room-files-title"
        class="file-toggle"
        aria-expanded={filesOpen}
        onclick={() => (filesOpen = !filesOpen)}
      >
        {filesOpen ? "▾" : "▸"} 檔案分享區
        {#if files.length > 0}
          · {files.length}
        {:else}
          · 尚未掛檔
        {/if}
      </button>
      {#if filesOpen}
      <p class="muted">
        檔案還在分享者這台裝置上。點下載才會存到你選的位置。關包廂，目錄就沒了。
      </p>
      {#if fileError}
        <p class="err" role="alert">{fileError}</p>
      {/if}
      <input
        bind:this={fileInput}
        class="file-hidden"
        type="file"
        multiple
        onchange={(e) => void onPickFile(e)}
      />
      <button
        type="button"
        class="pixel-btn"
        onclick={() => fileInput?.click()}
      >
        選擇檔案
      </button>
      {#if files.length === 0}
        <p class="muted">把檔案拖到這裡，或按選擇檔案。</p>
      {/if}
      <ul class="file-list">
        {#each files as f (f.id)}
          <li class="file-row">
            <p class="file-name">{f.name}</p>
            <p class="muted">
              {formatSize(f.size)} · {f.mine ? "我" : f.ownerName}
              {#if f.status === "transferring"} · 傳送中 {formatSize(f.received)}
              {:else if f.status === "error"} · {f.error || "失敗"}
              {/if}
            </p>
            <div class="file-actions">
              {#if f.mine}
                <button
                  type="button"
                  class="pixel-btn"
                  onclick={() => goRoomFiles.unshareLocal(f.id)}
                >
                  撤回
                </button>
              {:else}
                <button
                  type="button"
                  class="pixel-btn pixel-btn--primary"
                  disabled={f.status === "transferring"}
                  onclick={() => void onDownload(f.id)}
                >
                  下載
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
      {/if}
    </section>
  {/if}
    </div>
    <aside class="room-side pixel-frame">
      <p class="side-title">這一間</p>
      <p class="room-status">{statusLabel}</p>
      {#if role === "host"}
        <p class="muted">{GO_ROOM_KEEP_OPEN}</p>
        {#if occupantNames.length > 0}
          <ul class="occupant-list">
            {#each occupantNames as n (n)}
              <li>{n}</li>
            {/each}
          </ul>
        {/if}
        {#if door === "none"}
          <p class="muted">還沒發邀請</p>
        {:else if door === "live"}
          <p class="muted">邀請有效{remainLabel ? ` · ${remainLabel}` : ""}</p>
        {:else}
          <p class="muted">邀請已過期</p>
        {/if}
        <button
          type="button"
          class="pixel-btn pixel-btn--primary"
          onclick={() => inviteInBooth()}
        >
          {door === "expired" ? "再發一張邀請" : "請人進來"}
        </button>
      {/if}
      <button type="button" class="pixel-btn pixel-btn--danger-outline" onclick={() => askEnd()}>
        {role === "host" ? "結束這一間" : "離開這一間"}
      </button>
    </aside>
  </div>

  {#if showComposer}
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
    <h2 id="room-end-title" class="confirm-title">
      {role === "host" ? "結束這一間？" : "離開這一間？"}
    </h2>
    <p class="confirm-body">
      {role === "host" ? GO_ROOM_END_CONFIRM_HOST : GO_ROOM_LEAVE_CONFIRM_GUEST}
    </p>
    <div class="confirm-actions">
      <button type="button" class="pixel-btn" onclick={() => (confirmEnd = false)}>取消</button>
      <button type="button" class="pixel-btn pixel-btn--danger" onclick={() => void confirmEndNow()}>
        {role === "host" ? "結束" : "離開"}
      </button>
    </div>
  </div>
</dialog>

{#if shareable && shortUrl}
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
  .room-head-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
  }
  .room-head-row h1 {
    margin: 0;
  }
  .room-head-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .room-head-actions .pixel-btn {
    min-height: 44px;
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
  .room-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
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
  .file-tray {
    margin: 0;
    min-height: 0;
  }
  .file-toggle {
    min-height: 44px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-weight: 700;
    font-family: var(--pixel);
    cursor: pointer;
  }
  .file-tray--drop {
    outline: 2px dashed rgb(var(--ink));
  }
  .file-tray .pixel-btn {
    min-height: 44px;
    margin: 0.4rem 0;
  }
  .file-list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .file-row {
    padding: 0.4rem 0;
    border-top: 1px dashed rgb(var(--line));
  }
  .file-name {
    margin: 0;
    font-weight: 700;
  }
  .file-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.35rem;
  }
  .file-actions .pixel-btn {
    min-height: 44px;
    margin: 0;
  }
  .side-title {
    margin: 0 0 0.4rem;
    font-family: var(--pixel);
    font-weight: 700;
  }
  .room-side {
    display: none;
  }
  .occupant-list {
    margin: 0.35rem 0 0.5rem;
    padding-left: 1.1rem;
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
    .room-col {
      flex: 1 1 auto;
      min-width: 0;
    }
    .room-timeline {
      flex: 1 1 auto;
      max-height: min(50vh, 28rem);
    }
    .room-head-actions {
      display: none;
    }
    .room-side {
      display: block;
      flex: 0 0 16rem;
    }
    .room-side .pixel-btn {
      margin-top: 0.5rem;
      min-height: 44px;
      width: 100%;
    }
    .room-actions,
    .confirm-actions {
      flex-direction: row;
    }
  }
</style>
