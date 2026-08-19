<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import {
    SESSION_CHAT_MAX_TEXT_CHARS,
    isSessionChatHostMessage,
  } from "@pg/roster/rosterSessionChat";
  import { goSessionChat } from "$lib/goSessionChat.svelte";
  import { goRoomFiles } from "$lib/goRoomFiles.svelte";
  import { goRoomMedia } from "$lib/goRoomMedia.svelte";
  import { pickRoomFileSave } from "$lib/goRoomFileSave";
  import GoShareSheet from "$lib/GoShareSheet.svelte";
  import GoBoothStage from "$lib/GoBoothStage.svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { boothHotspotPanel, boothSeatIndex, type BoothHotspotId } from "$lib/goBoothHotspots";
  import {
    GO_ROOM_CAMERA_STOP_WATCH,
    GO_ROOM_CAST_STOP_WATCH,
    GO_ROOM_EMPTY_TIMELINE,
    GO_ROOM_END_CONFIRM_HOST,
    GO_ROOM_LEAVE_CONFIRM_GUEST,
    GO_ROOM_LOGIN_HINT,
    GO_ROOM_PUT_ON_TV,
    GO_ROOM_SHARE_HINT,
    GO_ROOM_SHARE_TITLE,
    GO_ROOM_TV_FULLSCREEN,
    GO_ROOM_TV_HINT_GUEST,
    GO_ROOM_TV_HINT_HOST,
    GO_ROOM_TV_OFF_BTN,
    GO_ROOM_TV_TITLE,
    attachMediaStream,
    attachPlaybackUrl,
    canShareDisplay,
    enterTvFullscreen,
    isRoomInviteShareable,
    roomChatBoxFromRect,
    roomChatBoxHasSize,
    roomChatBoxesOverlap,
    roomChatPredictedOverlayBox,
    roomChatShouldCloseOnFocusMove,
    roomChatShouldCloseOnOutsidePress,
    roomChatWhoLabel,
    roomOccupantRows,
    roomStageStatus,
    roomTvLabel,
    roomTvStream,
    takePickedFiles,
    type RoomInviteDoor,
    type RoomOccupantPeer,
  } from "$lib/goRoom";
  import {
    catalogConsumes,
    catalogPlayLabel,
    catalogTransferHint,
  } from "$lib/goRoomCatalog";

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
    occupantPeers?: RoomOccupantPeer[];
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
    occupantPeers = [],
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
  let mediaError = $state("");
  let presenceVideoEl = $state<HTMLVideoElement | null>(null);
  let localPreviewEl = $state<HTMLVideoElement | null>(null);
  let filePlayEl = $state<HTMLMediaElement | null>(null);
  let now = $state(Date.now());
  let filesOpen = $state(false);
  let chatOpen = $state(false);
  let coversCanvas = $state(true);
  let canvasSlotEl = $state<HTMLElement | null>(null);
  let chatPanelEl = $state<HTMLElement | null>(null);
  let composerInputEl = $state<HTMLInputElement | null>(null);
  let tvOpen = $state(false);
  let seatOverlay = $state<number | null>(null);
  let pendingShare = $state(false);
  let expandedTvEl = $state<HTMLVideoElement | null>(null);

  const messages = $derived(goSessionChat.messages);
  const connected = $derived(goSessionChat.connected);
  const freeText = $derived(goSessionChat.freeTextAllowed);
  const quickReplies = $derived(goSessionChat.quickReplies);
  const files = $derived(
    goRoomFiles.entries.filter((f) => f.kind !== "dir" && f.kind !== "device")
  );
  const roster = $derived(
    roomOccupantRows({
      localPeerId: "local",
      localName: "我",
      localLiveVideo: goRoomMedia.camera || goRoomMedia.display,
      localLiveAudio: goRoomMedia.mic,
      others:
        occupantPeers.length > 0
          ? occupantPeers
          : occupantNames.map((name, i) => ({
              peerId: `name-${i}-${name}`,
              name,
            })),
      remoteLives: goRoomMedia.remoteLives,
    })
  );
  const tvLabel = $derived(
    roomTvLabel({
      programName: goRoomMedia.programName,
      remoteProgramName: goRoomMedia.remoteProgramName,
    })
  );
  const tvStream = $derived(
    roomTvStream({
      programStream: goRoomMedia.programStream,
      localProgramStream: goRoomMedia.localProgramStream,
    })
  );
  const tvOn = $derived(
    Boolean(
      tvStream || goRoomMedia.programName || goRoomMedia.remoteProgramName
    )
  );
  const overlayOpen = $derived(
    filesOpen ||
      tvOpen ||
      seatOverlay !== null ||
      (role === "host" && !loggedIn && phase === "idle") ||
      phase === "connecting" ||
      phase === "error" ||
      phase === "ended"
  );
  const seatPerson = $derived(
    seatOverlay !== null ? (roster[seatOverlay] ?? null) : null
  );
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
    if (phase === "connecting") return message || "正在進包廂…";
    if (phase === "ended") return message || "這一間已結束";
    if (inBooth) {
      const line = roomStageStatus({ guestCount, tvLabel });
      if (role === "guest" && peerName) return `${line} · ${peerName}`;
      return message || line;
    }
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
    void chatOpen;
    void showComposer;
    const canvasSlot = canvasSlotEl;
    const panel = chatPanelEl;
    const sync = () => {
      const canvas = canvasSlot?.querySelector("canvas");
      const canvasBox = canvas
        ? roomChatBoxFromRect(canvas.getBoundingClientRect())
        : null;
      const panelBox = panel
        ? roomChatBoxFromRect(panel.getBoundingClientRect())
        : null;
      const overlayBox =
        panelBox && roomChatBoxHasSize(panelBox)
          ? panelBox
          : roomChatPredictedOverlayBox({
              viewportWidthPx: window.innerWidth,
              viewportHeightPx: window.innerHeight,
              chromeHeightPx: readChromeHeightPx(),
              remPx: readRemPx(),
            });
      coversCanvas =
        canvasBox && roomChatBoxHasSize(canvasBox)
          ? roomChatBoxesOverlap(canvasBox, overlayBox)
          : true;
    };
    sync();
    void tick().then(sync);
    const ro = new ResizeObserver(sync);
    if (canvasSlot) ro.observe(canvasSlot);
    if (panel) ro.observe(panel);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  });

  $effect(() => {
    if (!chatOpen || !showComposer || !coversCanvas) return;
    void tick().then(() => chatPanelEl?.focus());
  });

  $effect(() => {
    if (!chatOpen || !showComposer || !coversCanvas) return;
    const onPointerDown = (ev: Event) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      const inside = Boolean(chatPanelEl?.contains(t));
      const onToggle =
        t instanceof Element && Boolean(t.closest("[data-room-chat-toggle]"));
      if (
        !roomChatShouldCloseOnOutsidePress({
          coversCanvas,
          pressInsidePanel: inside,
          pressOnToggle: onToggle,
        })
      ) {
        return;
      }
      chatOpen = false;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
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
      if (chatOpen) {
        chatOpen = false;
        return false;
      }
      if (tvOpen) {
        tvOpen = false;
        return false;
      }
      if (filesOpen) {
        filesOpen = false;
        return false;
      }
      if (seatOverlay !== null) {
        seatOverlay = null;
        return false;
      }
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

  $effect(() => {
    attachMediaStream(presenceVideoEl, goRoomMedia.presenceStream);
  });
  $effect(() => {
    attachMediaStream(localPreviewEl, goRoomMedia.localPreviewStream);
  });
  $effect(() => {
    attachMediaStream(expandedTvEl, tvStream);
  });
  $effect(() => {
    const el = filePlayEl;
    const url = goRoomFiles.playback?.url ?? null;
    void tick().then(() => {
      if ((goRoomFiles.playback?.url ?? null) !== url) return;
      attachPlaybackUrl(filePlayEl ?? el, url);
    });
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
    if (!goSessionChat.sendQuickReply(q)) return;
    composerInputEl?.focus();
    quickOpen = false;
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
    if (!result.ok && !("cancelled" in result && result.cancelled)) {
      fileError = result.error;
    }
  }

  async function onToggleCamera() {
    mediaError = "";
    if (goRoomMedia.camera) {
      await goRoomMedia.disableCamera();
      return;
    }
    const out = await goRoomMedia.enableCamera();
    if (!out.ok) mediaError = out.error;
  }

  async function onWatchOccupant(peerId: string) {
    mediaError = "";
    const out = await goRoomMedia.watchLive(peerId);
    if (!out.ok) mediaError = out.error;
  }

  async function onStopWatching() {
    mediaError = "";
    await goRoomMedia.stopWatching();
    await goRoomMedia.stopListening();
  }

  async function onToggleDisplay() {
    mediaError = "";
    if (goRoomMedia.display) {
      await goRoomMedia.disableDisplay();
      return;
    }
    const out = await goRoomMedia.enableDisplay();
    if (!out.ok) mediaError = out.error;
  }

  async function onToggleMic() {
    mediaError = "";
    if (goRoomMedia.mic) {
      await goRoomMedia.disableMic();
      return;
    }
    const out = await goRoomMedia.enableMic();
    if (!out.ok) mediaError = out.error;
  }

  async function onPlayFile(id: string) {
    mediaError = "";
    fileError = "";
    tvOpen = false;
    filesOpen = true;
    if (goRoomFiles.playback?.id === id) {
      goRoomFiles.stopPlay();
      return;
    }
    const out = await goRoomFiles.play(id);
    if (!out.ok) fileError = out.error;
  }

  async function onPutOnTv(id: string) {
    mediaError = "";
    const file = goRoomFiles.localFile(id);
    if (!file) {
      mediaError = "只有這台掛上的檔能放到電視上";
      return;
    }
    const out = await goRoomMedia.startProgram(file);
    if (!out.ok) mediaError = out.error;
  }

  async function onPutLiveOnTv(peerId: string, name: string) {
    mediaError = "";
    const out = await goRoomMedia.putLiveOnTv(peerId, name);
    if (!out.ok) mediaError = out.error;
  }

  async function onStopTv() {
    mediaError = "";
    await goRoomMedia.stopProgram();
  }

  function closePanels() {
    chatOpen = false;
    filesOpen = false;
    tvOpen = false;
    seatOverlay = null;
    shareOpen = false;
    pendingShare = false;
  }

  function onBoothHotspot(id: BoothHotspotId) {
    const panel = boothHotspotPanel(id, { role });
    if (panel === "tv") {
      closePanels();
      tvOpen = true;
      return;
    }
    if (panel === "invite") {
      closePanels();
      inviteInBooth();
      return;
    }
    if (panel === "files") {
      chatOpen = false;
      tvOpen = false;
      seatOverlay = null;
      shareOpen = false;
      pendingShare = false;
      filesOpen = true;
      return;
    }
    if (panel === "seat") {
      const i = boothSeatIndex(id);
      chatOpen = false;
      filesOpen = false;
      tvOpen = false;
      shareOpen = false;
      pendingShare = false;
      seatOverlay = i;
    }
  }

  async function onTvFullscreen() {
    await enterTvFullscreen(expandedTvEl);
  }

  async function onUnshare(id: string) {
    goRoomFiles.unshareLocal(id);
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

  function readChromeHeightPx(): number {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--go-chrome-height")
      .trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 60;
  }

  function readRemPx(): number {
    const n = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(n) && n > 0 ? n : 16;
  }

  function onChatFocusOut(ev: FocusEvent) {
    const next = ev.relatedTarget;
    const inside = next instanceof Node && Boolean(chatPanelEl?.contains(next));
    const lost = ev.target;
    if (
      !roomChatShouldCloseOnFocusMove({
        coversCanvas,
        panelContainsNext: inside,
        nextIsNull: next == null,
        lostControlRemoved: lost instanceof Node && !lost.isConnected,
      })
    ) {
      return;
    }
    if (next == null) {
      queueMicrotask(() => {
        const active = document.activeElement;
        if (chatPanelEl && active && chatPanelEl.contains(active)) return;
        if (!coversCanvas) return;
        chatOpen = false;
      });
      return;
    }
    chatOpen = false;
  }

  function formatSize(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="room">
<div class="room-stage">
<h1 class="sr-only">包廂</h1>
<p class="sr-only" role="status">{statusLabel}</p>

<div class="room-canvas-slot" bind:this={canvasSlotEl}>
<GoBoothStage
  occupants={inBooth ? roster : []}
  {tvOn}
  {tvStream}
  {overlayOpen}
  showTools={inBooth}
  inviteEnabled={role === "host"}
  onHotspot={onBoothHotspot}
>
  {#if role === "host" && !loggedIn && phase === "idle"}
    <div class="booth-overlay" role="dialog" aria-modal="true" aria-labelledby="room-login-title">
      <div class="booth-sheet pixel-box">
        <p id="room-login-title" class="booth-sheet-title pixel-text">開包廂</p>
        <p>開這一間是為了請人進來一起看電視。被請進來的人不必有通行證。</p>
        <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onLogin?.()}>
          登入後開包廂
        </button>
        <p class="muted">{GO_ROOM_LOGIN_HINT} 單機小品不受影響。</p>
      </div>
    </div>
  {:else if phase === "connecting"}
    <div class="booth-overlay" role="status">
      <div class="booth-sheet pixel-box">
        <p>{message || "正在進包廂…"}</p>
      </div>
    </div>
  {:else if phase === "error"}
    <div class="booth-overlay" role="alert">
      <div class="booth-sheet pixel-box">
        <p class="err">{error || "無法開始"}</p>
        {#if role === "host"}
          <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onInvite?.()}>
            再試一次
          </button>
        {/if}
      </div>
    </div>
  {:else if phase === "ended"}
    <div class="booth-overlay" role="status">
      <div class="booth-sheet pixel-box">
        <p>{message || "這一間已結束"}</p>
        <div class="room-actions">
          {#if role === "host" && loggedIn}
            <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onReissue?.()}>
              再開一間
            </button>
          {/if}
          <a class="pixel-btn" href="/">回遊樂場大廳</a>
        </div>
      </div>
    </div>
  {:else if tvOpen && inBooth}
    <div class="booth-overlay" role="dialog" aria-modal="true" aria-labelledby="room-tv-title">
      <div class="booth-sheet pixel-box">
        <div class="booth-sheet-bar">
          <p id="room-tv-title" class="booth-sheet-title pixel-text">{GO_ROOM_TV_TITLE}</p>
          <button type="button" class="pixel-btn" onclick={() => (tvOpen = false)}>關閉</button>
        </div>
        <p>{tvLabel}</p>
        {#if tvOn}
          <video
            bind:this={expandedTvEl}
            class="media-video media-video--program"
            autoplay
            playsinline
            controls
            aria-label={GO_ROOM_TV_TITLE}
          ></video>
          <div class="file-actions">
            <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => void onTvFullscreen()}>
              {GO_ROOM_TV_FULLSCREEN}
            </button>
            {#if role === "host"}
              <button type="button" class="pixel-btn" onclick={() => void onStopTv()}>
                {GO_ROOM_TV_OFF_BTN}
              </button>
            {/if}
          </div>
        {:else}
          <p class="muted">
            {role === "host" ? GO_ROOM_TV_HINT_HOST : GO_ROOM_TV_HINT_GUEST}
          </p>
        {/if}
      </div>
    </div>
  {:else if filesOpen && showComposer}
    <div
      class={["booth-overlay", dropping && "booth-overlay--drop"].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-files-title"
      ondragover={(e) => {
        e.preventDefault();
        dropping = true;
      }}
      ondragleave={() => (dropping = false)}
      ondrop={(e) => {
        e.preventDefault();
        dropping = false;
        const list = e.dataTransfer?.files;
        if (list) void shareFiles(list);
      }}
    >
      <div class="booth-sheet pixel-box">
        <div class="booth-sheet-bar">
          <p id="room-files-title" class="booth-sheet-title pixel-text">分享區</p>
          <button type="button" class="pixel-btn" onclick={() => (filesOpen = false)}>關閉</button>
        </div>
        {#if goRoomFiles.playback}
          <div class="file-player">
            {#if goRoomFiles.playback.kind === "audio"}
              <audio
                bind:this={filePlayEl}
                class="file-player-audio"
                controls
                playsinline
                ontimeupdate={() =>
                  goRoomFiles.notePlayhead(filePlayEl?.currentTime ?? 0)}
                aria-label="播放 {goRoomFiles.playback.name}"
              ></audio>
            {:else}
              <video
                bind:this={filePlayEl}
                class="media-video media-video--program"
                controls
                playsinline
                ontimeupdate={() =>
                  goRoomFiles.notePlayhead(filePlayEl?.currentTime ?? 0)}
                aria-label="播放 {goRoomFiles.playback.name}"
              ></video>
            {/if}
            <button type="button" class="pixel-btn" onclick={() => goRoomFiles.stopPlay()}>
              {GO_ROOM_CAST_STOP_WATCH}
            </button>
          </div>
        {/if}
        <p class="muted">
          只掛檔；影音可私下播放或下載。放到電視上才是全場同一路。
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
        <div class="file-actions">
          <button type="button" class="pixel-btn" onclick={() => fileInput?.click()}>
            選擇檔案
          </button>
        </div>
        {#if files.length === 0}
          <p class="muted">把檔案拖到這裡，或按選擇檔案（可多選）。</p>
        {/if}
        <ul class="file-list">
          {#each files as f (f.id)}
            {@const transferHint = catalogTransferHint({
              status: f.status,
              playing: goRoomFiles.playback?.id === f.id,
            })}
            <li class="file-row">
              <p class="file-name">{f.path || f.name}</p>
              <p class="muted">
                {formatSize(f.size)} · {f.mine ? "我" : f.ownerName}
                {#if transferHint} · {transferHint} {formatSize(f.received)}
                {:else if f.status === "error"} · {f.error || "失敗"}
                {/if}
              </p>
              <div class="file-actions">
                {#if catalogConsumes(f).includes("play")}
                  <button
                    type="button"
                    class="pixel-btn"
                    disabled={f.status === "transferring" && goRoomFiles.playback?.id !== f.id}
                    onclick={() => void onPlayFile(f.id)}
                  >
                    {goRoomFiles.playback?.id === f.id
                      ? "停止播放"
                      : catalogPlayLabel(f)}
                  </button>
                {/if}
                {#if role === "host" && f.mine && catalogConsumes(f).includes("play")}
                  <button
                    type="button"
                    class="pixel-btn pixel-btn--primary"
                    onclick={() => void onPutOnTv(f.id)}
                  >
                    {GO_ROOM_PUT_ON_TV}
                  </button>
                {/if}
                {#if f.mine}
                  <button type="button" class="pixel-btn" onclick={() => void onUnshare(f.id)}>
                    撤回
                  </button>
                {:else if catalogConsumes(f).includes("download")}
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
      </div>
    </div>
  {:else if seatPerson}
    <div class="booth-overlay" role="dialog" aria-modal="true" aria-label={seatPerson.name}>
      <div class="booth-sheet pixel-box">
        <div class="booth-sheet-bar">
          <p class="booth-sheet-title pixel-text">{seatPerson.name}</p>
          <button type="button" class="pixel-btn" onclick={() => (seatOverlay = null)}>關閉</button>
        </div>
        {#if seatPerson.liveVideo || seatPerson.liveAudio}
          <p class="muted">
            {seatPerson.liveVideo
              ? seatPerson.mine && goRoomMedia.display
                ? "畫面已開"
                : "鏡頭已開"
              : "麥克風已開"}
          </p>
        {/if}
        <div class="file-actions">
          {#if role === "host" && (seatPerson.liveVideo || seatPerson.liveAudio)}
            <button
              type="button"
              class="pixel-btn pixel-btn--primary"
              onclick={() =>
                void onPutLiveOnTv(seatPerson.mine ? "local" : seatPerson.peerId, seatPerson.name)}
            >
              {GO_ROOM_PUT_ON_TV}
            </button>
          {:else if !seatPerson.mine && (seatPerson.liveVideo || seatPerson.liveAudio)}
            {#if goRoomMedia.watching || goRoomMedia.listening}
              <button type="button" class="pixel-btn" onclick={() => void onStopWatching()}>
                {GO_ROOM_CAMERA_STOP_WATCH}
              </button>
            {:else}
              <button
                type="button"
                class="pixel-btn pixel-btn--primary"
                onclick={() => void onWatchOccupant(seatPerson.peerId)}
              >
                收看
              </button>
            {/if}
          {:else}
            <p class="muted">點座位不會自動上電視。</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</GoBoothStage>
</div>

{#if inBooth}
  <nav class="room-dock" aria-label="包廂操作">
    <button type="button" class="pixel-btn" onclick={() => askEnd(true)}>回大廳</button>
    <button
      type="button"
      class="pixel-btn pixel-btn--primary"
      onclick={() => void onToggleMic()}
    >
      {goRoomMedia.mic ? "關麥克風" : "開麥克風"}
    </button>
    <button
      type="button"
      class="pixel-btn"
      data-room-chat-toggle
      aria-expanded={chatOpen}
      onclick={() => {
        chatOpen = !chatOpen;
        if (chatOpen) {
          filesOpen = false;
          tvOpen = false;
          seatOverlay = null;
        }
      }}
    >
      文字{#if messages.length > 0} · {messages.length}{/if}
    </button>
    <button type="button" class="pixel-btn" onclick={() => void onToggleCamera()}>
      {goRoomMedia.camera ? "關鏡頭" : "開鏡頭"}
    </button>
    {#if canShareDisplay()}
      <button type="button" class="pixel-btn" onclick={() => void onToggleDisplay()}>
        {goRoomMedia.display ? "停止畫面" : "分享畫面"}
      </button>
    {/if}
    {#if role === "host" && tvOn}
      <button type="button" class="pixel-btn" onclick={() => void onStopTv()}>
        {GO_ROOM_TV_OFF_BTN}
      </button>
    {/if}
    <button type="button" class="pixel-btn pixel-btn--danger-outline" onclick={() => askEnd()}>
      {role === "host" ? "結束" : "離開"}
    </button>
  </nav>
  {#if mediaError}
    <p class="err" role="alert">{mediaError}</p>
  {/if}
  {#if goRoomMedia.error && goRoomMedia.error !== mediaError}
    <p class="err" role="alert">{goRoomMedia.error}</p>
  {/if}
  <video
    bind:this={localPreviewEl}
    class="media-video media-video--idle"
    autoplay
    muted
    playsinline
    aria-hidden="true"
  ></video>
  <video
    bind:this={presenceVideoEl}
    class="media-video media-video--idle"
    autoplay
    playsinline
    muted={!goRoomMedia.listening}
    aria-hidden="true"
  ></video>
{:else}
  <nav class="room-dock" aria-label="包廂操作">
    {#if live}
      <button type="button" class="pixel-btn" onclick={() => askEnd(true)}>回大廳</button>
    {:else}
      <a class="pixel-btn" href="/">回大廳</a>
    {/if}
  </nav>
{/if}

</div>

{#if chatOpen && showComposer}
  {#if coversCanvas}
    <button
      type="button"
      class="room-chat-scrim"
      aria-label="關閉文字"
      onclick={() => (chatOpen = false)}
    ></button>
  {/if}
  <aside
    bind:this={chatPanelEl}
    class="room-chat room-chat--overlay"
    role={coversCanvas ? "dialog" : "complementary"}
    aria-modal={coversCanvas ? "true" : undefined}
    tabindex={coversCanvas ? -1 : undefined}
    aria-label="包廂文字"
    onfocusout={onChatFocusOut}
  >
    <div class="room-chat-bar">
      <p class="room-chat-title pixel-text">文字</p>
      <button type="button" class="pixel-btn" onclick={() => (chatOpen = false)}>關閉</button>
    </div>
    <div class="room-timeline" bind:this={listEl} role="log" aria-label="包廂文字">
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
        bind:this={composerInputEl}
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
  </aside>
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
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .room {
    width: 100%;
    max-width: 40rem;
    margin-inline: auto;
  }
  .room-stage {
    width: 100%;
    max-width: 40rem;
    margin-inline: auto;
  }
  .room-canvas-slot {
    width: 100%;
  }
  .room-chat-scrim {
    position: fixed;
    top: var(--go-chrome-height, 3.75rem);
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 14;
    margin: 0;
    padding: 0;
    border: none;
    background: color-mix(in oklab, rgb(var(--ink)) 28%, transparent);
    cursor: pointer;
  }
  .room-chat {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0.65rem 0.75rem calc(0.65rem + env(safe-area-inset-bottom, 0px));
    background: rgb(var(--card));
    box-sizing: border-box;
  }
  .room-chat--overlay {
    position: fixed;
    top: var(--go-chrome-height, 3.75rem);
    right: 0;
    bottom: 0;
    left: auto;
    z-index: 15;
    width: min(22rem, calc(100vw - 2.75rem));
    border-left: var(--pixel-edge) solid rgb(var(--ink));
  }
  .room-chat-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    flex: 0 0 auto;
    margin-bottom: 0.5rem;
  }
  .room-chat-title {
    margin: 0;
    font-size: 0.9rem;
  }
  .room-chat-bar .pixel-btn {
    min-height: 44px;
  }
  .booth-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    z-index: 2;
    background: color-mix(in oklab, rgb(var(--ink)) 22%, transparent);
    border-radius: var(--radius);
  }
  .booth-overlay--drop {
    outline: 2px dashed rgb(var(--ink));
    outline-offset: -6px;
  }
  .booth-sheet {
    width: 100%;
    max-height: min(70%, 28rem);
    overflow: auto;
    padding: 0.75rem 0.85rem 0.9rem;
    background: rgb(var(--card));
    border-radius: 0 0 var(--radius) var(--radius);
    border-top: var(--pixel-edge) solid rgb(var(--ink));
  }
  .booth-sheet-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .booth-sheet-title {
    margin: 0;
    font-size: 0.9rem;
  }
  .booth-sheet-bar .pixel-btn {
    min-height: 44px;
  }
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
    flex: 1 1 auto;
    min-height: 0;
  }
  .room-col {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    flex: 1 1 auto;
  }
  .room-chat-drawer {
    padding: 0.65rem;
  }
  .room-timeline {
    flex: 1 1 auto;
    min-height: 0;
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
    position: relative;
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
  .media-previews {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.5rem 0;
  }
  .media-previews--idle:empty {
    display: none;
    margin: 0;
  }
  .media-video--idle {
    position: absolute;
    width: 2px;
    height: 2px;
    opacity: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .media-video--presence {
    width: min(100%, 10rem);
    max-height: 5rem;
    object-fit: cover;
  }
  .owner-decode {
    display: grid;
    gap: 0.4rem;
    margin: 0.6rem 0 0.4rem;
  }
  .owner-decode-video {
    width: 100%;
    max-width: 100%;
  }
  .owner-decode-audio {
    width: 100%;
    min-height: 44px;
  }
  .media-video {
    width: 100%;
    max-width: 16rem;
    aspect-ratio: 4 / 3;
    background: #111;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    object-fit: cover;
  }
  .media-video--program {
    max-width: 100%;
    aspect-ratio: 16 / 9;
  }
  @media (min-width: 40rem) {
    .media-video {
      width: 10rem;
    }
    .media-video--program {
      width: 100%;
      max-width: 28rem;
    }
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
  .occupant-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }
  .occupant-chip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    min-height: 44px;
    padding: 0.2rem 0.45rem;
    border: 1px solid rgb(var(--line));
    background: rgb(var(--panel));
  }
  .occupant-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    font-weight: 700;
    background: rgb(var(--ink) / 0.12);
  }
  .occupant-live {
    font-size: 0.8rem;
    font-weight: 700;
  }
  .occupant-watch {
    min-height: 44px;
    margin: 0;
  }
  .live-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.45rem 0 0;
  }
  .live-toolbar .pixel-btn {
    min-height: 44px;
    margin: 0;
  }
  .file-player {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }
  .file-player-audio {
    width: 100%;
  }
  .quick-toggle {
    min-height: 44px;
    flex: 0 0 auto;
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
    margin: 0.5rem 0 0;
    flex: 0 0 auto;
  }
  .composer-input {
    flex: 1 1 12rem;
    min-height: 44px;
  }
  .composer button[type="submit"] {
    min-height: 44px;
  }
  .room-dock {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.45rem 0 0;
    padding: 0 0 calc(0.35rem + env(safe-area-inset-bottom, 0px));
  }
  .room-dock .pixel-btn {
    min-height: 44px;
    flex: 0 1 auto;
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
    .room-head-actions {
      display: none;
    }
    .room-side {
      display: block;
      flex: 0 0 16rem;
      flex-shrink: 0;
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
