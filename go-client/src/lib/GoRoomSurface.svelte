<script lang="ts">
  import { onMount, tick } from "svelte";
  import { goto } from "$app/navigation";
  import {
    SESSION_CHAT_MAX_TEXT_CHARS,
    isSessionChatHostMessage,
  } from "@pg/roster/rosterSessionChat";
  import {
    SESSION_CHAT_FLOAT_EMOJIS,
    chatReactionRows,
    type SessionChatFloatEmoji,
  } from "@pg/roster/rosterSessionChatCtl";
  import { goSessionChat } from "$lib/goSessionChat.svelte";
  import { goRoomFiles } from "$lib/goRoomFiles.svelte";
  import { goRoomMedia } from "$lib/goRoomMedia.svelte";
  import { pickRoomFileSave, roomFileSaveSupported, createBrowserSaveWritable, triggerBrowserDownload } from "$lib/goRoomFileSave";
  import { ensureRoomFileSw } from "$lib/goRoomPlayBridge";
  import GoShareSheet from "$lib/GoShareSheet.svelte";
  import GoAdSlot from "$lib/GoAdSlot.svelte";
  import GoRoomTvSlot from "$lib/GoRoomTvSlot.svelte";
  import GoRoomMemberCard from "$lib/GoRoomMemberCard.svelte";
  import { goAuth } from "$lib/goAuth.svelte";
  import { roomAdClickAction } from "$lib/goAds";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import {
    GO_ROOM_CAMERA_STOP_WATCH,
    GO_ROOM_EMPTY_TIMELINE,
    GO_ROOM_END_CONFIRM_HOST,
    GO_ROOM_GATE_BODY,
    GO_ROOM_KICK,
    GO_ROOM_KICK_CONFIRM,
    GO_ROOM_LEAVE_CONFIRM_GUEST,
    GO_ROOM_LOGIN_HINT,
    GO_ROOM_PUT_ON_TV,
    GO_ROOM_ROLE_HOST,
    GO_ROOM_SHARE_HINT,
    GO_ROOM_SHARE_TITLE,
    GO_ROOM_TEXT_CAPTION,
    GO_ROOM_TEXT_DELETE,
    GO_ROOM_TEXT_LOCK,
    GO_ROOM_TEXT_LOCKED_HINT,
    GO_ROOM_TEXT_SILENCE,
    GO_ROOM_TEXT_SILENCED_HINT,
    GO_ROOM_TEXT_UNLOCK,
    GO_ROOM_TEXT_UNSILENCE,
    GO_ROOM_TV_OFF_BTN,
    GO_ROOM_OWNER_DECODE,
    attachMediaStream,
    attachPlaybackUrl,
    canShareDisplay,
    isRoomInviteShareable,
    roomChatWhoLabel,
    roomChromeHideable,
    roomChromePeekInsetEndPx,
    roomChromeShouldHold,
    roomCinemaActive,
    roomCinemaAllowed,
    roomCinemaExitOnChromeReveal,
    roomCinemaHudVisible,
    roomCinemaToggleLabel,
    roomEscStep,
    roomInviteDoorRow,
    roomInviteRemainLabel,
    roomHostLoginGate,
    roomHostMemberMenu,
    roomMemberCard,
    roomMemberCardsSorted,
    roomOccupantRows,
    roomShowAdSlot,
    roomShellActiveTab,
    roomShellDefaultPane,
    roomShellFilesPinned,
    roomShellMode,
    roomShellPanesConcurrent,
    roomShellShowPane,
    roomShellTabPanes,
    roomStageStatus,
    roomTvHudHasTransport,
    roomTvHudKind,
    roomTvHudRestore,
    roomTvLabel,
    roomTvBindStream,
    roomTvPictureOn,
    syncTvSinkPlayback,
    toggleTvFullscreen,
    tvFullscreenElement,
    tvIsFullscreen,
    takePickedFiles,
    type RoomHostMenuAction,
    type RoomInviteDoor,
    type RoomOccupantPeer,
    type RoomShellPane,
  } from "$lib/goRoom";
  import {
    catalogConsumes,
    catalogTransferHint,
  } from "$lib/goRoomCatalog";
  import {
    GO_ROOM_FILE_CANCEL,
    GO_ROOM_FILE_CAST,
    GO_ROOM_FILE_DELETE,
    GO_ROOM_FILE_DELETE_CONFIRM,
    GO_ROOM_FILE_DOWNLOAD,
    GO_ROOM_FILE_SAVE,
    GO_ROOM_FILE_SAVE_READY_HINT,
    GO_ROOM_FILE_DROP,
    GO_ROOM_FILE_FILTERS,
    GO_ROOM_FILE_FILTER_LABEL,
    GO_ROOM_FILE_ON_AIR,
    GO_ROOM_FILE_ZONE,
    GO_ROOM_FILE_ZONE_LABEL,
    GO_ROOM_PRIVATE_DELETE,
    GO_ROOM_PRIVATE_DELETE_CONFIRM,
    GO_ROOM_PRIVATE_DROP,
    GO_ROOM_PRIVATE_MOUNT,
    GO_ROOM_PRIVATE_UNSUPPORTED_HINT,
    ROOM_FILE_PREVIEW_VIDEO_PRELOAD,
    fileShareIcon,
    fileShareKind,
    formatFileShareSize,
    roomFileDownloadDisabled,
    roomFileDownloadMode,
    roomFileOnAir,
    roomFilePreviewMountsMedia,
    roomFilePreviewShouldAttachUrl,
    roomFilePrivateActions,
    roomFileShareActions,
    roomFileShareMatches,
    roomFileShareOpenLabel,
    roomFileShareProgress,
    type RoomFileShareFilter,
    type RoomFileZone,
  } from "$lib/goRoomFileShare";
  import { goRoomPrivateFiles } from "$lib/goRoomPrivateFiles.svelte";
  import {
    formatRoomChatClock,
    newRoomSystemId,
    parseRoomChatSegments,
    roomChatApplyMention,
    roomChatFilterMentionTargets,
    roomChatMentionDraft,
    roomOccupancyChanges,
    roomShareCatalogChanges,
    roomSystemFileActions,
    roomSystemFileText,
    roomSystemJoinText,
    roomSystemLeaveText,
    roomSystemTvFileText,
    roomSystemTvLiveText,
    roomTvCue,
    roomTvCueChange,
    type RoomMentionPerson,
    type RoomShareRow,
    type RoomTvCue,
  } from "$lib/goRoomTimeline";

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
    onKick?: (peerId: string) => void;
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
    onKick,
  }: Props = $props();

  let draft = $state("");
  let clientReady = $state(false);
  let listEl = $state<HTMLDivElement | null>(null);
  let quickOpen = $state(false);
  let floatOpen = $state(false);
  let shareOpen = $state(false);
  let confirmEnd = $state(false);
  let leaveAfterEnd = $state(false);
  let pendingAdHref = $state<string | null>(null);
  let confirmDialog = $state<HTMLDialogElement | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let fileError = $state("");
  let fileHint = $state("");
  /** Safari／無 Save picker：第一次下載只緩存；就緒後再按「存檔」。 */
  let pendingBrowserSaves = $state<
    Map<string, { url: string; name: string }>
  >(new Map());
  let mediaError = $state("");
  let presenceVideoEl = $state<HTMLVideoElement | null>(null);
  let localPreviewEl = $state<HTMLVideoElement | null>(null);
  let filePlayEl = $state<HTMLMediaElement | null>(null);
  let filePreviewImg = $state<HTMLImageElement | null>(null);
  let fileFilter = $state<RoomFileShareFilter>("all");
  let fileZone = $state<RoomFileZone>("share");
  let privatePendingDelete = $state<string | null>(null);
  let shareHang = $state({ done: 0, total: 0 });
  let previewOpen = $state(false);
  let previewId = $state<string | null>(null);
  let overlayDialog = $state<HTMLDialogElement | null>(null);
  let deleteFileId = $state<string | null>(null);
  let now = $state(Date.now());
  let pane = $state<RoomShellPane>(roomShellDefaultPane());
  let composerInputEl = $state<HTMLInputElement | null>(null);
  let roomEl = $state<HTMLElement | null>(null);
  let railEl = $state<HTMLElement | null>(null);
  let shellBox = $state({ widthPx: 0, heightPx: 0 });
  let railLeftPx = $state(0);
  let tvHudOpen = $state(false);
  let tvSlotFullscreen = $state(false);
  let selectedPeerId = $state<string | null>(null);
  let hostMenuPeerId = $state<string | null>(null);
  let kickTarget = $state<{ peerId: string; name: string } | null>(null);
  let pendingShare = $state(false);
  let tvVideoEl = $state<HTMLVideoElement | null>(null);
  let tvSlotEl = $state<HTMLElement | null>(null);
  let cinemaUserEnter = $state(false);
  let menuMsgId = $state<string | null>(null);
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  const messages = $derived(goSessionChat.messages);
  const feed = $derived(goSessionChat.feed);
  const connected = $derived(goSessionChat.connected);
  const freeText = $derived(goSessionChat.freeTextAllowed);
  const quickReplies = $derived(goSessionChat.quickReplies);
  const reactionMap = $derived(goSessionChat.reactions);
  const stageFloats = $derived(goSessionChat.floats);
  const tvCaption = $derived(goSessionChat.caption);
  const textLocked = $derived(goSessionChat.textLocked);
  const localSilenced = $derived(
    goSessionChat.isPeerSilenced(goSessionChat.localAgentId ?? "")
  );
  const canSpeak = $derived(role === "host" || (!textLocked && !localSilenced));
  const composerHint = $derived(
    !canSpeak
      ? localSilenced
        ? GO_ROOM_TEXT_SILENCED_HINT
        : GO_ROOM_TEXT_LOCKED_HINT
      : "說點什麼… @ 可提及成員"
  );
  const files = $derived(
    goRoomFiles.entries.filter((f) => f.kind !== "dir" && f.kind !== "device")
  );
  const filesShown = $derived(
    files.filter((f) =>
      roomFileShareMatches(fileFilter, fileShareKind({ mime: f.mime, name: f.name }))
    )
  );
  const privateEntries = $derived(goRoomPrivateFiles.entries);
  const privateShown = $derived(
    privateEntries.filter((f) =>
      roomFileShareMatches(fileFilter, fileShareKind({ mime: f.mime, name: f.name }))
    )
  );
  const showPrivateZone = $derived(role === "host");
  const sharePct = $derived(roomFileShareProgress(shareHang.done, shareHang.total));
  const previewFile = $derived(files.find((f) => f.id === previewId) ?? null);
  const previewKind = $derived(
    previewFile
      ? fileShareKind({ mime: previewFile.mime, name: previewFile.name })
      : "doc"
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
  const hostPeerId = $derived(
    role === "host" ? "local" : occupantPeers[0]?.peerId ?? null
  );
  const memberCards = $derived(
    roomMemberCardsSorted(
      roster.map((person) =>
        roomMemberCard({
          occupant: person,
          hostPeerId,
          tvSourcePeerId: goRoomMedia.tvSourcePeerId,
          avatarUrl: person.mine ? goAuth.profile?.avatar_url : null,
        })
      )
    )
  );
  const tvLabel = $derived(
    roomTvLabel({
      programName: goRoomMedia.programName,
      remoteProgramName: goRoomMedia.remoteProgramName,
    })
  );
  const tvStream = $derived(
    roomTvBindStream({
      programStream: goRoomMedia.programStream,
      localProgramStream: goRoomMedia.localProgramStream,
      programName: goRoomMedia.programName,
      remoteProgramName: goRoomMedia.remoteProgramName,
    })
  );
  const tvOn = $derived(
    roomTvPictureOn({
      programName: goRoomMedia.programName,
      remoteProgramName: goRoomMedia.remoteProgramName,
    })
  );
  const loginGate = $derived(
    roomHostLoginGate({ role, loggedIn, phase, clientReady })
  );
  const overlayOpen = $derived(
    phase === "connecting" || phase === "error" || phase === "ended"
  );

  onMount(() => {
    clientReady = true;
    /** Safari guests often have SW ready but not controlling yet — prime early. */
    void ensureRoomFileSw();
    return () => {
      for (const { url } of pendingBrowserSaves.values()) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    };
  });
  const tvHudKind = $derived(
    roomTvHudKind({
      tvOn,
      role,
      fileTransport: goRoomMedia.programTransport,
      fileOnTv: Boolean(goRoomMedia.streamingFileId),
    })
  );
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
  /** Logged-out／connecting／ended: full-width TV, not the in-booth rail split. */
  const shellMode = $derived(
    inBooth ? roomShellMode(shellBox) : "portrait"
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
      userEnter: cinemaUserEnter,
    })
  );
  const cinemaToggleLabel = $derived(roomCinemaToggleLabel(cinema));
  const cinemaHud = $derived(roomCinemaHudVisible({ cinema }));
  const showAd = $derived(
    roomShowAdSlot({
      inBooth,
      tvOn,
    })
  );
  const panesConcurrent = $derived(
    roomShellPanesConcurrent(shellMode, cinema)
  );
  const filesPinned = $derived(roomShellFilesPinned(shellMode, cinema));
  const tabPanes = $derived(roomShellTabPanes(shellMode, cinema));
  const showMembers = $derived(
    roomShellShowPane({
      target: "members",
      pane,
      concurrent: panesConcurrent,
      filesPinned,
    })
  );
  const showFiles = $derived(
    roomShellShowPane({
      target: "files",
      pane,
      concurrent: panesConcurrent,
      filesPinned,
    })
  );
  const showChat = $derived(
    roomShellShowPane({
      target: "chat",
      pane,
      concurrent: panesConcurrent,
      filesPinned,
    })
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
      confirmOpen: confirmEnd || Boolean(kickTarget),
      overlayOpen: overlayOpen || Boolean(hostMenuPeerId),
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
    void feed.length;
    if (!listEl) return;
    void tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  });

  $effect(() => {
    void stageFloats.length;
    void tvCaption?.until;
    const t = setInterval(() => goSessionChat.pruneStage(), 200);
    return () => clearInterval(t);
  });

  let occPrev: RoomMentionPerson[] | null = null;
  let occGuestReady = false;
  $effect(() => {
    if (role === "guest" && occupantPeers.length === 0 && !occGuestReady) {
      return;
    }
    occGuestReady = true;
    const next = occupantPeers.map((p) => ({ peerId: p.peerId, name: p.name }));
    const { joined, left } = roomOccupancyChanges(occPrev, next);
    occPrev = next;
    const ts = Date.now();
    for (const row of joined) {
      goSessionChat.noteSystem({
        id: newRoomSystemId(`join-${row.peerId}`),
        ts,
        tone: "presence",
        text: roomSystemJoinText(row.name),
      });
    }
    for (const row of left) {
      goSessionChat.noteSystem({
        id: newRoomSystemId(`leave-${row.peerId}`),
        ts,
        tone: "presence",
        text: roomSystemLeaveText(row.name),
      });
    }
  });

  let sharePrev: RoomShareRow[] | null = null;
  $effect(() => {
    const next = files.map((f) => ({
      id: f.id,
      name: f.name,
      ownerName: f.ownerName,
    }));
    const added = roomShareCatalogChanges(sharePrev, next);
    sharePrev = next;
    const ts = Date.now();
    for (const row of added) {
      const listed = files.find((f) => f.id === row.id);
      const acts = listed
        ? roomSystemFileActions(listed)
        : { preview: false, download: true };
      goSessionChat.noteSystem({
        id: newRoomSystemId(`file-${row.id}`),
        ts,
        tone: "file",
        text: roomSystemFileText(row.ownerName, row.name),
        file: {
          id: row.id,
          name: row.name,
          preview: acts.preview,
          download: acts.download,
        },
      });
    }
  });

  let tvPrev: RoomTvCue | null = null;
  $effect(() => {
    const next = roomTvCue({
      tvSourcePeerId: goRoomMedia.tvSourcePeerId,
      programName: goRoomMedia.programName,
      remoteProgramName: goRoomMedia.remoteProgramName,
      occupants: [
        ...occupantPeers,
        { peerId: "local", name: goAuth.profile?.label?.trim() || "我" },
      ],
    });
    const change = roomTvCueChange(tvPrev, next);
    tvPrev = next;
    if (!change) return;
    const ts = Date.now();
    if (change.kind === "live") {
      goSessionChat.noteSystem({
        id: newRoomSystemId("tv-live"),
        ts,
        tone: "tv",
        text: roomSystemTvLiveText(GO_ROOM_ROLE_HOST, change.name),
      });
      return;
    }
    if (change.kind !== "file") return;
    goSessionChat.noteSystem({
      id: newRoomSystemId("tv-file"),
      ts,
      tone: "tv",
      text: roomSystemTvFileText(GO_ROOM_ROLE_HOST, change.name),
    });
  });

  $effect(() => {
    if (tvHudKind === "none") tvHudOpen = false;
  });

  $effect(() => {
    if (!tvHudOpen || tvHudKind === "none" || tvSlotFullscreen) return;
    if (roomTvHudHasTransport(tvHudKind) && goRoomMedia.programPaused) return;
    const t = window.setTimeout(() => {
      tvHudOpen = false;
    }, 3200);
    return () => window.clearTimeout(t);
  });

  $effect(() => {
    if (!cinemaAllowed) cinemaUserEnter = false;
  });

  $effect(() => {
    const onFs = () => {
      const on = tvIsFullscreen(tvSlotEl, tvFullscreenElement(document));
      tvSlotFullscreen = on;
      if (on) tvHudOpen = true;
      else syncTvSinkPlayback(tvVideoEl);
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  });

  $effect(() => {
    if (
      roomCinemaExitOnChromeReveal({
        cinema,
        chromeHidden: chromeSession.chromeHidden,
      })
    ) {
      cinemaUserEnter = false;
    }
  });

  $effect(() => {
    chromeSession.escapeGuard = () => {
      const step = roomEscStep({
        shareOpen,
        previewOpen,
        tvHudOpen,
        selectedPeerId,
        cinema,
      });
      if (step === "close-share") {
        shareOpen = false;
        pendingShare = false;
        return false;
      }
      if (step === "close-preview") {
        closePreview();
        return false;
      }
      if (step === "close-tv-hud") {
        tvHudOpen = false;
        return false;
      }
      if (step === "clear-peer") {
        selectedPeerId = null;
        return false;
      }
      if (step === "close-drawer") {
        return false;
      }
      if (step === "exit-cinema") {
        cinemaUserEnter = false;
        chromeSession.chromeHidden = false;
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
    if (
      (confirmEnd || kickTarget || deleteFileId || privatePendingDelete) &&
      !el.open
    ) {
      el.showModal();
    }
    if (
      !confirmEnd &&
      !kickTarget &&
      !deleteFileId &&
      !privatePendingDelete &&
      el.open
    ) {
      el.close();
    }
  });

  $effect(() => {
    const el = overlayDialog;
    if (!el) return;
    if (overlayOpen && !el.open) el.showModal();
    if (!overlayOpen && el.open) el.close();
  });

  $effect(() => {
    const openId = hostMenuPeerId;
    if (!openId) return;
    const onPtr = (e: PointerEvent) => {
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest(`[data-member-peer="${CSS.escape(openId)}"]`)
      ) {
        return;
      }
      hostMenuPeerId = null;
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  });

  $effect(() => {
    attachMediaStream(presenceVideoEl, goRoomMedia.presenceStream);
  });
  $effect(() => {
    attachMediaStream(localPreviewEl, goRoomMedia.localPreviewStream);
  });
  $effect(() => {
    const url = goRoomFiles.playback?.url ?? null;
    const kind = goRoomFiles.playback?.kind;
    const el = filePlayEl;
    const img = filePreviewImg;
    void previewOpen;
    void tick().then(() => {
      if ((goRoomFiles.playback?.url ?? null) !== url) return;
      if (!roomFilePreviewShouldAttachUrl({ open: previewOpen, url })) return;
      if (kind === "image") {
        const target = filePreviewImg ?? img;
        if (target) target.src = url ?? "";
        return;
      }
      attachPlaybackUrl(filePlayEl ?? el, url, {
        muted: kind === "video",
      });
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

  const mentionPeople = $derived.by((): RoomMentionPerson[] => {
    const rows: RoomMentionPerson[] = memberCards.map((c) => ({
      peerId: c.peerId,
      name: c.name,
    }));
    const label = goAuth.profile?.label?.trim();
    if (label) rows.push({ peerId: "local", name: label });
    return rows;
  });
  const mentionPick = $derived(
    memberCards
      .filter((c) => !c.mine)
      .map((c) => ({ peerId: c.peerId, name: c.name }))
  );
  const mentionDraft = $derived(roomChatMentionDraft(draft));
  const mentionHits = $derived(
    mentionDraft
      ? roomChatFilterMentionTargets(mentionDraft.query, mentionPick)
      : []
  );

  function chatCard(m: (typeof messages)[number]) {
    if (m.local) return memberCards.find((c) => c.mine) ?? null;
    return memberCards.find((c) => c.peerId === m.from) ?? null;
  }

  function insertMention(person: RoomMentionPerson) {
    if (!mentionDraft) return;
    draft = roomChatApplyMention(draft, mentionDraft.start, person);
    composerInputEl?.focus();
  }

  function clearHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function openMsgMenu(id: string) {
    menuMsgId = id;
  }

  function onBubblePointerDown(id: string) {
    clearHold();
    holdTimer = setTimeout(() => openMsgMenu(id), 450);
  }

  function onReact(targetId: string, emoji: SessionChatFloatEmoji) {
    goSessionChat.react(targetId, emoji);
  }

  function onSystemPreview(fileId: string) {
    const listed = files.find((f) => f.id === fileId);
    if (!listed) {
      pane = "files";
      return;
    }
    if (catalogConsumes(listed).includes("play")) {
      void onPlayFile(fileId);
      return;
    }
    pane = "files";
  }

  function onSubmit(ev: Event) {
    ev.preventDefault();
    if (!freeText || !canSpeak) return;
    if (goSessionChat.sendText(draft)) draft = "";
  }

  function onQuick(q: string) {
    if (!goSessionChat.sendQuickReply(q)) return;
    composerInputEl?.focus();
    quickOpen = false;
  }

  function toggleQuickOpen() {
    quickOpen = !quickOpen;
    if (quickOpen) floatOpen = false;
  }

  function toggleFloatOpen() {
    floatOpen = !floatOpen;
    if (floatOpen) quickOpen = false;
  }

  async function shareFiles(list: FileList | File[]): Promise<void> {
    const picked = Array.from(list);
    if (picked.length === 0) return;
    fileError = "";
    shareHang = { done: 0, total: picked.length };
    for (const file of picked) {
      const result = await goRoomFiles.shareLocalFile(file);
      shareHang = { done: shareHang.done + 1, total: shareHang.total };
      if (!result.ok) {
        fileError = result.error;
        shareHang = { done: 0, total: 0 };
        return;
      }
    }
    shareHang = { done: 0, total: 0 };
  }

  async function importPrivateFiles(list: FileList | File[]): Promise<void> {
    fileError = "";
    const err = await goRoomPrivateFiles.importFiles(list);
    if (err) fileError = err;
  }

  async function onPickFile(ev: Event) {
    const picked = takePickedFiles(ev.currentTarget as HTMLInputElement);
    if (picked.length === 0) return;
    if (fileZone === "private" && showPrivateZone) {
      await importPrivateFiles(picked);
      return;
    }
    await shareFiles(picked);
  }

  async function onDownload(id: string) {
    fileError = "";
    fileHint = "";
    const ready = pendingBrowserSaves.get(id);
    if (ready) {
      /**
       * Second click under a fresh user gesture — Safari will honor `<a download>`.
       * Drop pending immediately so the button returns to「下載」and the ~file
       * blob can be GC’d (revoke after the OS grab has started).
       */
      const { url, name } = ready;
      triggerBrowserDownload(url, name);
      const next = new Map(pendingBrowserSaves);
      next.delete(id);
      pendingBrowserSaves = next;
      fileHint = "";
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }, 60_000);
      return;
    }
    /**
     * Always page fetch(/room-file/…) through the SW (HTTP client).
     * Safari download manager bypasses SW on Content-Disposition／`<a download href=/room-file>` —
     * without Save picker we bridge OS save via blob: after the HTTP body completes.
     * WebKit also drops programmatic `<a download>` after async fetch — defer to「存檔」.
     */
    const swReady = await ensureRoomFileSw();
    if (!swReady) {
      fileError = "還沒準備好下載。請重新載入頁面後再試。";
      return;
    }
    const deferOsSave = !roomFileSaveSupported();
    const result = await goRoomFiles.download(id, async (opts) => {
      if (!deferOsSave) {
        return pickRoomFileSave(opts.suggestedName);
      }
      return createBrowserSaveWritable(opts.suggestedName, {
        onPrepared: (url, name) => {
          const prev = pendingBrowserSaves.get(id);
          if (prev) {
            try {
              URL.revokeObjectURL(prev.url);
            } catch {
              /* ignore */
            }
          }
          const next = new Map(pendingBrowserSaves);
          next.set(id, { url, name });
          pendingBrowserSaves = next;
          fileHint = GO_ROOM_FILE_SAVE_READY_HINT;
        },
      });
    });
    if (!result.ok && !("cancelled" in result && result.cancelled)) {
      fileError = result.error;
      fileHint = "";
    }
  }

  function onCancelDownload(id: string) {
    fileError = "";
    fileHint = "";
    clearPendingBrowserSave(id);
    goRoomFiles.cancelDownload(id);
  }

  function clearPendingBrowserSave(id: string): void {
    const prev = pendingBrowserSaves.get(id);
    if (!prev) return;
    try {
      URL.revokeObjectURL(prev.url);
    } catch {
      /* ignore */
    }
    const next = new Map(pendingBrowserSaves);
    next.delete(id);
    pendingBrowserSaves = next;
  }

  function downloadSlotMode(
    status: string | undefined,
    id: string
  ): "download" | "save" | "cancel" {
    return roomFileDownloadMode({
      status,
      pendingSave: pendingBrowserSaves.has(id),
      playing: goRoomFiles.playback?.id === id,
    });
  }

  function downloadButtonLabel(id: string, status?: string): string {
    const mode = downloadSlotMode(status, id);
    if (mode === "cancel") return GO_ROOM_FILE_CANCEL;
    if (mode === "save") return GO_ROOM_FILE_SAVE;
    return GO_ROOM_FILE_DOWNLOAD;
  }

  function downloadButtonDisabled(status: string | undefined, id: string): boolean {
    return roomFileDownloadDisabled({
      status,
      pendingSave: pendingBrowserSaves.has(id),
      playing: goRoomFiles.playback?.id === id,
    });
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

  function closePreview() {
    previewOpen = false;
    previewId = null;
    goRoomFiles.stopPlay();
    if (filePreviewImg) filePreviewImg.src = "";
  }

  async function onPlayFile(id: string) {
    mediaError = "";
    fileError = "";
    tvHudOpen = false;
    pane = "files";
    const listed = files.find((f) => f.id === id);
    const kind = listed
      ? fileShareKind({ mime: listed.mime, name: listed.name })
      : "doc";
    previewId = id;
    previewOpen = true;
    if (kind === "doc") {
      goRoomFiles.stopPlay();
      return;
    }
    await tick();
    const out = await goRoomFiles.play(id);
    if (!out.ok) fileError = out.error;
  }

  async function onPutOnTv(id: string) {
    mediaError = "";
    const out = await goRoomMedia.startListedProgram(id);
    if (!out.ok) mediaError = out.error;
  }

  async function onPutPrivateOnTv(id: string) {
    mediaError = "";
    const out = await goRoomMedia.startPrivateProgram(id);
    if (!out.ok) mediaError = out.error;
  }

  async function onMountPrivateToShare(id: string) {
    fileError = "";
    const file = await goRoomPrivateFiles.getFile(id);
    if (!file) {
      fileError = "找不到這個私有檔";
      return;
    }
    const result = await goRoomFiles.shareLocalFile(file);
    if (!result.ok) {
      fileError = result.error;
      return;
    }
    fileZone = "share";
  }

  async function onDeletePrivate(id: string) {
    privatePendingDelete = null;
    await goRoomPrivateFiles.remove(id);
    if (goRoomMedia.streamingFileId === id) {
      await goRoomMedia.stopProgram();
    }
  }

  async function onPutLiveOnTv(peerId: string, name: string) {
    mediaError = "";
    const out = await goRoomMedia.putLiveOnTv(peerId, name);
    if (!out.ok) mediaError = out.error;
  }

  async function onHostMemberAction(
    card: (typeof memberCards)[number],
    action: RoomHostMenuAction
  ) {
    hostMenuPeerId = null;
    const peerId = card.mine ? "local" : card.peerId;
    mediaError = "";
    if (action === "putOnTv") {
      await onPutLiveOnTv(peerId, card.name);
      return;
    }
    if (action === "forceMute") {
      const out = await goRoomMedia.haltLive(peerId, "audio");
      if (!out.ok) mediaError = out.error;
      return;
    }
    if (action === "forceCameraOff") {
      const out = await goRoomMedia.haltLive(peerId, "video");
      if (!out.ok) mediaError = out.error;
      return;
    }
    if (action === "kick" && !card.mine) {
      kickTarget = { peerId: card.peerId, name: card.name };
    }
  }

  async function onStopTv() {
    mediaError = "";
    await goRoomMedia.stopProgram();
  }

  async function onTvFullscreen() {
    if (tvSlotFullscreen) {
      const result = await toggleTvFullscreen({
        container: tvSlotEl,
        fullscreenElement: tvFullscreenElement(document),
      });
      if (result === "exited" || result === "failed") {
        tvSlotFullscreen = false;
        syncTvSinkPlayback(tvVideoEl);
      }
      return;
    }
    if (cinema) {
      onCinemaToggle();
      return;
    }
    const result = await toggleTvFullscreen({
      container: tvSlotEl,
      fullscreenElement: tvFullscreenElement(document),
    });
    if (result === "entered") {
      tvSlotFullscreen = true;
      tvHudOpen = true;
      return;
    }
    onCinemaToggle();
  }

  function askDeleteFile(id: string) {
    deleteFileId = id;
  }

  function confirmDeleteFile() {
    const id = deleteFileId;
    deleteFileId = null;
    if (!id) return;
    clearPendingBrowserSave(id);
    goRoomFiles.unshare(id, { host: role === "host" });
    if (previewId === id) closePreview();
  }

  async function onUnshare(id: string) {
    askDeleteFile(id);
  }

  function dismissConfirm() {
    confirmEnd = false;
    kickTarget = null;
    deleteFileId = null;
    privatePendingDelete = null;
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

  function confirmKickNow() {
    const target = kickTarget;
    kickTarget = null;
    if (target) onKick?.(target.peerId);
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
    if (tvHudKind === "none") return;
    tvHudOpen = !tvHudOpen;
  }

  function onCinemaToggle() {
    if (!cinemaAllowed) return;
    const next = !cinemaUserEnter;
    cinemaUserEnter = next;
    chromeSession.chromeHidden = next;
  }

  function onPaneTab(id: RoomShellPane) {
    pane = id;
  }

  function paneTabOn(id: RoomShellPane): boolean {
    return roomShellActiveTab(pane, filesPinned) === id;
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
    return formatFileShareSize(n);
  }

  function fileOwnerCard(f: (typeof files)[number]) {
    if (f.mine) return memberCards.find((c) => c.mine) ?? null;
    return (
      memberCards.find((c) => c.peerId === f.ownerId) ??
      memberCards.find((c) => c.name === f.ownerName) ??
      null
    );
  }

  function fileOnAir(f: (typeof files)[number]): boolean {
    return roomFileOnAir({
      fileId: f.id,
      fileName: f.name,
      streamingFileId: goRoomMedia.streamingFileId,
      programName: goRoomMedia.remoteProgramName || goRoomMedia.programName,
      liveOnTv: Boolean(goRoomMedia.tvSourcePeerId),
    });
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
      <GoRoomTvSlot
        {tvOn}
        {tvStream}
        hudOpen={tvHudOpen}
        hudKind={tvHudKind}
        isHost={role === "host"}
        slotFullscreen={tvSlotFullscreen}
        restore={roomTvHudRestore({
          slotFullscreen: tvSlotFullscreen,
          cinema,
        })}
        paused={goRoomMedia.programPaused}
        currentTime={goRoomMedia.programTime}
        duration={goRoomMedia.programDuration}
        bind:videoEl={tvVideoEl}
        bind:slotEl={tvSlotEl}
        onToggle={onTvHit}
        onPlayPause={() =>
          goRoomMedia.programPaused
            ? goRoomMedia.playProgram()
            : goRoomMedia.pauseProgram()}
        onSeek={(seconds) => goRoomMedia.seekProgram(seconds)}
        onFullscreen={() => void onTvFullscreen()}
        onPower={() => void onStopTv()}
        floats={stageFloats}
        caption={tvCaption && tvCaption.until > Date.now() ? tvCaption.text : null}
      />
      {#if loginGate}
        <div class="room-tv-gate" role="region" aria-labelledby="room-gate-title">
          <p id="room-gate-title" class="room-tv-gate-title pixel-text">開包廂</p>
          <p class="room-tv-gate-body">
            {GO_ROOM_GATE_BODY}
          </p>
          <button
            type="button"
            class="pixel-btn pixel-btn--primary room-tv-gate-btn"
            onclick={() => onLogin?.()}
          >
            登入後開包廂
          </button>
          <p class="muted room-tv-gate-hint">
            {GO_ROOM_LOGIN_HINT} 單機小品不受影響。
          </p>
        </div>
      {:else if showAd}
        <div class="room-ad">
          <GoAdSlot onNavigate={onAdNavigate} />
        </div>
      {/if}
    </div>
    {#if statusLabel && cinemaHud}
      <p class="room-status">{statusLabel}</p>
    {/if}
  </div>

  {#if inBooth}
    {#if cinemaHud}
    <div class="room-lower">
    <nav class="room-dock" aria-label="包廂操作">
      <button
        type="button"
        class={["pixel-btn", "room-dock-btn", cinema && "pixel-btn--primary"]
          .filter(Boolean)
          .join(" ")}
        aria-label={cinemaToggleLabel}
        aria-pressed={cinema}
        title={cinemaToggleLabel}
        onclick={() => onCinemaToggle()}
      >
        <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
          {#if cinema}
            <rect x="3" y="4" width="18" height="10" rx="1" />
            <rect x="3" y="16" width="18" height="4" rx="1" />
          {:else}
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 8h8v8H8z" />
          {/if}
        </svg>
      </button>
      <button
        type="button"
        class={["pixel-btn", "room-dock-btn", goRoomMedia.mic && "pixel-btn--primary"]
          .filter(Boolean)
          .join(" ")}
        aria-label={goRoomMedia.mic ? "關麥克風" : "開麥克風"}
        aria-pressed={goRoomMedia.mic}
        title={goRoomMedia.mic ? "關麥克風" : "開麥克風"}
        onclick={() => void onToggleMic()}
      >
        <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
          {#if goRoomMedia.mic}
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          {:else}
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 .4 1.5" />
            <path d="M15 9.3V5a3 3 0 0 0-4.2-2.7" />
            <path d="M19 10v2a7 7 0 0 1-8.1 6.9" />
            <path d="M5 10v2a7 7 0 0 0 3.2 5.8" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="4" y1="4" x2="20" y2="20" />
          {/if}
        </svg>
      </button>
      <button
        type="button"
        class={["pixel-btn", "room-dock-btn", goRoomMedia.camera && "pixel-btn--primary"]
          .filter(Boolean)
          .join(" ")}
        aria-label={goRoomMedia.camera ? "關鏡頭" : "開鏡頭"}
        aria-pressed={goRoomMedia.camera}
        title={goRoomMedia.camera ? "關鏡頭" : "開鏡頭"}
        onclick={() => void onToggleCamera()}
      >
        <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
          {#if goRoomMedia.camera}
            <path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
          {:else}
            <path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4v-3.2" />
            <path d="M16 10.8V11l-2.1-1.4" />
            <path d="M2 8.2V16a2 2 0 0 0 2 2h9.2" />
            <path d="M8.4 6H14a2 2 0 0 1 2 2v.5" />
            <line x1="4" y1="4" x2="20" y2="20" />
          {/if}
        </svg>
      </button>
      {#if canShareDisplay()}
        <button
          type="button"
          class={["pixel-btn", "room-dock-btn", goRoomMedia.display && "pixel-btn--primary"]
            .filter(Boolean)
            .join(" ")}
          aria-label={goRoomMedia.display ? "停止畫面" : "分享畫面"}
          aria-pressed={goRoomMedia.display}
          title={goRoomMedia.display ? "停止畫面" : "分享畫面"}
          onclick={() => void onToggleDisplay()}
        >
          <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            {#if goRoomMedia.display}
              <path d="m9 10 3-3 3 3" />
              <path d="M12 7v6" />
            {/if}
          </svg>
        </button>
      {/if}
      {#if role === "host" && tvOn}
        <button
          type="button"
          class="pixel-btn room-dock-btn"
          aria-label={GO_ROOM_TV_OFF_BTN}
          title={GO_ROOM_TV_OFF_BTN}
          onclick={() => void onStopTv()}
        >
          <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="2" y="7" width="20" height="15" rx="2" />
            <polyline points="17 2 12 7 7 2" />
            <line x1="8" y1="12" x2="16" y2="17" />
            <line x1="16" y1="12" x2="8" y2="17" />
          </svg>
        </button>
      {/if}
      <button
        type="button"
        class="pixel-btn pixel-btn--danger-outline room-dock-btn"
        aria-label={role === "host" ? "結束" : "離開"}
        title={role === "host" ? "結束" : "離開"}
        onclick={() => askEnd()}
      >
        <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </nav>
    <div
      class="room-shell"
      bind:this={railEl}
    >
      {#if tabPanes.length > 0}
        <nav class="room-tabs" aria-label="包廂分區">
          {#if tabPanes.includes("members")}
            <button
              type="button"
              class={["pixel-btn", paneTabOn("members") && "pixel-btn--primary"].filter(Boolean).join(" ")}
              aria-pressed={paneTabOn("members")}
              onclick={() => onPaneTab("members")}
            >
              成員
            </button>
          {/if}
          {#if tabPanes.includes("files")}
            <button
              type="button"
              class={["pixel-btn", paneTabOn("files") && "pixel-btn--primary"].filter(Boolean).join(" ")}
              aria-pressed={paneTabOn("files")}
              onclick={() => onPaneTab("files")}
            >
              檔案
            </button>
          {/if}
          {#if tabPanes.includes("chat")}
            <button
              type="button"
              class={["pixel-btn", paneTabOn("chat") && "pixel-btn--primary"].filter(Boolean).join(" ")}
              aria-pressed={paneTabOn("chat")}
              onclick={() => onPaneTab("chat")}
            >
              聊天{#if feed.length > 0} · {feed.length}{/if}
            </button>
          {/if}
        </nav>
      {/if}

      {#if showMembers}
        <section class="room-pane room-pane--members" aria-label="成員">
          {#if panesConcurrent}
            <p class="room-pane-title pixel-text">成員</p>
          {/if}
          {#if role === "host"}
            <div class="door-row">
              <p class="muted door-row-label">{doorRow.label}</p>
              <button
                type="button"
                class="pixel-btn pixel-btn--primary door-row-action"
                onclick={() => inviteInBooth()}
              >
                {doorRow.action}
              </button>
            </div>
          {/if}
          <ul class="member-list">
            {#each memberCards as card (card.peerId)}
              <li>
                <GoRoomMemberCard
                  {card}
                  selected={selectedPeerId === card.peerId}
                  hostMenu={role === "host"
                    ? roomHostMemberMenu({
                        mine: card.mine,
                        liveAudio: card.micOn,
                        liveVideo: card.cameraOn,
                        onAir: card.onAir,
                      })
                    : undefined}
                  hostMenuOpen={hostMenuPeerId === card.peerId}
                  onclick={() =>
                    (selectedPeerId =
                      selectedPeerId === card.peerId ? null : card.peerId)}
                  onHostMenuToggle={() =>
                    (hostMenuPeerId =
                      hostMenuPeerId === card.peerId ? null : card.peerId)}
                  onHostAction={(action) => void onHostMemberAction(card, action)}
                />
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
                {#if role === "host"}
                  <p class="muted">主持操作在卡片旁的更多。</p>
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
                  <p class="muted">點成員不會自動上大螢幕。</p>
                {/if}
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if showFiles && showComposer}
        <section
          class={["room-pane", "room-pane--files", dropping && "room-pane--drop"].filter(Boolean).join(" ")}
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
            if (!list) return;
            if (fileZone === "private" && showPrivateZone) {
              void importPrivateFiles(list);
              return;
            }
            void shareFiles(list);
          }}
        >
          {#if panesConcurrent}
            <p class="room-pane-title pixel-text">檔案</p>
          {/if}
          {#if showPrivateZone}
            <div class="file-filters" role="tablist" aria-label="私有或分享">
              {#each GO_ROOM_FILE_ZONE as zone (zone)}
                <button
                  type="button"
                  class={["pixel-btn", "file-filter", fileZone === zone && "pixel-btn--primary"]
                    .filter(Boolean)
                    .join(" ")}
                  role="tab"
                  aria-selected={fileZone === zone}
                  onclick={() => (fileZone = zone)}
                >
                  {GO_ROOM_FILE_ZONE_LABEL[zone]}
                </button>
              {/each}
            </div>
          {/if}
          <fieldset class="file-filters file-filters--kind">
            <legend class="file-filters-legend">檔案分類</legend>
            <div class="file-filters-row" role="radiogroup" aria-label="檔案分類">
              {#each GO_ROOM_FILE_FILTERS as tab (tab)}
                <label
                  class={[
                    "file-filter-radio",
                    fileFilter === tab && "file-filter-radio--on",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <input
                    type="radio"
                    name="room-file-kind"
                    value={tab}
                    checked={fileFilter === tab}
                    onchange={() => (fileFilter = tab)}
                  />
                  <span>{GO_ROOM_FILE_FILTER_LABEL[tab]}</span>
                </label>
              {/each}
            </div>
          </fieldset>
          <button
            type="button"
            class="file-drop"
            onclick={() => fileInput?.click()}
          >
            <span class="file-drop-title">
              {fileZone === "private" && showPrivateZone
                ? GO_ROOM_PRIVATE_DROP
                : GO_ROOM_FILE_DROP}
            </span>
            {#if fileZone === "share" && shareHang.total > 0}
              <progress class="file-drop-bar" max="100" value={sharePct}></progress>
              <span class="muted">{shareHang.done}/{shareHang.total}</span>
            {/if}
          </button>
          {#if fileZone === "private" && showPrivateZone && !goRoomPrivateFiles.supported}
            <p class="muted" role="status">{GO_ROOM_PRIVATE_UNSUPPORTED_HINT}</p>
          {/if}
          {#if fileError}
            <p class="err" role="alert">{fileError}</p>
          {/if}
          {#if fileHint}
            <p class="muted" role="status">{fileHint}</p>
          {/if}
          <input
            bind:this={fileInput}
            class="file-hidden"
            type="file"
            multiple
            onchange={(e) => void onPickFile(e)}
          />
          {#if fileZone === "private" && showPrivateZone}
            {#if privateShown.length === 0 && privateEntries.length > 0}
              <p class="muted">這個分類還沒有檔。</p>
            {/if}
            <ul class="file-list">
              {#each privateShown as f (f.id)}
                {@const kind = fileShareKind({ mime: f.mime, name: f.name })}
                {@const acts = roomFilePrivateActions({ kind })}
                {@const onAir = roomFileOnAir({
                  fileId: f.id,
                  fileName: f.name,
                  streamingFileId: goRoomMedia.streamingFileId,
                  programName: goRoomMedia.programName,
                  liveOnTv: Boolean(goRoomMedia.tvSourcePeerId),
                })}
                <li
                  class={["file-card", onAir && "file-card--on-air"].filter(Boolean).join(" ")}
                >
                  <div class="file-card-head">
                    <span class="file-type" aria-hidden="true">{fileShareIcon(kind)}</span>
                    <div class="file-card-meta">
                      <p class="file-name">{f.name}</p>
                      <p class="muted">{formatSize(f.size)} · 僅這台</p>
                    </div>
                  </div>
                  {#if onAir}
                    <p class="file-on-air">
                      <span class="file-on-air-wave" aria-hidden="true"></span>
                      {GO_ROOM_FILE_ON_AIR}
                    </p>
                  {/if}
                  <div class="file-actions">
                    {#if acts.cast}
                      <button
                        type="button"
                        class="pixel-btn pixel-btn--primary"
                        onclick={() => void onPutPrivateOnTv(f.id)}
                      >
                        {GO_ROOM_FILE_CAST}
                      </button>
                    {/if}
                    {#if acts.mount}
                      <button
                        type="button"
                        class="pixel-btn"
                        onclick={() => void onMountPrivateToShare(f.id)}
                      >
                        {GO_ROOM_PRIVATE_MOUNT}
                      </button>
                    {/if}
                    {#if acts.remove}
                      <button
                        type="button"
                        class="pixel-btn"
                        onclick={() => (privatePendingDelete = f.id)}
                      >
                        {GO_ROOM_PRIVATE_DELETE}
                      </button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            {#if filesShown.length === 0 && files.length > 0}
              <p class="muted">這個分類還沒有檔。</p>
            {/if}
            <ul class="file-list">
              {#each filesShown as f (f.id)}
                {@const kind = fileShareKind({ mime: f.mime, name: f.name })}
                {@const acts = roomFileShareActions({ role, mine: f.mine, kind })}
                {@const owner = fileOwnerCard(f)}
                {@const onAir = fileOnAir(f)}
                {@const transferHint = catalogTransferHint({
                  status: f.status,
                  playing: goRoomFiles.playback?.id === f.id,
                })}
                <li
                  class={["file-card", onAir && "file-card--on-air"].filter(Boolean).join(" ")}
                >
                  <div class="file-card-head">
                    <span class="file-type" aria-hidden="true">{fileShareIcon(kind)}</span>
                    <div class="file-card-meta">
                      <p class="file-name">{f.path || f.name}</p>
                      <p class="muted">
                        {formatSize(f.size)}
                        {#if transferHint} · {transferHint} {formatSize(f.received)}
                        {:else if f.status === "error"} · {f.error || "失敗"}
                        {/if}
                      </p>
                    </div>
                    <span class="file-owner">
                      <span class="bubble-avatar" aria-hidden="true">
                        {#if owner?.avatarUrl}
                          <img
                            class="bubble-avatar-img"
                            src={owner.avatarUrl}
                            alt=""
                            width="32"
                            height="32"
                            referrerpolicy="no-referrer"
                          />
                        {:else}
                          <span class="bubble-avatar-letter">
                            {owner?.avatarInitial ?? (f.mine ? "我" : f.ownerName.slice(0, 1) || "?")}
                          </span>
                        {/if}
                      </span>
                      <span class="file-owner-name">{f.mine ? "我" : f.ownerName}</span>
                    </span>
                  </div>
                  {#if onAir}
                    <p class="file-on-air">
                      <span class="file-on-air-wave" aria-hidden="true"></span>
                      {GO_ROOM_FILE_ON_AIR}
                    </p>
                  {/if}
                  <div class="file-actions">
                    {#if acts.preview}
                      <button
                        type="button"
                        class="pixel-btn"
                        disabled={f.status === "transferring" && goRoomFiles.playback?.id !== f.id}
                        onclick={() => void onPlayFile(f.id)}
                      >
                        {roomFileShareOpenLabel(
                          fileShareKind({ mime: f.mime, name: f.name })
                        )}
                      </button>
                    {/if}
                    {#if acts.download}
                      <button
                        type="button"
                        class="pixel-btn pixel-btn--primary"
                        disabled={downloadButtonDisabled(f.status, f.id)}
                        onclick={() => {
                          if (downloadSlotMode(f.status, f.id) === "cancel") {
                            onCancelDownload(f.id);
                            return;
                          }
                          void onDownload(f.id);
                        }}
                      >
                        {downloadButtonLabel(f.id, f.status)}
                      </button>
                    {/if}
                    {#if acts.cast}
                      <button
                        type="button"
                        class="pixel-btn pixel-btn--primary"
                        onclick={() => void onPutOnTv(f.id)}
                      >
                        {GO_ROOM_FILE_CAST}
                      </button>
                    {/if}
                    {#if acts.remove}
                      <button type="button" class="pixel-btn" onclick={() => void onUnshare(f.id)}>
                        {GO_ROOM_FILE_DELETE}
                      </button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      {#if showChat && showComposer}
        <section class="room-pane room-pane--chat" aria-label="包廂聊天">
          {#if panesConcurrent}
            <p class="room-pane-title pixel-text">聊天</p>
          {/if}
          {#if !canSpeak}
            <p class="muted chat-speak-hint">{composerHint}</p>
          {/if}
          <div class="room-timeline" bind:this={listEl} role="log" aria-label="包廂聊天">
            {#if feed.length === 0}
              <p class="muted">{GO_ROOM_EMPTY_TIMELINE}</p>
            {/if}
            {#each feed as row (row.id)}
              {#if row.kind === "system"}
                <div
                  class={[
                    "sys",
                    row.system.tone === "file" && "sys--file",
                    row.system.tone === "tv" && "sys--tv",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <p class="sys-text">{row.system.text}</p>
                  {#if row.system.file}
                    {@const listed = files.find((f) => f.id === row.system.file?.id)}
                    <div class="sys-actions">
                      {#if row.system.file.preview}
                        <button
                          type="button"
                          class="pixel-btn"
                          disabled={!listed}
                          onclick={() => onSystemPreview(row.system.file!.id)}
                        >
                          {roomFileShareOpenLabel(
                            fileShareKind({
                              mime: listed?.mime,
                              name: listed?.name ?? row.system.file.name,
                            })
                          )}
                        </button>
                      {/if}
                      {#if row.system.file.download}
                        <button
                          type="button"
                          class="pixel-btn pixel-btn--primary"
                          disabled={!listed || downloadButtonDisabled(listed.status, row.system.file.id)}
                          onclick={() => {
                            const id = row.system.file!.id;
                            if (listed && downloadSlotMode(listed.status, id) === "cancel") {
                              onCancelDownload(id);
                              return;
                            }
                            void onDownload(id);
                          }}
                        >
                          {downloadButtonLabel(
                            row.system.file.id,
                            listed?.status
                          )}
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {:else}
                {@const m = row.chat}
                {@const card = chatCard(m)}
                {@const chips = chatReactionRows(
                  reactionMap,
                  m.id,
                  goSessionChat.localAgentId
                )}
                <div
                  class={["bubble", m.local && "bubble--local", isHostMsg(m) && "bubble--host"]
                    .filter(Boolean)
                    .join(" ")}
                  role="article"
                  onpointerdown={() => onBubblePointerDown(m.id)}
                  onpointerup={clearHold}
                  onpointercancel={clearHold}
                  onpointerleave={clearHold}
                  oncontextmenu={(e) => {
                    e.preventDefault();
                    clearHold();
                    openMsgMenu(m.id);
                  }}
                >
                  <div class="bubble-head">
                    <span class="bubble-avatar" aria-hidden="true">
                      {#if card?.avatarUrl}
                        <img
                          class="bubble-avatar-img"
                          src={card.avatarUrl}
                          alt=""
                          width="32"
                          height="32"
                          referrerpolicy="no-referrer"
                        />
                      {:else}
                        <span class="bubble-avatar-letter">
                          {card?.avatarInitial ?? "?"}
                        </span>
                      {/if}
                    </span>
                    <span class="bubble-who">
                      {#if who(m)}<span class="bubble-name">{who(m)}</span>{/if}
                      {#if isHostMsg(m)}
                        <span class="host-tag">{GO_ROOM_ROLE_HOST}</span>
                      {/if}
                      <time class="bubble-time" datetime={new Date(m.ts).toISOString()}>
                        {formatRoomChatClock(m.ts)}
                      </time>
                    </span>
                    <button
                      type="button"
                      class="bubble-more"
                      aria-label="訊息選單"
                      aria-expanded={menuMsgId === m.id}
                      onclick={(e) => {
                        e.stopPropagation();
                        clearHold();
                        menuMsgId = menuMsgId === m.id ? null : m.id;
                      }}
                    >
                      ⋯
                    </button>
                  </div>
                  <p class="bubble-text">
                    {#each parseRoomChatSegments(m.text, mentionPeople) as part, i (i)}
                      {#if part.type === "mention"}
                        <span class="bubble-mention">{part.text}</span>
                      {:else}{part.text}{/if}
                    {/each}
                  </p>
                  {#if chips.length > 0}
                    <div class="react-chips" aria-label="反應">
                      {#each chips as chip (chip.emoji)}
                        <button
                          type="button"
                          class={["react-chip", chip.mine && "react-chip--mine"]
                            .filter(Boolean)
                            .join(" ")}
                          onclick={() => onReact(m.id, chip.emoji as SessionChatFloatEmoji)}
                        >
                          {chip.emoji} {chip.count}
                        </button>
                      {/each}
                    </div>
                  {/if}
                  {#if menuMsgId === m.id}
                    <div class="msg-menu" role="menu">
                      <div class="msg-menu-emojis" role="group" aria-label="加反應">
                        {#each SESSION_CHAT_FLOAT_EMOJIS as emoji (emoji)}
                          <button
                            type="button"
                            class="float-btn"
                            onclick={() => {
                              onReact(m.id, emoji);
                              menuMsgId = null;
                            }}
                          >
                            {emoji}
                          </button>
                        {/each}
                      </div>
                      {#if role === "host"}
                        <button
                          type="button"
                          class="pixel-btn"
                          onclick={() => {
                            goSessionChat.captionMessage(m.id);
                            menuMsgId = null;
                          }}
                        >
                          {GO_ROOM_TEXT_CAPTION}
                        </button>
                        <button
                          type="button"
                          class="pixel-btn"
                          onclick={() => {
                            goSessionChat.deleteMessage(m.id);
                            menuMsgId = null;
                          }}
                        >
                          {GO_ROOM_TEXT_DELETE}
                        </button>
                        {#if !m.local}
                          {#if goSessionChat.isPeerSilenced(m.from)}
                            <button
                              type="button"
                              class="pixel-btn"
                              onclick={() => {
                                goSessionChat.unsilencePeer(m.from);
                                menuMsgId = null;
                              }}
                            >
                              {GO_ROOM_TEXT_UNSILENCE}
                            </button>
                          {:else}
                            <button
                              type="button"
                              class="pixel-btn"
                              onclick={() => {
                                goSessionChat.silencePeer(m.from);
                                menuMsgId = null;
                              }}
                            >
                              {GO_ROOM_TEXT_SILENCE}
                            </button>
                          {/if}
                        {/if}
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
          {#if quickOpen && quickReplies.length > 0}
            <div class="quick" role="group" aria-label="快捷語">
              {#each quickReplies as q (q)}
                <button type="button" class="pixel-btn" onclick={() => onQuick(q)}>{q}</button>
              {/each}
            </div>
          {/if}
          {#if floatOpen}
            <div class="float-bar" role="group" aria-label="飄浮表情">
              {#each SESSION_CHAT_FLOAT_EMOJIS as emoji (emoji)}
                <button
                  type="button"
                  class="float-btn"
                  aria-label={`飄浮 ${emoji}`}
                  onclick={() => goSessionChat.floatEmoji(emoji)}
                >
                  {emoji}
                </button>
              {/each}
            </div>
          {/if}
          <form class="composer" onsubmit={onSubmit}>
            {#if mentionHits.length > 0}
              <ul class="mention-list" role="listbox" aria-label="提及成員">
                {#each mentionHits as person (person.peerId)}
                  <li>
                    <button
                      type="button"
                      class="mention-item"
                      onclick={() => insertMention(person)}
                    >
                      @{person.name}
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            <div class="composer-row">
              {#if role === "host"}
                <button
                  type="button"
                  class={[
                    "pixel-btn",
                    "composer-tool",
                    textLocked && "pixel-btn--primary",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={textLocked ? GO_ROOM_TEXT_UNLOCK : GO_ROOM_TEXT_LOCK}
                  aria-pressed={textLocked}
                  title={textLocked ? GO_ROOM_TEXT_UNLOCK : GO_ROOM_TEXT_LOCK}
                  onclick={() => goSessionChat.setTextLocked(!textLocked)}
                >
                  <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
                    {#if textLocked}
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    {:else}
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0" />
                    {/if}
                  </svg>
                </button>
              {/if}
              {#if quickReplies.length > 0}
                <button
                  type="button"
                  class={["pixel-btn", "composer-tool", quickOpen && "pixel-btn--primary"]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label="快捷語"
                  aria-expanded={quickOpen}
                  title="快捷語"
                  onclick={() => toggleQuickOpen()}
                >
                  <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6h16" />
                    <path d="M4 12h10" />
                    <path d="M4 18h14" />
                  </svg>
                </button>
              {/if}
              <button
                type="button"
                class={["pixel-btn", "composer-tool", floatOpen && "pixel-btn--primary"]
                  .filter(Boolean)
                  .join(" ")}
                aria-label="飄浮表情"
                aria-expanded={floatOpen}
                title="飄浮表情"
                onclick={() => toggleFloatOpen()}
              >
                <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8 14s1.5 2.5 4 2.5 4-2.5 4-2.5" />
                  <line x1="9" y1="9.5" x2="9.01" y2="9.5" />
                  <line x1="15" y1="9.5" x2="15.01" y2="9.5" />
                </svg>
              </button>
              <input
                bind:this={composerInputEl}
                class="pixel-input composer-input"
                type="text"
                maxlength={SESSION_CHAT_MAX_TEXT_CHARS}
                placeholder={composerHint}
                autocomplete="off"
                enterkeyhint="send"
                disabled={!canSpeak}
                bind:value={draft}
              />
              <button
                type="submit"
                class="pixel-btn pixel-btn--primary composer-send"
                aria-label="送出"
                title="送出"
                disabled={!canSpeak || !draft.trim()}
              >
                <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </form>
        </section>
      {/if}
    </div>

    {#if mediaError}
      <p class="err room-live-err" role="alert">{mediaError}</p>
    {/if}
    {#if goRoomMedia.error && goRoomMedia.error !== mediaError}
      <p class="err room-live-err" role="alert">{goRoomMedia.error}</p>
    {/if}
    {#if role === "guest" && goRoomMedia.programTransport}
      <p class="room-owner-decode" role="status">{GO_ROOM_OWNER_DECODE}</p>
    {/if}
    </div>
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

  <dialog
    bind:this={overlayDialog}
    class="room-sheet"
    aria-labelledby="room-overlay-title"
    oncancel={(e) => {
      /* Connecting／error／ended stay until the phase changes. */
      e.preventDefault();
    }}
  >
    {#if phase === "connecting"}
      <div class="booth-sheet pixel-box">
        <p id="room-overlay-title">{message || "正在進包廂…"}</p>
      </div>
    {:else if phase === "error"}
      <div class="booth-sheet pixel-box">
        <p id="room-overlay-title" class="err">{error || "無法開始"}</p>
        {#if role === "host"}
          <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onInvite?.()}>
            再試一次
          </button>
        {/if}
      </div>
    {:else if phase === "ended"}
      <div class="booth-sheet pixel-box">
        <p id="room-overlay-title">{message || "這一間已結束"}</p>
        <div class="room-actions">
          {#if role === "host" && loggedIn}
            <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => onReissue?.()}>
              再開一間
            </button>
          {/if}
          <a class="pixel-btn" href="/">回遊樂場大廳</a>
        </div>
      </div>
    {/if}
  </dialog>

  {#if previewOpen}
    <div
      class="file-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-preview-title"
      tabindex="-1"
      onclick={(e) => {
        if (e.currentTarget === e.target) closePreview();
      }}
    >
    <div class="confirm pixel-frame file-preview">
      <h2 id="file-preview-title" class="confirm-title">
        {roomFileShareOpenLabel(previewKind)}
        {#if previewFile}
          · {previewFile.name}
        {/if}
      </h2>
      {#if previewKind === "image" && roomFilePreviewMountsMedia(previewKind)}
        <div class="file-preview-player">
          <img
            bind:this={filePreviewImg}
            class="file-preview-img"
            alt={previewFile?.name ?? ""}
          />
        </div>
      {:else if previewKind === "audio" && roomFilePreviewMountsMedia(previewKind)}
        <div class="file-preview-player">
          <audio
            bind:this={filePlayEl}
            class="file-player-audio"
            controls
            preload="metadata"
            playsinline
            webkit-playsinline
            ontimeupdate={() => goRoomFiles.notePlayhead(filePlayEl?.currentTime ?? 0)}
            aria-label="播放 {previewFile?.name ?? ""}"
          ></audio>
        </div>
      {:else if previewKind === "video" && roomFilePreviewMountsMedia(previewKind)}
        <div class="file-preview-player">
          <video
            bind:this={filePlayEl}
            class="media-video media-video--program"
            controls
            muted
            preload={ROOM_FILE_PREVIEW_VIDEO_PRELOAD}
            playsinline
            webkit-playsinline
            ontimeupdate={() => goRoomFiles.notePlayhead(filePlayEl?.currentTime ?? 0)}
            aria-label="播放 {previewFile?.name ?? ""}"
          ></video>
        </div>
      {:else}
        <p class="muted">這個檔在本機打不開，請到檔案區下載查看。</p>
      {/if}
      {#if fileError}
        <p class="err" role="alert">{fileError}</p>
      {/if}
      {#if fileHint}
        <p class="muted" role="status">{fileHint}</p>
      {/if}
      <div class="confirm-actions">
        <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => closePreview()}>關閉</button>
      </div>
    </div>
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
        {#if kickTarget}
          {GO_ROOM_KICK}？
        {:else if privatePendingDelete}
          {GO_ROOM_PRIVATE_DELETE}？
        {:else if deleteFileId}
          {GO_ROOM_FILE_DELETE}？
        {:else if pendingAdHref}
          {role === "host" ? "結束這一間並打開小品？" : "離開這一間並打開小品？"}
        {:else}
          {role === "host" ? "結束這一間？" : "離開這一間？"}
        {/if}
      </h2>
      <p class="confirm-body">
        {#if kickTarget}
          {GO_ROOM_KICK_CONFIRM}
        {:else if privatePendingDelete}
          {GO_ROOM_PRIVATE_DELETE_CONFIRM}
        {:else if deleteFileId}
          {GO_ROOM_FILE_DELETE_CONFIRM}
        {:else}
          {role === "host" ? GO_ROOM_END_CONFIRM_HOST : GO_ROOM_LEAVE_CONFIRM_GUEST}
        {/if}
      </p>
      <div class="confirm-actions">
        <button type="button" class="pixel-btn" onclick={() => dismissConfirm()}>取消</button>
        {#if kickTarget}
          <button type="button" class="pixel-btn pixel-btn--danger" onclick={() => confirmKickNow()}>
            {GO_ROOM_KICK}
          </button>
        {:else if privatePendingDelete}
          <button
            type="button"
            class="pixel-btn pixel-btn--danger"
            onclick={() => {
              const id = privatePendingDelete;
              if (id) void onDeletePrivate(id);
            }}
          >
            {GO_ROOM_PRIVATE_DELETE}
          </button>
        {:else if deleteFileId}
          <button type="button" class="pixel-btn pixel-btn--danger" onclick={() => confirmDeleteFile()}>
            {GO_ROOM_FILE_DELETE}
          </button>
        {:else}
          <button type="button" class="pixel-btn pixel-btn--danger" onclick={() => void confirmEndNow()}>
            {role === "host" ? "結束" : "離開"}
          </button>
        {/if}
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
      flash={chromeSession.flash}
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
  .room--portrait.room--chrome-overlay:not(.room--cinema) {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    gap: 0.4rem;
  }
  .room--portrait.room--chrome-overlay:not(.room--cinema) .room-tv-col {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .room--portrait.room--chrome-overlay:not(.room--cinema) .room-tv-stage {
    flex: 0 0 auto;
    min-height: 0;
    width: 100%;
  }
  .room--portrait.room--chrome-overlay:not(.room--cinema) .room-tv-col :global(.tv-slot) {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
  }
  .room--portrait.room--chrome-overlay .room-lower {
    min-height: 0;
    overflow: hidden;
  }
  .room--portrait.room--chrome-overlay .room-shell {
    flex: 1 1 auto;
    min-height: 0;
  }
  .room--portrait.room--chrome-overlay .room-pane--chat {
    min-height: 0;
  }
  .room--cinema {
    position: absolute;
    inset: 0;
    height: auto;
    min-height: 0;
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
  .room-tv-col {
    flex: 0 0 auto;
    min-width: 0;
  }
  .room-tv-stage {
    position: relative;
    min-width: 0;
    container-type: inline-size;
  }
  .room-tv-gate {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.85rem 1rem;
    box-sizing: border-box;
    background: color-mix(in oklab, rgb(var(--ink)) 42%, transparent);
    color: #f4efe4;
    pointer-events: auto;
  }
  .room-tv-gate-title {
    margin: 0;
    font-size: 1rem;
    color: #f4efe4;
  }
  .room-tv-gate-body {
    margin: 0;
    line-height: 1.45;
    font-size: 0.92rem;
  }
  .room-tv-gate-btn {
    min-height: 44px;
    align-self: stretch;
  }
  .room-tv-gate-hint {
    margin: 0;
    color: color-mix(in oklab, #f4efe4 88%, transparent);
  }
  @container (min-width: 28rem) {
    .room-tv-gate {
      align-items: center;
      text-align: center;
      padding: 1.25rem 1.5rem;
    }
    .room-tv-gate-body,
    .room-tv-gate-hint {
      max-width: 28rem;
    }
    .room-tv-gate-btn {
      align-self: center;
      min-width: min(100%, 16rem);
    }
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
  .room-lower {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    gap: 0.35rem;
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
  .room--portrait .room-pane--chat {
    min-height: 0;
    padding-top: 0.25rem;
  }
  .room--portrait .room-dock {
    gap: 0.25rem;
  }
  .room--portrait .room-tabs {
    gap: 0.25rem;
  }
  .room--portrait .room-tabs .pixel-btn {
    padding-left: 0.45rem;
    padding-right: 0.45rem;
  }
  .door-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.55rem;
    margin: 0 0 0.15rem;
  }
  .door-row-label {
    margin: 0;
    flex: 1 1 auto;
    min-width: 0;
  }
  .door-row-action {
    flex: 0 0 auto;
    min-height: 44px;
  }
  .member-list {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
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
  .room-dock-btn {
    min-height: 44px;
    min-width: 44px;
    width: 44px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .dock-icon {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .room-sheet {
    width: 100%;
    max-width: none;
    height: 100%;
    max-height: none;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
  }
  .room-sheet[open] {
    display: flex;
    align-items: flex-end;
  }
  .room-sheet::backdrop {
    background: color-mix(in oklab, rgb(var(--ink)) 28%, transparent);
  }
  .booth-sheet {
    position: relative;
    z-index: 1;
    width: 100%;
    max-height: min(80%, 32rem);
    overflow: auto;
    padding: 0.75rem 0.85rem 0.9rem;
    background: rgb(var(--card));
    border-radius: var(--radius) var(--radius) 0 0;
    border-top: var(--pixel-edge) solid rgb(var(--ink));
    pointer-events: auto;
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
    max-width: 92%;
  }
  .bubble--local {
    align-self: flex-end;
  }
  .bubble-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }
  .bubble-more {
    flex: 0 0 auto;
    min-width: 44px;
    min-height: 44px;
    margin-left: auto;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .bubble-avatar {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid rgb(var(--ink));
    background: color-mix(in oklab, rgb(var(--ink)) 10%, rgb(var(--fill)));
  }
  .bubble-avatar-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .bubble-avatar-letter {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 700;
  }
  .bubble-who {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    font-size: 0.75rem;
    color: rgb(var(--muted));
  }
  .bubble-name {
    font-weight: 700;
    color: rgb(var(--ink));
  }
  .bubble-time {
    font-variant-numeric: tabular-nums;
    opacity: 0.85;
  }
  .host-tag {
    display: inline-flex;
    align-items: center;
    min-height: 1.25rem;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: rgb(var(--gold));
    color: rgb(var(--ink));
    font-size: 0.65rem;
    font-weight: 700;
  }
  .bubble-text {
    display: block;
    margin: 0.2rem 0 0 2.4rem;
    padding: 0.45rem 0.6rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    word-break: break-word;
    line-height: 1.4;
  }
  .bubble--local .bubble-text {
    background: color-mix(in oklab, rgb(var(--accent)) 14%, rgb(var(--fill)));
  }
  .bubble-mention {
    font-weight: 700;
    color: rgb(var(--accent));
  }
  .react-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin: 0.25rem 0 0 2.4rem;
  }
  .react-chip,
  .float-btn {
    min-width: 44px;
    min-height: 44px;
    padding: 0 0.4rem;
    border: 2px solid rgb(var(--ink));
    border-radius: 999px;
    background: rgb(var(--fill));
    font: inherit;
    cursor: pointer;
  }
  .react-chip--mine {
    background: color-mix(in oklab, rgb(var(--accent)) 18%, rgb(var(--fill)));
  }
  .msg-menu {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0.35rem 0 0 2.4rem;
    padding: 0.4rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
  }
  .msg-menu-emojis,
  .float-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .float-bar {
    flex: 0 0 auto;
    padding: 0.15rem 0 0.25rem;
  }
  .chat-speak-hint {
    margin: 0 0 0.25rem;
    flex: 0 0 auto;
  }
  .msg-menu .pixel-btn {
    min-height: 44px;
  }
  .sys {
    align-self: stretch;
    margin: 0.1rem 0;
    padding: 0.45rem 0.6rem;
    border-radius: var(--radius);
    background: color-mix(in oklab, rgb(var(--ink)) 8%, rgb(var(--fill)));
    color: color-mix(in oklab, rgb(var(--ink)) 78%, transparent);
    font-size: 0.82rem;
  }
  .sys--file {
    border: 2px solid color-mix(in oklab, rgb(var(--ink)) 22%, transparent);
    background: color-mix(in oklab, rgb(var(--ink)) 6%, rgb(var(--fill)));
  }
  .sys--tv {
    border: 2px solid rgb(var(--gold));
    background: color-mix(in oklab, rgb(var(--gold)) 16%, rgb(var(--fill)));
    color: rgb(var(--ink));
  }
  .sys-text {
    margin: 0;
    line-height: 1.4;
  }
  .sys-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.4rem;
  }
  .sys-actions .pixel-btn {
    min-height: 44px;
  }
  .file-list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .file-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.15rem 0 0.45rem;
  }
  .file-filters--kind {
    border: 0;
    padding: 0;
    margin: 0.15rem 0 0.45rem;
    min-inline-size: 0;
  }
  .file-filters-legend {
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
  .file-filters-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    width: 100%;
  }
  .file-filter {
    min-height: 44px;
    flex: 1 1 auto;
  }
  .file-filter-radio {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1 1 auto;
    min-height: 44px;
    padding: 0.35rem 0.55rem;
    border: 2px solid color-mix(in oklab, rgb(var(--ink)) 28%, transparent);
    border-radius: var(--radius);
    background: color-mix(in oklab, rgb(var(--fill)) 92%, transparent);
    font: inherit;
    cursor: pointer;
    box-sizing: border-box;
  }
  .file-filter-radio input {
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
    accent-color: rgb(var(--accent));
    flex-shrink: 0;
  }
  .file-filter-radio--on {
    border-color: color-mix(in oklab, rgb(var(--accent)) 70%, rgb(var(--ink)));
    background: color-mix(in oklab, rgb(var(--accent)) 16%, rgb(var(--fill)));
    font-weight: 700;
  }
  .file-drop {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.25rem;
    width: 100%;
    min-height: 5.5rem;
    margin: 0 0 0.45rem;
    padding: 0.7rem 0.65rem;
    border: 2px dashed color-mix(in oklab, rgb(var(--ink)) 45%, transparent);
    border-radius: var(--radius);
    background: color-mix(in oklab, rgb(var(--fill)) 88%, transparent);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .room-pane--drop .file-drop {
    border-style: solid;
    background: color-mix(in oklab, rgb(var(--accent)) 14%, rgb(var(--fill)));
  }
  .file-drop-title {
    font-weight: 700;
  }
  .file-drop-bar {
    width: 100%;
    height: 0.55rem;
    accent-color: rgb(var(--accent));
  }
  .file-card {
    padding: 0.55rem 0.5rem 0.5rem;
    border: 2px solid color-mix(in oklab, rgb(var(--ink)) 22%, transparent);
    border-radius: var(--radius);
    background: rgb(var(--card));
  }
  .file-card--on-air {
    border-color: #3dff8a;
    box-shadow: 0 0 0 2px color-mix(in oklab, #3dff8a 55%, transparent);
  }
  .file-card-head {
    display: flex;
    align-items: flex-start;
    gap: 0.45rem;
    min-width: 0;
  }
  .file-type {
    flex: 0 0 auto;
    font-size: 1.35rem;
    line-height: 1.2;
  }
  .file-card-meta {
    flex: 1 1 auto;
    min-width: 0;
  }
  .file-owner {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    max-width: 4.5rem;
  }
  .file-owner-name {
    overflow: hidden;
    max-width: 100%;
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-on-air {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0.4rem 0 0;
    font-weight: 700;
    color: #146b3a;
  }
  .file-on-air-wave {
    display: inline-block;
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 50%;
    background: #3dff8a;
    animation: file-on-air-pulse 1.1s ease-in-out infinite;
  }
  @keyframes file-on-air-pulse {
    0%,
    100% {
      transform: scale(0.75);
      opacity: 0.55;
    }
    50% {
      transform: scale(1.15);
      opacity: 1;
    }
  }
  .file-name {
    margin: 0;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .file-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.45rem;
  }
  .file-actions .pixel-btn {
    min-height: 44px;
  }
  .file-preview-overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0.75rem;
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
    background: color-mix(in oklab, rgb(var(--ink)) 45%, transparent);
    box-sizing: border-box;
  }
  .file-preview-overlay .file-preview {
    width: min(28rem, 100%);
    max-height: min(90dvh, 40rem);
    overflow: auto;
  }
  .file-preview-img {
    display: block;
    width: 100%;
    max-height: 16rem;
    object-fit: contain;
    background: #111;
  }
  .file-preview-player {
    width: 100%;
    margin: 0 0 0.5rem;
    background: #111;
  }
  .file-preview-player .file-player-audio,
  .file-preview-player .media-video--program {
    display: block;
    width: 100%;
    position: static;
    z-index: auto;
    transform: none;
  }
  .file-preview-player .media-video--program {
    min-height: 10rem;
    max-height: min(50dvh, 16rem);
    aspect-ratio: 16 / 9;
    object-fit: contain;
    background: #000;
  }
  @media (min-width: 48rem) {
    .file-preview-overlay {
      align-items: center;
    }
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
  .quick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0 0 0.25rem;
    flex: 0 0 auto;
  }
  .composer {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.15rem;
    flex: 0 0 auto;
  }
  .composer-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: stretch;
    gap: 0.3rem;
    min-width: 0;
  }
  .mention-list {
    list-style: none;
    margin: 0;
    padding: 0.25rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    max-height: 9rem;
    overflow: auto;
  }
  .mention-item {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 0.35rem 0.55rem;
    border: none;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .mention-item:hover,
  .mention-item:focus-visible {
    background: color-mix(in oklab, rgb(var(--accent)) 16%, transparent);
    outline: none;
  }
  .composer-input {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
  }
  .composer-send,
  .composer-tool {
    flex: 0 0 auto;
    min-height: 44px;
    min-width: 44px;
    width: 44px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
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
    .room--desktop:not(.room--cinema) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 22rem;
      grid-template-rows: minmax(0, 1fr);
      gap: 0;
      max-width: none;
      height: 100%;
      min-height: 0;
      padding: 0;
    }
    /* Gate／ended: no control rail — keep the TV full-width 16:9. */
    .room--desktop:not(.room--cinema):not(:has(.room-lower)) {
      display: flex;
      flex-direction: column;
      height: auto;
      max-width: 56rem;
      margin-inline: auto;
      padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
    }
    .room--desktop:not(.room--cinema) .room-tv-col {
      grid-column: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 0.35rem 0.65rem;
    }
    .room--desktop:not(.room--cinema):not(:has(.room-lower)) .room-tv-col {
      padding: 0;
    }
    .room--desktop:not(.room--cinema) .room-tv-stage {
      flex: 1 1 auto;
      min-height: 0;
    }
    .room--desktop:not(.room--cinema) .room-tv-col :global(.tv-slot) {
      height: 100%;
      aspect-ratio: auto;
    }
    .room--desktop:not(.room--cinema):not(:has(.room-lower)) .room-tv-col :global(.tv-slot) {
      height: auto;
      aspect-ratio: 16 / 9;
    }
    .room--desktop .room-lower {
      display: flex;
      flex-direction: column;
      min-height: 0;
      height: 100%;
      gap: 0.35rem;
      padding: 0.45rem 0.65rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
      background: rgb(var(--card));
      border-left: var(--pixel-edge) solid rgb(var(--ink));
      box-sizing: border-box;
    }
    .room--desktop:not(.room--cinema) .room-lower {
      grid-column: 2;
    }
    .room--desktop .room-dock {
      flex: 0 0 auto;
      padding-bottom: 0.35rem;
      border-bottom: 1px solid color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
    }
    .room--desktop .room-shell {
      flex: 1 1 auto;
      display: grid;
      grid-template-columns: 1fr;
      grid-template-areas:
        "files"
        "tabs"
        "lower";
      grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);
      min-height: 0;
      gap: 0;
    }
    .room--desktop .room-tabs {
      display: flex;
      grid-area: tabs;
      flex: none;
      padding: 0.25rem 0 0.15rem;
    }
    .room--desktop .room-pane--files {
      grid-area: files;
      border-bottom: 1px solid color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
    }
    .room--desktop .room-pane--members,
    .room--desktop .room-pane--chat {
      grid-area: lower;
    }
  }
  /* Wide hall (>1280px): control panel splits files | members/chat. */
  @media (min-width: 80.0625rem) {
    .room--desktop:not(.room--cinema) {
      grid-template-columns: minmax(0, 1fr) minmax(36rem, 44rem);
    }
    .room--desktop .room-shell {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "files tabs"
        "files lower";
      grid-template-rows: auto minmax(0, 1fr);
      gap: 0;
    }
    .room--desktop .room-pane--files {
      border-bottom: none;
      border-right: 1px solid color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
      padding-right: 0.45rem;
    }
    .room--desktop .room-tabs {
      padding-left: 0.45rem;
    }
    .room--desktop .room-pane--members,
    .room--desktop .room-pane--chat {
      padding-left: 0.45rem;
    }
  }
  @media (orientation: landscape) and (max-height: 560px) {
    .room--short-landscape:not(.room--cinema) {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(12rem, 1fr);
      grid-template-rows: minmax(0, 1fr);
      height: 100%;
      max-height: 100%;
      overflow: hidden;
      gap: 0.35rem;
      padding: 0.2rem 0.4rem;
    }
    .room--short-landscape:not(.room--cinema) .room-tv-col {
      grid-column: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .room--short-landscape:not(.room--cinema) .room-tv-stage {
      flex: 1 1 auto;
      min-height: 0;
    }
    .room--short-landscape:not(.room--cinema) .room-tv-col :global(.tv-slot) {
      height: 100%;
      aspect-ratio: auto;
    }
    .room--short-landscape .room-lower {
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      background: rgb(var(--card));
      border-left: var(--pixel-edge) solid rgb(var(--ink));
      padding: 0.3rem 0.4rem calc(0.3rem + env(safe-area-inset-bottom, 0px));
      box-sizing: border-box;
    }
    .room--short-landscape:not(.room--cinema) .room-lower {
      grid-column: 2;
    }
    .room--short-landscape .room-dock {
      flex: 0 0 auto;
    }
    .room--short-landscape .room-shell {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      gap: 0.35rem;
    }
    .room--short-landscape .room-tabs {
      display: flex;
      flex: none;
    }
    .room--short-landscape .room-pane,
    .room--short-landscape .room-pane--chat {
      flex: 1 1 auto;
      min-height: 0;
      grid-area: auto;
    }
  }
  @media (min-width: 40rem) {
    .confirm-actions,
    .room-actions {
      flex-direction: row;
    }
  }
  /* Cinema: video fills the playing surface; HUD overlays hall geometry. */
  .room.room--cinema {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 0;
    height: auto;
    min-height: 0;
    max-height: none;
    width: 100%;
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
  .room.room--cinema .room-live-err {
    position: relative;
    z-index: 6;
    margin: 0.35rem 0 0;
  }
  .room-owner-decode {
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
    line-height: 1.35;
    color: var(--go-muted, #8a8694);
  }
</style>

