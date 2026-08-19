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
  import GoAdSlot from "$lib/GoAdSlot.svelte";
  import GoRoomTvSlot from "$lib/GoRoomTvSlot.svelte";
  import { roomAdClickAction } from "$lib/goAds";
  import { chromeSession } from "$lib/chromeSession.svelte";
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
    roomChatWhoLabel,
    roomChromeHideable,
    roomChromePeekInsetEndPx,
    roomChromeShouldHold,
    roomCinemaActive,
    roomCinemaAllowed,
    roomEscStep,
    roomInviteDoorRow,
    roomInviteRemainLabel,
    roomOccupantRows,
    roomShowAdSlot,
    roomShellDefaultPane,
    roomShellMode,
    roomShellPanesConcurrent,
    roomStageStatus,
    roomTvLabel,
    roomTvStream,
    takePickedFiles,
    type RoomInviteDoor,
    type RoomOccupantPeer,
    type RoomShellPane,
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
  let pendingAdHref = $state<string | null>(null);
  let confirmDialog = $state<HTMLDialogElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let fileError = $state("");
  let mediaError = $state("");
  let presenceVideoEl = $state<HTMLVideoElement | null>(null);
  let localPreviewEl = $state<HTMLVideoElement | null>(null);
  let filePlayEl = $state<HTMLMediaElement | null>(null);
  let now = $state(Date.now());
  let pane = $state<RoomShellPane>(roomShellDefaultPane());
  let composerFocused = $state(false);
  let composerInputEl = $state<HTMLInputElement | null>(null);
  let roomEl = $state<HTMLElement | null>(null);
  let railEl = $state<HTMLElement | null>(null);
  let shellBox = $state({ widthPx: 0, heightPx: 0 });
  let railLeftPx = $state(0);
  let tvOpen = $state(false);
  let selectedPeerId = $state<string | null>(null);
  let pendingShare = $state(false);
  let tvVideoEl = $state<HTMLVideoElement | null>(null);
  let cinemaUserExit = $state(false);
  let cinemaDrawer = $state(false);

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
    tvOpen ||
      (role === "host" && !loggedIn && phase === "idle") ||
      phase === "connecting" ||
      phase === "error" ||
      phase === "ended"
  );
  const shellMode = $derived(roomShellMode(shellBox));
  const selectedPerson = $derived(
    selectedPeerId
      ? (roster.find((p) => p.peerId === selectedPeerId) ?? null)
      : null
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
  const doorRow = $derived(
    roomInviteDoorRow({
      door,
      remainLabel: roomInviteRemainLabel(inviteExpiresAt, now),
    })
  );
  const hideChrome = $derived(
    roomChromeHideable({ role, phase, loggedIn, inBooth })
  );
  const cinemaAllowed = $derived(
    roomCinemaAllowed({ inBooth, phase })
  );
  const cinema = $derived(
    roomCinemaActive({
      allowed: cinemaAllowed,
      tvOn,
      userExit: cinemaUserExit,
    })
  );
  const showAd = $derived(
    roomShowAdSlot({
      inBooth,
      tvOn,
    })
  );
  const panesConcurrent = $derived(
    roomShellPanesConcurrent(shellMode, cinema)
  );
  const showPaneBody = $derived(!cinema || cinemaDrawer);
  const showMembers = $derived(
    showPaneBody && (panesConcurrent || pane === "members")
  );
  const showFiles = $derived(
    showPaneBody && (panesConcurrent || pane === "files")
  );
  const showChat = $derived(
    showPaneBody && (panesConcurrent || pane === "chat")
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
    const el = roomEl;
    const rail = railEl;
    if (!el) return;
    const apply = () => {
      shellBox = { widthPx: el.clientWidth, heightPx: el.clientHeight };
      railLeftPx = rail?.getBoundingClientRect().left ?? 0;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    if (rail) ro.observe(rail);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  });

  $effect(() => {
    chromeSession.setCanvasActive(hideChrome);
    return () => chromeSession.setCanvasActive(false);
  });

  $effect(() => {
    chromeSession.peekInsetEndPx = roomChromePeekInsetEndPx({
      mode: shellMode,
      cinema,
      viewportWidthPx: document.documentElement.clientWidth,
      railLeftPx,
    });
    return () => {
      chromeSession.peekInsetEndPx = 0;
    };
  });

  $effect(() => {
    chromeSession.holdAutoHide = roomChromeShouldHold({
      shareOpen,
      confirmOpen: confirmEnd,
      composerFocused,
      overlayOpen,
      drawerOpen: cinema && cinemaDrawer,
    });
    return () => {
      chromeSession.holdAutoHide = false;
    };
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
    if (!tvOn) cinemaUserExit = false;
  });

  $effect(() => {
    if (!cinema) cinemaDrawer = false;
  });

  $effect(() => {
    chromeSession.escapeGuard = () => {
      const step = roomEscStep({
        shareOpen,
        tvOpen,
        selectedPeerId,
        cinema,
        drawerOpen: cinemaDrawer,
      });
      if (step === "close-share") {
        shareOpen = false;
        pendingShare = false;
        return false;
      }
      if (step === "close-tv-sheet") {
        tvOpen = false;
        return false;
      }
      if (step === "clear-peer") {
        selectedPeerId = null;
        return false;
      }
      if (step === "close-drawer") {
        cinemaDrawer = false;
        return false;
      }
      if (step === "exit-cinema") {
        cinemaUserExit = true;
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
    pane = "files";
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

  async function onTvFullscreen() {
    await enterTvFullscreen(tvVideoEl);
  }

  async function onUnshare(id: string) {
    goRoomFiles.unshareLocal(id);
  }

  function dismissConfirm() {
    confirmEnd = false;
    pendingAdHref = null;
  }

  function askEnd(leaveHome = false) {
    pendingAdHref = null;
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
    const adHref = pendingAdHref;
    pendingAdHref = null;
    await onEnd?.();
    if (adHref) void goto(adHref);
    else if (leaveAfterEnd) void goto("/");
    leaveAfterEnd = false;
  }

  function onAdNavigate(href: string) {
    if (roomAdClickAction(live) === "goto") {
      void goto(href);
      return;
    }
    pendingAdHref = href;
    leaveAfterEnd = false;
    confirmEnd = true;
  }

  function onTvHit() {
    if (!cinema && tvOn && cinemaAllowed) {
      cinemaUserExit = false;
      return;
    }
    tvOpen = true;
  }

  function onPaneTab(id: RoomShellPane) {
    if (cinema) {
      if (cinemaDrawer && pane === id) {
        cinemaDrawer = false;
        return;
      }
      pane = id;
      cinemaDrawer = true;
      return;
    }
    pane = id;
  }

  function paneTabOn(id: RoomShellPane): boolean {
    return pane === id && (!cinema || cinemaDrawer);
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

<div
  class={[
    "room",
    `room--${shellMode}`,
    hideChrome && "room--chrome-overlay",
    cinema && "room--cinema",
  ]
    .filter(Boolean)
    .join(" ")}
  bind:this={roomEl}
>
  <h1 class="sr-only">包廂</h1>
  <p class="sr-only" role="status">{statusLabel}</p>

  <div class="room-tv-col">
    <div class="room-tv-stage">
      <GoRoomTvSlot {tvOn} {tvStream} bind:videoEl={tvVideoEl} onOpen={onTvHit} />
      {#if showAd}
        <div class="room-ad">
          <GoAdSlot onNavigate={onAdNavigate} />
        </div>
      {/if}
    </div>
    <p class="room-status">{statusLabel}</p>
  </div>

  {#if inBooth}
    {#if cinema && cinemaDrawer}
      <button
        type="button"
        class="cinema-scrim"
        aria-label="關閉分區"
        onclick={() => (cinemaDrawer = false)}
      ></button>
    {/if}
    <div
      class={["room-shell", cinema && cinemaDrawer && "room-shell--drawer"]
        .filter(Boolean)
        .join(" ")}
      bind:this={railEl}
    >
      {#if !panesConcurrent}
        <nav class="room-tabs" aria-label="包廂分區">
          <button
            type="button"
            class={["pixel-btn", paneTabOn("members") && "pixel-btn--primary"].filter(Boolean).join(" ")}
            aria-pressed={paneTabOn("members")}
            aria-expanded={cinema ? cinemaDrawer && pane === "members" : undefined}
            onclick={() => onPaneTab("members")}
          >
            成員
          </button>
          <button
            type="button"
            class={["pixel-btn", paneTabOn("files") && "pixel-btn--primary"].filter(Boolean).join(" ")}
            aria-pressed={paneTabOn("files")}
            aria-expanded={cinema ? cinemaDrawer && pane === "files" : undefined}
            onclick={() => onPaneTab("files")}
          >
            檔案
          </button>
          <button
            type="button"
            class={["pixel-btn", paneTabOn("chat") && "pixel-btn--primary"].filter(Boolean).join(" ")}
            aria-pressed={paneTabOn("chat")}
            aria-expanded={cinema ? cinemaDrawer && pane === "chat" : undefined}
            onclick={() => onPaneTab("chat")}
          >
            文字{#if messages.length > 0} · {messages.length}{/if}
          </button>
        </nav>
      {/if}

      {#if showMembers}
        <section class="room-pane" aria-label="成員">
          {#if panesConcurrent}
            <p class="room-pane-title pixel-text">成員</p>
          {/if}
          {#if role === "host"}
            <p class="muted">{doorRow.label}</p>
            <div class="file-actions">
              <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => inviteInBooth()}>
                {doorRow.action}
              </button>
            </div>
          {/if}
          <ul class="member-list">
            {#each roster as person, i (person.peerId)}
              <li>
                <button
                  type="button"
                  class="member-row"
                  onclick={() =>
                    (selectedPeerId =
                      selectedPeerId === person.peerId ? null : person.peerId)}
                >
                  <span>
                    {#if i === 0 && role === "host"}
                      <span class="host-tag">主持</span>
                    {/if}
                    {person.name}
                  </span>
                  <span class="muted">
                    {#if person.liveVideo}鏡頭{/if}
                    {#if person.liveAudio}{#if person.liveVideo} · {/if}麥{/if}
                    {#if !person.liveVideo && !person.liveAudio}—{/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
          {#if selectedPerson}
            <div class="member-detail">
              {#if selectedPerson.liveVideo || selectedPerson.liveAudio}
                <p class="muted">
                  {selectedPerson.liveVideo
                    ? selectedPerson.mine && goRoomMedia.display
                      ? "畫面已開"
                      : "鏡頭已開"
                    : "麥克風已開"}
                </p>
              {/if}
              <div class="file-actions">
                {#if role === "host" && (selectedPerson.liveVideo || selectedPerson.liveAudio)}
                  <button
                    type="button"
                    class="pixel-btn pixel-btn--primary"
                    onclick={() =>
                      void onPutLiveOnTv(
                        selectedPerson.mine ? "local" : selectedPerson.peerId,
                        selectedPerson.name
                      )}
                  >
                    {GO_ROOM_PUT_ON_TV}
                  </button>
                {:else if !selectedPerson.mine && (selectedPerson.liveVideo || selectedPerson.liveAudio)}
                  {#if goRoomMedia.watching || goRoomMedia.listening}
                    <button type="button" class="pixel-btn" onclick={() => void onStopWatching()}>
                      {GO_ROOM_CAMERA_STOP_WATCH}
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="pixel-btn pixel-btn--primary"
                      onclick={() => void onWatchOccupant(selectedPerson.peerId)}
                    >
                      收看
                    </button>
                  {/if}
                {:else}
                  <p class="muted">點成員不會自動上電視。</p>
                {/if}
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if showFiles && showComposer}
        <section
          class={["room-pane", dropping && "room-pane--drop"].filter(Boolean).join(" ")}
          aria-label="檔案"
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
          {#if panesConcurrent}
            <p class="room-pane-title pixel-text">檔案</p>
          {/if}
          {#if goRoomFiles.playback}
            <div class="file-player">
              {#if goRoomFiles.playback.kind === "audio"}
                <audio
                  bind:this={filePlayEl}
                  class="file-player-audio"
                  controls
                  playsinline
                  ontimeupdate={() => goRoomFiles.notePlayhead(filePlayEl?.currentTime ?? 0)}
                  aria-label="播放 {goRoomFiles.playback.name}"
                ></audio>
              {:else}
                <video
                  bind:this={filePlayEl}
                  class="media-video media-video--program"
                  controls
                  playsinline
                  ontimeupdate={() => goRoomFiles.notePlayhead(filePlayEl?.currentTime ?? 0)}
                  aria-label="播放 {goRoomFiles.playback.name}"
                ></video>
              {/if}
              <button type="button" class="pixel-btn" onclick={() => goRoomFiles.stopPlay()}>
                {GO_ROOM_CAST_STOP_WATCH}
              </button>
            </div>
          {/if}
          <p class="muted">只掛檔；影音可私下播放或下載。放到電視上才是全場同一路。</p>
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
                      {goRoomFiles.playback?.id === f.id ? "停止播放" : catalogPlayLabel(f)}
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
        </section>
      {/if}

      {#if showChat && showComposer}
        <section class="room-pane room-pane--chat" aria-label="包廂文字">
          {#if panesConcurrent}
            <p class="room-pane-title pixel-text">文字</p>
          {/if}
          <div class="room-timeline" bind:this={listEl} role="log" aria-label="包廂文字">
            {#if messages.length === 0}
              <p class="muted">{GO_ROOM_EMPTY_TIMELINE}</p>
            {/if}
            {#each messages as m (m.id)}
              <div
                class={["bubble", m.local && "bubble--local", isHostMsg(m) && "bubble--host"]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span class="bubble-who">
                  {#if isHostMsg(m)}<span class="host-tag">主持</span>{/if}
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
              onfocus={() => (composerFocused = true)}
              onblur={() => (composerFocused = false)}
            />
            <button type="submit" class="pixel-btn pixel-btn--primary" disabled={!draft.trim()}>
              送出
            </button>
          </form>
        </section>
      {/if}
    </div>
  {/if}

  {#if inBooth}
    <nav class="room-dock" aria-label="包廂操作">
      <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => void onToggleMic()}>
        {goRoomMedia.mic ? "關麥克風" : "開麥克風"}
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
  {/if}

  {#if overlayOpen}
    <div class="room-sheet" role="dialog" aria-modal="true">
      {#if role === "host" && !loggedIn && phase === "idle"}
        <div class="booth-sheet pixel-box">
          <p class="booth-sheet-title pixel-text">開包廂</p>
          <p>開這一間是為了請人進來一起看電視。被請進來的人不必有通行證。</p>
          <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onLogin?.()}>
            登入後開包廂
          </button>
          <p class="muted">{GO_ROOM_LOGIN_HINT} 單機小品不受影響。</p>
        </div>
      {:else if phase === "connecting"}
        <div class="booth-sheet pixel-box">
          <p>{message || "正在進包廂…"}</p>
        </div>
      {:else if phase === "error"}
        <div class="booth-sheet pixel-box">
          <p class="err">{error || "無法開始"}</p>
          {#if role === "host"}
            <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onInvite?.()}>
              再試一次
            </button>
          {/if}
        </div>
      {:else if phase === "ended"}
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
      {:else if tvOpen && inBooth}
        <div class="booth-sheet pixel-box">
          <div class="booth-sheet-bar">
            <p class="booth-sheet-title pixel-text">{GO_ROOM_TV_TITLE}</p>
            <button type="button" class="pixel-btn" onclick={() => (tvOpen = false)}>關閉</button>
          </div>
          <p>{tvLabel}</p>
          {#if tvOn}
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
      {/if}
    </div>
  {/if}

  <dialog
    bind:this={confirmDialog}
    class="confirm-dialog"
    aria-labelledby="room-end-title"
    oncancel={(e) => {
      e.preventDefault();
      dismissConfirm();
    }}
    onclick={(e) => {
      if (e.target === confirmDialog) dismissConfirm();
    }}
  >
    <div class="confirm pixel-frame">
      <h2 id="room-end-title" class="confirm-title">
        {#if pendingAdHref}
          {role === "host" ? "結束這一間並打開小品？" : "離開這一間並打開小品？"}
        {:else}
          {role === "host" ? "結束這一間？" : "離開這一間？"}
        {/if}
      </h2>
      <p class="confirm-body">
        {role === "host" ? GO_ROOM_END_CONFIRM_HOST : GO_ROOM_LEAVE_CONFIRM_GUEST}
      </p>
      <div class="confirm-actions">
        <button type="button" class="pixel-btn" onclick={() => dismissConfirm()}>取消</button>
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
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    width: 100%;
    min-height: 0;
    min-width: 0;
    box-sizing: border-box;
  }
  .room--chrome-overlay {
    height: 100%;
    min-height: 100%;
    overflow: hidden;
    padding: 0.35rem 0.65rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
  }
  .room--cinema {
    position: relative;
    height: 100%;
    min-height: 100%;
    overflow: hidden;
    padding: 0;
    gap: 0;
  }
  .room--cinema .room-tv-col {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
  .room--cinema .room-tv-col :global(.tv-slot) {
    height: 100%;
    aspect-ratio: auto;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }
  .room--cinema .room-tv-stage {
    height: 100%;
  }
  .room--cinema .room-status {
    position: absolute;
    left: 0.55rem;
    right: 0.55rem;
    top: 0.45rem;
    z-index: 3;
    margin: 0;
    pointer-events: none;
    text-shadow: 0 1px 0 #000;
    color: #f4efe4;
  }
  .cinema-scrim {
    position: absolute;
    inset: 0;
    z-index: 4;
    margin: 0;
    padding: 0;
    border: none;
    background: color-mix(in oklab, rgb(var(--ink)) 28%, transparent);
    cursor: pointer;
  }
  .room--cinema .room-shell {
    position: absolute;
    left: 0.4rem;
    right: 0.4rem;
    bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px));
    z-index: 5;
    flex: none;
    min-height: 0;
  }
  .room--cinema .room-shell--drawer {
    max-height: min(70dvh, 28rem);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0.45rem 0.55rem 0.35rem;
    background: rgb(var(--card));
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    box-shadow: var(--pixel-shadow);
  }
  .room--cinema .room-shell--drawer .room-pane {
    flex: 1 1 auto;
  }
  .room--cinema .room-tabs {
    padding: 0.2rem;
    background: color-mix(in oklab, rgb(var(--card)) 88%, transparent);
    border-radius: var(--radius);
  }
  .room--cinema .room-dock {
    position: absolute;
    left: 0.4rem;
    right: 0.4rem;
    bottom: calc(0.3rem + env(safe-area-inset-bottom, 0px));
    z-index: 5;
    padding: 0.2rem;
    background: color-mix(in oklab, rgb(var(--card)) 88%, transparent);
    border-radius: var(--radius);
  }
  .room-tv-col {
    flex: 0 0 auto;
    min-width: 0;
  }
  .room-tv-stage {
    position: relative;
    min-width: 0;
    container-type: inline-size;
  }
  .room-ad {
    position: absolute;
    left: 50%;
    bottom: 0.4rem;
    z-index: 2;
    width: min(calc(100% - 0.7rem), 20rem);
    transform: translateX(-50%);
    pointer-events: none;
  }
  .room-ad :global(.go-ad-slot) {
    margin: 0;
    width: 100%;
    max-width: 100%;
    pointer-events: auto;
  }
  @container (min-width: 48rem) {
    .room-ad {
      width: min(calc(100% - 0.8rem), 45.5rem);
    }
  }
  .room-status {
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
    color: color-mix(in oklab, rgb(var(--ink)) 72%, transparent);
  }
  .room-shell {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1 1 auto;
    gap: 0.45rem;
  }
  .room-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .room-tabs .pixel-btn {
    min-height: 44px;
    flex: 1 1 auto;
  }
  .room-pane {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 0.55rem 0.15rem 0.2rem;
  }
  .room-pane--drop {
    outline: 2px dashed rgb(var(--ink));
  }
  .room-pane-title {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
  }
  .room-pane--chat {
    display: flex;
    flex-direction: column;
    min-height: 10rem;
  }
  .member-list {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
  }
  .member-row {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0;
    border: none;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .member-detail {
    margin-top: 0.4rem;
  }
  .room-dock {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    flex: 0 0 auto;
  }
  .room-dock .pixel-btn {
    min-height: 44px;
  }
  .room-sheet {
    position: fixed;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: flex-end;
    background: color-mix(in oklab, rgb(var(--ink)) 28%, transparent);
  }
  .booth-sheet {
    width: 100%;
    max-height: min(80%, 32rem);
    overflow: auto;
    padding: 0.75rem 0.85rem 0.9rem;
    background: rgb(var(--card));
    border-radius: var(--radius) var(--radius) 0 0;
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
  .muted {
    color: color-mix(in oklab, rgb(var(--ink)) 72%, transparent);
    font-size: 0.88rem;
  }
  .err {
    color: rgb(180 35 45);
    margin: 0 0 0.5rem;
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
  .file-list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }
  .file-row {
    padding: 0.45rem 0;
    border-top: 1px solid color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
  }
  .file-name {
    margin: 0;
    font-weight: 700;
  }
  .file-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.35rem;
  }
  .file-actions .pixel-btn {
    min-height: 44px;
  }
  .file-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .file-player {
    margin: 0 0 0.5rem;
  }
  .file-player-audio {
    width: 100%;
  }
  .media-video--idle {
    position: absolute;
    width: 2px;
    height: 2px;
    opacity: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .media-video--program {
    width: 100%;
    max-height: 12rem;
    background: #000;
  }
  .quick-toggle {
    min-height: 44px;
    margin: 0.35rem 0;
    border: none;
    background: none;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .quick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-bottom: 0.4rem;
  }
  .composer {
    display: flex;
    gap: 0.35rem;
    margin-top: auto;
  }
  .composer-input {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
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
  @media (min-width: 40rem) {
    .room--tablet .room-shell,
    .room--desktop .room-shell {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.6rem;
      min-height: 12rem;
    }
    .room--tablet .room-tabs,
    .room--desktop .room-tabs {
      display: none;
    }
  }
  @media (min-width: 64rem) {
    .room--desktop {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 22rem;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 0.65rem;
      max-width: none;
      height: 100%;
    }
    .room--desktop .room-tv-col {
      grid-column: 1;
      grid-row: 1;
      align-self: stretch;
    }
    .room--desktop .room-tv-stage {
      height: calc(100% - 1.6rem);
    }
    .room--desktop .room-tv-col :global(.tv-slot) {
      height: 100%;
      aspect-ratio: auto;
    }
    .room--desktop .room-shell {
      grid-column: 2;
      grid-row: 1;
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr);
    }
    .room--desktop .room-dock {
      grid-column: 1 / span 2;
      grid-row: 2;
    }
  }
  @media (orientation: landscape) and (max-height: 560px) {
    .room--short-landscape {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(12rem, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
      gap: 0.35rem;
      padding: 0.2rem 0.4rem;
    }
    .room--short-landscape .room-tv-col {
      grid-column: 1;
      grid-row: 1;
      min-height: 0;
    }
    .room--short-landscape .room-tv-stage {
      height: calc(100% - 1.4rem);
      min-height: 0;
    }
    .room--short-landscape .room-tv-col :global(.tv-slot) {
      height: 100%;
      aspect-ratio: auto;
    }
    .room--short-landscape .room-shell {
      grid-column: 2;
      grid-row: 1;
      min-height: 0;
    }
    .room--short-landscape .room-dock {
      grid-column: 1 / span 2;
      grid-row: 2;
    }
  }
  @media (min-width: 40rem) {
    .confirm-actions,
    .room-actions {
      flex-direction: row;
    }
  }
  /* Cinema wins over hall RWD grids: always app-level fullscreen + overlay. */
  .room.room--cinema {
    display: block;
    position: relative;
    height: 100%;
    min-height: 100%;
    max-height: 100%;
    overflow: hidden;
    padding: 0;
    gap: 0;
    max-width: none;
  }
  .room.room--cinema .room-tv-col {
    position: absolute;
    inset: 0;
    z-index: 0;
    grid-column: auto;
    grid-row: auto;
    min-height: 0;
  }
  .room.room--cinema .room-tv-col :global(.tv-slot) {
    height: 100%;
    aspect-ratio: auto;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }
  .room.room--cinema .room-tv-stage {
    height: 100%;
  }
  .room.room--cinema .room-tabs {
    display: flex;
  }
  .room.room--cinema .room-shell {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: auto;
    left: 0.4rem;
    right: 0.4rem;
    bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px));
    z-index: 5;
    flex: none;
    height: auto;
    min-height: 0;
    grid-column: auto;
    grid-row: auto;
    grid-template-columns: none;
    grid-template-rows: none;
  }
  .room.room--cinema .room-dock {
    position: absolute;
    left: 0.4rem;
    right: 0.4rem;
    bottom: calc(0.3rem + env(safe-area-inset-bottom, 0px));
    z-index: 5;
    grid-column: auto;
    grid-row: auto;
  }
  .room.room--cinema > .err {
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    bottom: calc(4.2rem + env(safe-area-inset-bottom, 0px));
    z-index: 6;
    margin: 0;
  }
</style>

