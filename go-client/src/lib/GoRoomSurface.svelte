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
  import GoRoomFileCard from "$lib/GoRoomFileCard.svelte";
  import GoRoomPlayPicker from "$lib/GoRoomPlayPicker.svelte";
  import GoRoomSettingsPanel from "$lib/GoRoomSettingsPanel.svelte";
  import GoSamLoadBar from "$lib/GoSamLoadBar.svelte";
  import { listRoomPlayableGames } from "$lib/goRoomPlayBootstrap";
  import { getGoCatalogEntry } from "$lib/goCatalog";
  import type { GoLoadProgress } from "$lib/goLoadProgress";
  import { goAuth } from "$lib/goAuth.svelte";
  import { readRemoteAnchorEnabled } from "$lib/boothAnchorBridge";
  import { roomAdClickAction } from "$lib/goAds";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import {
    GO_ROOM_CAMERA_STOP_WATCH,
    GO_ROOM_CONNECTING_BODY,
    GO_ROOM_CONNECTING_TITLE,
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
    htmlMediaCaptureStreamSupported,
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
    roomGuestHostName,
    roomGuestStatusLine,
    roomHostDisplayName,
    roomInBooth,
    playerDisplayName,
    roomTvStatusGate,
    roomHostMemberMenu,
    roomHostMemberPutOnTv,
    roomHostMemberRecord,
    roomMemberCard,
    roomMemberCardsSorted,
    roomMemberShowsDirectLink,
    roomOccupantRows,
    roomShowAdSlot,
    roomShellActiveTab,
    roomShellDefaultPane,
    roomShellFilesPinned,
    roomShellMode,
    roomShellPanesConcurrent,
    roomShellShowPane,
    roomShellTabPanes,
    roomShellViewportBox,
    roomStageStatus,
    roomStatusLineVisible,
    roomTvHudHasTransport,
    roomTvHudKind,
    roomTvHudRestore,
    roomTvLabel,
    roomTvBindStream,
    roomTvPictureOn,
    roomTvHintCopy,
    roomTvHintEligible,
    roomTvHintSeen,
    markRoomTvHintSeen,
    GO_ROOM_HOST_CHECKLIST_LABELS,
    GO_ROOM_INVITE_REVOKE,
    GO_ROOM_INVITE_REVOKE_CONFIRM,
    GO_ROOM_CINEMA_PEEK_HINT,
    GO_ROOM_CINEMA_PEEK_HINT_MS,
    markRoomCinemaPeekHintSeen,
    markRoomHostChecklistDismissed,
    roomTvSnowEnabled,
    roomCinemaPeekHintSeen,
    roomHostChecklistDismissed,
    roomHostChecklistEligible,
    roomHostChecklistPendingSteps,
    syncTvSinkPlayback,
    toggleTvFullscreen,
    tvFullscreenElement,
    tvIsFullscreen,
    takePickedFiles,
    type RoomHostMenuAction,
    type RoomInviteDoor,
    type RoomOccupantPeer,
    type RoomShellMode,
    type RoomShellPane,
    type RoomSurfaceRole,
  } from "$lib/goRoom";
  import {
    catalogConsumes,
    catalogTransferHint,
  } from "$lib/goRoomCatalog";
  import {
    GO_ROOM_FILE_CANCEL,
    GO_ROOM_FILE_DELETE,
    GO_ROOM_FILE_DELETE_CONFIRM,
    GO_ROOM_FILE_DOWNLOAD,
    GO_ROOM_FILE_SAVE,
    GO_ROOM_FILE_SAVE_READY_HINT,
    GO_ROOM_FILE_DROP,
    GO_ROOM_FILE_FILTERS,
    GO_ROOM_FILE_FILTER_LABEL,
    GO_ROOM_FILE_ZONE,
    GO_ROOM_FILE_ZONE_LABEL,
    GO_ROOM_PRIVATE_DELETE,
    GO_ROOM_PRIVATE_DELETE_CONFIRM,
    GO_ROOM_PRIVATE_DROP,
    GO_ROOM_PRIVATE_UNSUPPORTED_HINT,
    ROOM_FILE_PREVIEW_VIDEO_PRELOAD,
    fileShareKind,
    formatFileShareSize,
    roomFileDownloadDisabled,
    roomFileDownloadMode,
    roomFileOnAir,
    roomFileLiveBadge,
    roomFilePreviewMountsMedia,
    roomFilePreviewShouldAttachUrl,
    roomFilePrivateMenu,
    roomFileShareMenu,
    roomFileTvCastSourceHint,
    roomFileShareMatches,
    roomFileShareOpenLabel,
    roomFileShareProgress,
    type RoomFileMenuAction,
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
    role: RoomSurfaceRole;
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
    /** Guest mesh: peerIds with an open direct DataChannel. */
    directPeerIds?: string[];
    onLogin?: () => void;
    onInvite?: () => void;
    onRevokeInvite?: () => void;
    onEnd?: () => void | Promise<void>;
    onReissue?: () => void;
    onKick?: (peerId: string) => void;
    playCatalogId?: string | null;
    playLoadProgress?: GoLoadProgress | null;
    playCanvasUrl?: string | null;
    playCanvasSrcdoc?: string | null;
    playCanvasGeneration?: number;
    /** Host wire peer id for manual seats（session_play）. */
    playLocalPeerId?: string | null;
    playHostName?: string | null;
    /** Guest booth play: watching without a seat. */
    playSpectator?: boolean;
    onStartPlay?: (
      catalogId: string
    ) =>
      | void
      | Promise<
          | { ok: true }
          | { ok: false; reason: string; missingRoles?: string[] }
          | undefined
        >;
    onStartManualPlay?: (
      catalogId: string,
      picks: { role: string; peerId: string }[]
    ) =>
      | void
      | Promise<
          | { ok: true }
          | { ok: false; reason: string; missingRoles?: string[] }
          | undefined
        >;
    onEndPlay?: () => void | Promise<void>;
    onRemoteAnchorChange?: (enabled: boolean) => void | Promise<void>;
    /** Operator remote shell — snapshot-driven TV + WebRTC program preview (§10.6). */
    operatorTvOn?: boolean;
    operatorTvLabel?: string | null;
    operatorTvStream?: MediaStream | null;
    operatorCanDirect?: boolean;
    operatorProgramTransport?: boolean;
    operatorProgramPaused?: boolean;
    operatorProgramTime?: number;
    operatorProgramDuration?: number;
    operatorRemoteLives?: { peerId: string; camera: boolean; mic: boolean }[];
    operatorLocalCamera?: boolean;
    operatorLocalMic?: boolean;
    operatorLocalPeerId?: string | null;
    onCastLive?: (peerId: string, name: string) => void | Promise<void>;
    onOperatorCastState?: (payload: {
      paused?: boolean;
      t?: number;
    }) => void;
    onOperatorCastFile?: (
      fileId: string,
      scope?: "share" | "private"
    ) => void | Promise<void>;
    onOperatorStopTv?: () => void | Promise<void>;
    onOperatorHaltLive?: (
      peerId: string,
      layer: "audio" | "video"
    ) => void | Promise<void>;
    onOperatorStartRecord?: (
      peerId: string,
      displayName?: string
    ) => void | Promise<void>;
    onOperatorStopRecord?: (peerId: string) => void | Promise<void>;
    onOperatorToggleCamera?: () => void | Promise<void>;
    onOperatorToggleMic?: () => void | Promise<void>;
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
    directPeerIds = [],
    onLogin,
    onInvite,
    onRevokeInvite,
    onEnd,
    onReissue,
    onKick,
    playCatalogId = null,
    playLoadProgress = null,
    playCanvasUrl = null,
    playCanvasSrcdoc = null,
    playCanvasGeneration = 0,
    playLocalPeerId = null,
    playHostName = null,
    playSpectator = false,
    onStartPlay,
    onStartManualPlay,
    onEndPlay,
    onRemoteAnchorChange,
    operatorTvOn = false,
    operatorTvLabel = null,
    operatorTvStream = null,
    operatorCanDirect = false,
    operatorProgramTransport = false,
    operatorProgramPaused = true,
    operatorProgramTime = 0,
    operatorProgramDuration = 0,
    operatorRemoteLives = [],
    operatorLocalCamera = false,
    operatorLocalMic = false,
    operatorLocalPeerId = null,
    onCastLive,
    onOperatorCastState,
    onOperatorCastFile,
    onOperatorStopTv,
    onOperatorHaltLive,
    onOperatorStartRecord,
    onOperatorStopRecord,
    onOperatorToggleCamera,
    onOperatorToggleMic,
  }: Props = $props();

  const isOperator = $derived(role === "operator");
  const isHostLike = $derived(role === "host" || role === "operator");
  const operatorWriteLocked = $derived(isOperator && !operatorCanDirect);

  let playPickerOpen = $state(false);
  let roomSettingsOpen = $state(false);
  let remoteAnchorEnabled = $state(readRemoteAnchorEnabled());
  const playableGames = $derived(listRoomPlayableGames());
  const nativeFileCapture = htmlMediaCaptureStreamSupported();
  const playPickerOccupants = $derived.by(() => {
    const hostId = playLocalPeerId?.trim();
    if (!hostId) return occupantPeers;
    const hostName =
      playerDisplayName(playHostName, "") ||
      roomHostDisplayName(goAuth.profile);
    const seen = new Set<string>([hostId]);
    const rows = [{ peerId: hostId, name: hostName }];
    for (const p of occupantPeers) {
      if (!p.peerId || seen.has(p.peerId)) continue;
      seen.add(p.peerId);
      rows.push({ peerId: p.peerId, name: p.name?.trim() || "訪客" });
    }
    return rows;
  });

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
  let deleteFileId = $state<string | null>(null);
  let inviteRevokePending = $state(false);
  let now = $state(Date.now());
  let pane = $state<RoomShellPane>(roomShellDefaultPane());
  let composerInputEl = $state<HTMLInputElement | null>(null);
  let roomEl = $state<HTMLElement | null>(null);
  let railEl = $state<HTMLElement | null>(null);
  let shellBox = $state({ widthPx: 0, heightPx: 0 });
  let shellModeLocked = $state<RoomShellMode | null>(null);
  let railLeftPx = $state(0);
  let tvHudOpen = $state(false);
  let tvSlotFullscreen = $state(false);
  let selectedPeerId = $state<string | null>(null);
  let hostMenuPeerId = $state<string | null>(null);
  let fileMenuId = $state<string | null>(null);
  let kickTarget = $state<{ peerId: string; name: string } | null>(null);
  let pendingShare = $state(false);
  let tvVideoEl = $state<HTMLVideoElement | null>(null);
  let tvSlotEl = $state<HTMLElement | null>(null);
  let cinemaUserEnter = $state(false);
  let tvHintConsumed = $state(false);
  let hostChecklistDismissed = $state(false);
  let tvSnowEnabled = $state(true);
  let cinemaPeekConsumed = $state(false);
  let cinemaPeekToast = $state(false);
  let cinemaPeekFading = $state(false);
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
  const canSpeak = $derived(
    role === "host" ||
      (isOperator && operatorCanDirect) ||
      (!textLocked && !localSilenced)
  );
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
  const showPrivateZone = $derived(role === "host" || role === "operator");
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
      localLiveVideo: isOperator
        ? operatorLocalCamera
        : goRoomMedia.camera || goRoomMedia.display,
      localLiveAudio: isOperator ? operatorLocalMic : goRoomMedia.mic,
      others:
        occupantPeers.length > 0
          ? occupantPeers
          : occupantNames.map((name, i) => ({
              peerId: `name-${i}-${name}`,
              name,
            })),
      remoteLives: isOperator ? operatorRemoteLives : goRoomMedia.remoteLives,
    })
  );
  const hostPeerId = $derived(
    playLocalPeerId?.trim() ||
      (isHostLike && !isOperator ? "local" : occupantPeers[0]?.peerId ?? null)
  );
  const memberCards = $derived(
    roomMemberCardsSorted(
      roster.map((person) =>
        roomMemberCard({
          occupant: person,
          hostPeerId,
          tvSourcePeerId: goRoomMedia.tvSourcePeerId,
          localAgentId: playLocalPeerId,
          recordingPeerIds: goRoomMedia.recordingPeerIds,
          avatarUrl: person.mine ? goAuth.profile?.avatar_url : null,
          directLink: roomMemberShowsDirectLink({
            mine: person.mine,
            peerId: person.peerId,
            directPeerIds,
          }),
        })
      )
    )
  );
  const playActive = $derived(
    Boolean(playCatalogId || playCanvasUrl || playCanvasSrcdoc)
  );
  const playTvName = $derived.by(() => {
    const id = playCatalogId?.trim();
    if (!id) return playActive ? "遊戲" : null;
    return getGoCatalogEntry(id)?.title?.trim() || id;
  });
  const tvLabel = $derived(
    isOperator
      ? operatorTvLabel
      : roomTvLabel({
          programName: goRoomMedia.programName,
          remoteProgramName: goRoomMedia.remoteProgramName,
          playName: playTvName,
        })
  );
  const tvStream = $derived(
    isOperator
      ? operatorTvOn
        ? operatorTvStream
        : null
      : roomTvBindStream({
          programStream: goRoomMedia.programStream,
          localProgramStream: goRoomMedia.localProgramStream,
          programName: goRoomMedia.programName,
          remoteProgramName: goRoomMedia.remoteProgramName,
        })
  );
  const tvOn = $derived(
    isOperator
      ? operatorTvOn
      : roomTvPictureOn({
          programName: goRoomMedia.programName,
          remoteProgramName: goRoomMedia.remoteProgramName,
        })
  );
  const loginGate = $derived(
    roomHostLoginGate({ role, loggedIn, phase, clientReady })
  );
  const tvStatusGate = $derived(roomTvStatusGate(phase));

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
  const programPaused = $derived(
    isOperator ? operatorProgramPaused : goRoomMedia.programPaused
  );
  const programTime = $derived(
    isOperator ? operatorProgramTime : goRoomMedia.programTime
  );
  const programDuration = $derived(
    isOperator ? operatorProgramDuration : goRoomMedia.programDuration
  );
  const programTransport = $derived(
    isOperator ? operatorProgramTransport : goRoomMedia.programTransport
  );
  const tvHudKind = $derived(
    roomTvHudKind({
      tvOn,
      role,
      fileTransport: programTransport,
      fileOnTv: isOperator
        ? programTransport
        : Boolean(goRoomMedia.streamingFileId),
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
    roomInBooth({
      role,
      loggedIn: isOperator ? true : loggedIn,
      phase,
    })
  );
  /** Logged-out／connecting／ended: full-width TV, not the in-booth rail split. */
  const shellModeLive = $derived(
    inBooth ? roomShellMode(shellBox) : "portrait"
  );
  const shellMode = $derived(shellModeLocked ?? shellModeLive);
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
      playActive,
      cinema,
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

  const tvIdleSnow = $derived(isHostLike ? tvSnowEnabled : true);
  const showTvHint = $derived(
    role === "guest" &&
      showMembers &&
      roomTvHintEligible({ tvOn, playActive }) &&
      !tvHintConsumed
  );

  const hostChecklistProgress = $derived({
    door,
    guestCount,
    fileCastOnTv:
      tvOn &&
      Boolean(goRoomMedia.streamingFileId || goRoomMedia.castingFileId),
    liveCastOnTv: tvOn && Boolean(goRoomMedia.tvSourcePeerId),
  });

  const hostChecklistEligible = $derived(
    roomHostChecklistEligible({
      role,
      phase,
      tvOn,
      playActive,
      dismissed: hostChecklistDismissed,
    })
  );

  const hostChecklistPending = $derived(
    hostChecklistEligible
      ? roomHostChecklistPendingSteps(hostChecklistProgress)
      : []
  );

  const showHostChecklist = $derived(
    showMembers && hostChecklistPending.length > 0
  );

  onMount(() => {
    tvHintConsumed = roomTvHintSeen();
    hostChecklistDismissed = roomHostChecklistDismissed();
    cinemaPeekConsumed = roomCinemaPeekHintSeen();
    tvSnowEnabled = roomTvSnowEnabled();
  });

  $effect(() => {
    if (showTvHint) markRoomTvHintSeen();
  });

  $effect(() => {
    if (hostChecklistEligible && hostChecklistPending.length === 0) {
      markRoomHostChecklistDismissed();
      hostChecklistDismissed = true;
    }
  });

  $effect(() => {
    if (!cinema || cinemaPeekConsumed) {
      cinemaPeekToast = false;
      cinemaPeekFading = false;
      return;
    }
    markRoomCinemaPeekHintSeen();
    cinemaPeekConsumed = true;
    cinemaPeekToast = true;
    cinemaPeekFading = false;
    const fade = window.setTimeout(() => {
      cinemaPeekFading = true;
    }, GO_ROOM_CINEMA_PEEK_HINT_MS);
    const hide = window.setTimeout(() => {
      cinemaPeekToast = false;
      cinemaPeekFading = false;
    }, GO_ROOM_CINEMA_PEEK_HINT_MS + 400);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(hide);
    };
  });

  const statusLabel = $derived.by(() => {
    if (error) return error;
    if (phase === "connecting") return message || GO_ROOM_CONNECTING_TITLE;
    if (phase === "ended") return message || "這一間已結束";
    if (inBooth) {
      if (isOperator) {
        return message || (operatorCanDirect ? "遠端導播中" : "遠端檢視");
      }
      if (role === "guest") {
        const hostName =
          playerDisplayName(playHostName, "") ||
          roomGuestHostName(occupantPeers);
        return roomGuestStatusLine({
          guestCount,
          tvLabel,
          hostName: hostName || null,
          playActive,
          playGameName: playTvName,
          playSpectator,
        });
      }
      const line = roomStageStatus({ guestCount, tvLabel });
      if (line) return line;
      return message;
    }
    return message;
  });

  const statusLineVisible = $derived(
    roomStatusLineVisible({ cinemaHud, phase })
  );
  const statusOccupied = $derived(guestCount > 0);

  const showComposer = $derived(
    inBooth &&
      (role === "host" ||
        connected ||
        (isOperator && phase === "open"))
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
      shellBox = roomShellViewportBox();
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
      confirmOpen:
        confirmEnd ||
        playPickerOpen ||
        Boolean(kickTarget) ||
        Boolean(deleteFileId) ||
        Boolean(privatePendingDelete) ||
        inviteRevokePending,
      // 包廂設定：勿 pin／拉出 playground header（對齊 composer、卡片更多選單）。
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
    if (!inBooth) return;
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
        { peerId: "local", name: roomHostDisplayName(goAuth.profile) },
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
      (confirmEnd ||
        kickTarget ||
        deleteFileId ||
        privatePendingDelete ||
        inviteRevokePending) &&
      !el.open
    ) {
      el.showModal();
    }
    if (
      !confirmEnd &&
      !kickTarget &&
      !deleteFileId &&
      !privatePendingDelete &&
      !inviteRevokePending &&
      el.open
    ) {
      el.close();
    }
  });

  $effect(() => {
    const openPeer = hostMenuPeerId;
    const openFile = fileMenuId;
    if (!openPeer && !openFile) return;
    const onPtr = (e: PointerEvent) => {
      const t = e.target;
      if (t instanceof Element) {
        if (
          openPeer &&
          t.closest(`[data-member-peer="${CSS.escape(openPeer)}"]`)
        ) {
          return;
        }
        if (
          openFile &&
          t.closest(`[data-file-id="${CSS.escape(openFile)}"]`)
        ) {
          return;
        }
      }
      hostMenuPeerId = null;
      fileMenuId = null;
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
    const label = playerDisplayName(goAuth.profile?.label, "");
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

  /** Hold layout while the chat composer is focused (virtual keyboard resize). */
  function lockShellModeForComposer() {
    shellModeLocked = shellModeLive;
  }

  function unlockShellModeForComposer() {
    shellModeLocked = null;
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
    if (isOperator) {
      const err = await goRoomFiles.downloadRemote(id);
      if (err) fileError = err;
      return;
    }
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
    if (isOperator) {
      if (onOperatorToggleCamera) await onOperatorToggleCamera();
      return;
    }
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
    if (isOperator) {
      if (onOperatorToggleMic) await onOperatorToggleMic();
      return;
    }
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
    if (isOperator) {
      if (!operatorCanDirect) {
        mediaError = "家裡主持使用中，無法遠端切台";
        return;
      }
      try {
        await onOperatorCastFile?.(id);
      } catch (e) {
        mediaError = e instanceof Error ? e.message : String(e);
      }
      return;
    }
    const out = await goRoomMedia.startListedProgram(id);
    if (!out.ok) mediaError = out.error;
  }

  async function onPutPrivateOnTv(id: string) {
    mediaError = "";
    if (isOperator) {
      if (!operatorCanDirect) {
        mediaError = "家裡主持使用中，無法遠端切台";
        return;
      }
      try {
        await onOperatorCastFile?.(id, "private");
      } catch (e) {
        mediaError = e instanceof Error ? e.message : String(e);
      }
      return;
    }
    const out = await goRoomMedia.startPrivateProgram(id);
    if (!out.ok) mediaError = out.error;
  }

  async function onMountPrivateToShare(id: string) {
    fileError = "";
    if (isOperator) {
      const err = await goRoomPrivateFiles.mountToShare(id);
      if (err) {
        fileError = err;
        return;
      }
      fileZone = "share";
      return;
    }
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
    if (isOperator) {
      if (!operatorCanDirect) {
        mediaError = "家裡主持使用中，無法遠端切台";
        return;
      }
      try {
        await onCastLive?.(peerId, name);
      } catch (e) {
        mediaError = e instanceof Error ? e.message : String(e);
      }
      return;
    }
    const out = await goRoomMedia.putLiveOnTv(peerId, name);
    if (!out.ok) mediaError = out.error;
  }

  async function onHostMemberAction(
    card: (typeof memberCards)[number],
    action: RoomHostMenuAction | "putOnTv" | "startRecord" | "stopRecord"
  ) {
    hostMenuPeerId = null;
    const peerId = card.mine
      ? isOperator
        ? (operatorLocalPeerId?.trim() || card.peerId)
        : "local"
      : card.peerId;
    mediaError = "";
    if (action === "putOnTv") {
      await onPutLiveOnTv(peerId, card.name);
      return;
    }
    if (action === "startRecord" || action === "stopRecord") {
      if (isOperator) {
        if (!operatorCanDirect) {
          mediaError = "家裡主持使用中，無法遠端操作";
          return;
        }
        try {
          if (action === "stopRecord") {
            await onOperatorStopRecord?.(peerId);
          } else {
            await onOperatorStartRecord?.(peerId, card.name);
          }
        } catch (e) {
          mediaError = e instanceof Error ? e.message : String(e);
        }
        return;
      }
      const out =
        action === "stopRecord"
          ? await goRoomMedia.stopRecording(peerId)
          : await goRoomMedia.startRecording(peerId, card.name);
      if (!out.ok) mediaError = out.error;
      return;
    }
    if (isOperator) {
      if (action === "kick" && !card.mine) {
        kickTarget = { peerId: card.peerId, name: card.name };
        return;
      }
      if (!operatorCanDirect) {
        mediaError = "家裡主持使用中，無法遠端操作";
        return;
      }
      if (action === "forceMute") {
        try {
          await onOperatorHaltLive?.(card.peerId, "audio");
        } catch (e) {
          mediaError = e instanceof Error ? e.message : String(e);
        }
        return;
      }
      if (action === "forceCameraOff") {
        try {
          await onOperatorHaltLive?.(card.peerId, "video");
        } catch (e) {
          mediaError = e instanceof Error ? e.message : String(e);
        }
        return;
      }
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
    if (isOperator) {
      if (!operatorCanDirect) {
        mediaError = "家裡主持使用中，無法遠端切台";
        return;
      }
      try {
        await onOperatorStopTv?.();
      } catch (e) {
        mediaError = e instanceof Error ? e.message : String(e);
      }
      return;
    }
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
    if (isOperator) {
      void goRoomFiles.unshareRemote(id).then((err) => {
        if (err) fileError = err;
      });
    } else {
      goRoomFiles.unshare(id, { host: isHostLike && !isOperator });
    }
    if (previewId === id) closePreview();
  }

  async function onUnshare(id: string) {
    askDeleteFile(id);
  }

  function askRevokeInvite() {
    inviteRevokePending = true;
  }

  function confirmRevokeInviteNow() {
    inviteRevokePending = false;
    onRevokeInvite?.();
  }

  function dismissConfirm() {
    confirmEnd = false;
    kickTarget = null;
    deleteFileId = null;
    privatePendingDelete = null;
    inviteRevokePending = false;
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

  function dismissHostChecklist() {
    markRoomHostChecklistDismissed();
    hostChecklistDismissed = true;
  }

  function revealChromeFromCinema() {
    cinemaUserEnter = false;
    chromeSession.chromeHidden = false;
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
      castingFileId: goRoomMedia.castingFileId,
      programName: goRoomMedia.remoteProgramName || goRoomMedia.programName,
      liveOnTv: Boolean(goRoomMedia.tvSourcePeerId),
    });
  }

  function fileLiveBadgeFor(opts: {
    fileId: string;
    fileName: string;
    onAir: boolean;
  }): string | null {
    return roomFileLiveBadge({
      casting: goRoomMedia.castingFileId === opts.fileId,
      onAir: opts.onAir,
    });
  }

  function toggleFileMenu(id: string) {
    hostMenuPeerId = null;
    fileMenuId = fileMenuId === id ? null : id;
  }

  function shareFileMeta(f: (typeof files)[number]): string {
    const transferHint = catalogTransferHint({
      status: f.status,
      playing: goRoomFiles.playback?.id === f.id,
    });
    const bits = [formatSize(f.size)];
    if (transferHint) bits.push(`${transferHint} ${formatSize(f.received)}`);
    else if (f.status === "error") bits.push(f.error || "失敗");
    return bits.join(" · ");
  }

  function onShareFileAction(id: string, action: RoomFileMenuAction) {
    fileMenuId = null;
    if (action === "preview") {
      void onPlayFile(id);
      return;
    }
    if (action === "download") {
      if (downloadSlotMode(files.find((f) => f.id === id)?.status, id) === "cancel") {
        onCancelDownload(id);
        return;
      }
      void onDownload(id);
      return;
    }
    if (action === "cast") {
      void onPutOnTv(id);
      return;
    }
    if (action === "remove") {
      void onUnshare(id);
    }
  }

  function onPrivateFileAction(id: string, action: RoomFileMenuAction) {
    fileMenuId = null;
    if (action === "cast") {
      void onPutPrivateOnTv(id);
      return;
    }
    if (action === "mount") {
      void onMountPrivateToShare(id);
      return;
    }
    if (action === "download") {
      fileError = "";
      void goRoomPrivateFiles.downloadRemote(id).then((err) => {
        if (err) fileError = err;
      });
      return;
    }
    if (action === "remove") {
      privatePendingDelete = id;
    }
  }
</script>

<div
  class={[
    "room",
    `room--${shellMode}`,
    hideChrome && "room--chrome-overlay",
    cinema && "room--cinema",
    inBooth && "room--in-booth",
  ]
    .filter(Boolean)
    .join(" ")}
  bind:this={roomEl}
>
  <h1 class="sr-only">包廂</h1>
  {#if statusLabel && !statusLineVisible && !tvStatusGate}
    <p class="sr-only" role="status">{statusLabel}</p>
  {/if}

  <div class="room-tv-col">
    <div class="room-tv-stage">
      <GoRoomTvSlot
        {tvOn}
        idleSnow={tvIdleSnow}
        {tvStream}
        hudOpen={tvHudOpen}
        hudKind={tvHudKind}
        isHost={isHostLike}
        slotFullscreen={tvSlotFullscreen}
        restore={roomTvHudRestore({
          slotFullscreen: tvSlotFullscreen,
          cinema,
        })}
        paused={programPaused}
        currentTime={programTime}
        duration={programDuration}
        ownerDecodeKind={goRoomMedia.ownerDecodeKind}
        remoteProgramKind={goRoomMedia.remoteProgramKind}
        {playCanvasUrl}
        {playCanvasSrcdoc}
        {playCanvasGeneration}
        bind:videoEl={tvVideoEl}
        bind:slotEl={tvSlotEl}
        onToggle={onTvHit}
        onPlayPause={() => {
          if (isOperator) {
            if (!operatorCanDirect) return;
            onOperatorCastState?.({
              paused: !programPaused,
              t: programTime,
            });
            return;
          }
          if (programPaused) goRoomMedia.playProgram();
          else goRoomMedia.pauseProgram();
        }}
        onSeek={(seconds) => {
          if (isOperator) {
            if (!operatorCanDirect) return;
            onOperatorCastState?.({ paused: programPaused, t: seconds });
            return;
          }
          goRoomMedia.seekProgram(seconds);
        }}
        onFullscreen={() => void onTvFullscreen()}
        onPower={() => void onStopTv()}
        floats={stageFloats}
        caption={tvCaption && tvCaption.until > Date.now() ? tvCaption.text : null}
      />
      {#if cinemaPeekToast}
        <p
          class={[
            "room-cinema-peek-toast",
            cinemaPeekFading && "room-cinema-peek-toast--out",
          ]
            .filter(Boolean)
            .join(" ")}
          role="status"
        >
          {GO_ROOM_CINEMA_PEEK_HINT}
        </p>
      {/if}
      {#if cinema}
        <button
          type="button"
          class="room-cinema-peek-edge"
          aria-label="顯示控制面板"
          onclick={() => revealChromeFromCinema()}
        ></button>
      {/if}
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
      {:else if tvStatusGate}
        <div
          class={[
            "room-tv-gate",
            phase === "connecting" && "room-tv-gate--connecting",
          ]
            .filter(Boolean)
            .join(" ")}
          role="region"
          aria-labelledby="room-status-gate-title"
        >
          {#if phase === "connecting"}
            <p id="room-status-gate-title" class="room-tv-gate-title pixel-text">
              {message || GO_ROOM_CONNECTING_TITLE}
            </p>
            <p class="room-tv-gate-body">{GO_ROOM_CONNECTING_BODY}</p>
          {:else if phase === "error"}
            <p id="room-status-gate-title" class="room-tv-gate-title pixel-text err">
              {error || "無法開始"}
            </p>
            {#if isHostLike}
              <button
                type="button"
                class="pixel-btn pixel-btn--primary room-tv-gate-btn"
                onclick={() => onInvite?.()}
              >
                再試一次
              </button>
            {/if}
          {:else}
            <p id="room-status-gate-title" class="room-tv-gate-title pixel-text">
              {message || "這一間已結束"}
            </p>
            <div class="room-tv-gate-actions">
              {#if isHostLike && loggedIn && !isOperator}
                <button
                  type="button"
                  class="pixel-btn pixel-btn--primary room-tv-gate-btn"
                  onclick={() => onReissue?.()}
                >
                  再開一間
                </button>
              {/if}
              <a class="pixel-btn room-tv-gate-btn" href="/">回遊樂場大廳</a>
            </div>
          {/if}
        </div>
      {:else if playLoadProgress}
        <div
          class="room-tv-gate room-tv-gate--play-load"
          role="status"
          aria-labelledby="room-play-load-title"
        >
          <p id="room-play-load-title" class="room-tv-gate-title pixel-text">
            準備遊戲
          </p>
          <GoSamLoadBar progress={playLoadProgress} label="遊戲更新進度" />
        </div>
      {:else if showAd}
        <div class="room-ad">
          <GoAdSlot onNavigate={onAdNavigate} />
        </div>
      {/if}
    </div>
    {#if statusLabel && statusLineVisible}
      <p
        class={[
          "room-status",
          tvOn && "room-status--on-air",
          statusOccupied && "room-status--occupied",
        ]
          .filter(Boolean)
          .join(" ")}
        role="status"
      >
        {#if statusOccupied}
          <span class="room-status-dot" aria-hidden="true"></span>
        {/if}
        <span class="room-status-text">{statusLabel}</span>
      </p>
    {/if}
  </div>

  {#if inBooth}
    {#if cinemaHud}
    <div class="room-lower">
    <nav class="room-dock" aria-label="包廂操作">
      <div class="room-dock-group" role="group" aria-label="媒體與顯示">
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
        class={[
          "pixel-btn",
          "room-dock-btn",
          (isOperator ? operatorLocalMic : goRoomMedia.mic) && "pixel-btn--primary",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={(isOperator ? operatorLocalMic : goRoomMedia.mic) ? "關麥克風" : "開麥克風"}
        aria-pressed={isOperator ? operatorLocalMic : goRoomMedia.mic}
        title={(isOperator ? operatorLocalMic : goRoomMedia.mic) ? "關麥克風" : "開麥克風"}
        onclick={() => void onToggleMic()}
      >
        <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
          {#if isOperator ? operatorLocalMic : goRoomMedia.mic}
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
        class={[
          "pixel-btn",
          "room-dock-btn",
          (isOperator ? operatorLocalCamera : goRoomMedia.camera) && "pixel-btn--primary",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={(isOperator ? operatorLocalCamera : goRoomMedia.camera) ? "關鏡頭" : "開鏡頭"}
        aria-pressed={isOperator ? operatorLocalCamera : goRoomMedia.camera}
        title={(isOperator ? operatorLocalCamera : goRoomMedia.camera) ? "關鏡頭" : "開鏡頭"}
        onclick={() => void onToggleCamera()}
      >
        <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
          {#if isOperator ? operatorLocalCamera : goRoomMedia.camera}
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
      {#if !isOperator && canShareDisplay()}
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
      {#if isHostLike && tvOn}
        <button
          type="button"
          class="pixel-btn room-dock-btn"
          aria-label={GO_ROOM_TV_OFF_BTN}
          title={GO_ROOM_TV_OFF_BTN}
          disabled={operatorWriteLocked}
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
      </div>
      <div class="room-dock-group room-dock-group--end" role="group" aria-label="設定與離開">
      {#if isHostLike}
        <button
          type="button"
          class={["pixel-btn", "room-dock-btn", roomSettingsOpen && "pixel-btn--primary"]
            .filter(Boolean)
            .join(" ")}
          aria-label="包廂設定"
          aria-expanded={roomSettingsOpen}
          title="包廂設定"
          onclick={() => (roomSettingsOpen = true)}
        >
          <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
            />
          </svg>
        </button>
      {/if}
      <button
        type="button"
        class="pixel-btn pixel-btn--danger-outline room-dock-btn room-dock-btn--leave"
        aria-label={isHostLike ? "結束" : "離開"}
        title={isHostLike ? "結束" : "離開"}
        onclick={() => askEnd()}
      >
        <svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
      </div>
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
              class={["room-tab-btn", paneTabOn("members") && "room-tab-btn--on"].filter(Boolean).join(" ")}
              aria-pressed={paneTabOn("members")}
              onclick={() => onPaneTab("members")}
            >
              成員
            </button>
          {/if}
          {#if tabPanes.includes("files")}
            <button
              type="button"
              class={["room-tab-btn", paneTabOn("files") && "room-tab-btn--on"].filter(Boolean).join(" ")}
              aria-pressed={paneTabOn("files")}
              onclick={() => onPaneTab("files")}
            >
              檔案
            </button>
          {/if}
          {#if tabPanes.includes("chat")}
            <button
              type="button"
              class={["room-tab-btn", paneTabOn("chat") && "room-tab-btn--on"].filter(Boolean).join(" ")}
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
          {#if isHostLike}
            <div class="door-row">
              <p class="muted door-row-label">{doorRow.label}</p>
              <button
                type="button"
                class="pixel-btn pixel-btn--primary door-row-action"
                onclick={() => inviteInBooth()}
                disabled={operatorWriteLocked}
              >
                {doorRow.action}
              </button>
              {#if door === "live" && onRevokeInvite}
                <button
                  type="button"
                  class="pixel-btn door-row-action"
                  onclick={() => askRevokeInvite()}
                  disabled={operatorWriteLocked}
                >
                  {GO_ROOM_INVITE_REVOKE}
                </button>
              {/if}
            </div>
            {#if playLoadProgress}
              <div class="door-row">
                <p class="muted door-row-label">{playLoadProgress.detail}</p>
              </div>
            {:else if playCatalogId}
              <div class="door-row">
                <p class="muted door-row-label">正在玩遊戲</p>
                <button
                  type="button"
                  class="pixel-btn door-row-action"
                  disabled={operatorWriteLocked}
                  onclick={() => void onEndPlay?.()}
                >
                  結束這一局
                </button>
              </div>
            {:else if phase === "open"}
              <div class="door-row">
                <p class="muted door-row-label">大螢幕上開一局</p>
                <button
                  type="button"
                  class="pixel-btn pixel-btn--primary door-row-action"
                  disabled={operatorWriteLocked}
                  onclick={() => (playPickerOpen = true)}
                >
                  玩遊戲
                </button>
              </div>
            {/if}
          {/if}
          {#if showHostChecklist}
            <div class="room-host-checklist" role="note" aria-label="開始使用包廂">
              <div class="room-host-checklist-head">
                <p class="room-host-checklist-title">可以這樣開始</p>
                <button
                  type="button"
                  class="pixel-btn room-host-checklist-dismiss"
                  onclick={() => dismissHostChecklist()}
                >
                  知道了
                </button>
              </div>
              <ol class="room-host-checklist-steps">
                {#each hostChecklistPending as step (step)}
                  <li>{GO_ROOM_HOST_CHECKLIST_LABELS[step]}</li>
                {/each}
              </ol>
            </div>
          {/if}
          {#if showTvHint}
            <p class="muted room-tv-hint">{roomTvHintCopy(role)}</p>
          {/if}
          <ul class="member-list">
            {#each memberCards as card (card.peerId)}
              <li>
                <GoRoomMemberCard
                  {card}
                  selected={selectedPeerId === card.peerId}
                  putOnTv={
                    isHostLike && (!isOperator || operatorCanDirect)
                      ? roomHostMemberPutOnTv({
                          liveAudio: card.micOn,
                          liveVideo: card.cameraOn,
                          onAir: card.onAir,
                        })
                      : null
                  }
                  record={
                    isHostLike && (!isOperator || operatorCanDirect)
                      ? roomHostMemberRecord({
                          liveVideo: card.cameraOn,
                          recording: card.recording,
                        })
                      : null
                  }
                  hostMenu={
                    isHostLike && (!isOperator || operatorCanDirect)
                      ? roomHostMemberMenu({
                          mine: card.mine && !isOperator,
                          liveAudio: card.micOn,
                          liveVideo: card.cameraOn,
                          onAir: card.onAir,
                        })
                      : undefined}
                  hostMenuOpen={hostMenuPeerId === card.peerId}
                  onclick={() =>
                    (selectedPeerId =
                      selectedPeerId === card.peerId ? null : card.peerId)}
                  onHostMenuToggle={() => {
                    fileMenuId = null;
                    hostMenuPeerId =
                      hostMenuPeerId === card.peerId ? null : card.peerId;
                  }}
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
                {#if isHostLike}
                  <p class="muted">
                    {#if selectedPerson.liveVideo || selectedPerson.liveAudio}
                      放到大螢幕上、開始錄影在成員卡上；其餘在更多。
                    {:else}
                      主持操作在卡片旁的更多。
                    {/if}
                  </p>
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
          {#if mediaError}
            <p class="err" role="alert">{mediaError}</p>
          {/if}
          {#if goRoomMedia.error && goRoomMedia.error !== mediaError}
            <p class="err" role="alert">{goRoomMedia.error}</p>
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
                {@const onAir = roomFileOnAir({
                  fileId: f.id,
                  fileName: f.name,
                  streamingFileId: goRoomMedia.streamingFileId,
                  castingFileId: goRoomMedia.castingFileId,
                  programName: goRoomMedia.programName,
                  liveOnTv: Boolean(goRoomMedia.tvSourcePeerId),
                })}
                {@const liveBadge = fileLiveBadgeFor({
                  fileId: f.id,
                  fileName: f.name,
                  onAir,
                })}
                <li>
                  <GoRoomFileCard
                    fileId={f.id}
                    name={f.name}
                    {kind}
                    meta={`${formatSize(f.size)} · ${isOperator ? "包廂" : "僅這台"}`}
                    castHint={roomFileTvCastSourceHint({
                      kind,
                      mine: true,
                      nativeHtmlMediaCaptureStream: nativeFileCapture,
                    })}
                    {onAir}
                    {liveBadge}
                    menu={roomFilePrivateMenu({ kind, remoteHub: isOperator })}
                    menuOpen={fileMenuId === f.id}
                    onMenuToggle={() => toggleFileMenu(f.id)}
                    onAction={(action) => onPrivateFileAction(f.id, action)}
                  />
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
                {@const owner = fileOwnerCard(f)}
                {@const onAir = fileOnAir(f)}
                {@const liveBadge = fileLiveBadgeFor({
                  fileId: f.id,
                  fileName: f.name,
                  onAir,
                })}
                <li>
                  <GoRoomFileCard
                    fileId={f.id}
                    name={f.path || f.name}
                    {kind}
                    meta={shareFileMeta(f)}
                    castHint={roomFileTvCastSourceHint({
                      kind,
                      mine: f.mine,
                      nativeHtmlMediaCaptureStream: nativeFileCapture,
                    })}
                    {onAir}
                    {liveBadge}
                    owner={{
                      name: f.mine ? "我" : f.ownerName,
                      avatarUrl: owner?.avatarUrl,
                      avatarInitial:
                        owner?.avatarInitial ??
                        (f.mine ? "我" : f.ownerName.slice(0, 1) || "?"),
                    }}
                    menu={roomFileShareMenu({
                      role: isOperator ? "host" : role,
                      mine: isOperator ? true : f.mine,
                      kind,
                      previewLabel: roomFileShareOpenLabel(kind),
                      previewEnabled: !(
                        f.status === "transferring" &&
                        goRoomFiles.playback?.id !== f.id
                      ),
                      downloadLabel: downloadButtonLabel(f.id, f.status),
                      downloadEnabled: !downloadButtonDisabled(f.status, f.id),
                    })}
                    menuOpen={fileMenuId === f.id}
                    onMenuToggle={() => toggleFileMenu(f.id)}
                    onAction={(action) => onShareFileAction(f.id, action)}
                  />
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
                      {#if isHostLike}
                        <button
                          type="button"
                          class="pixel-btn"
                          disabled={operatorWriteLocked}
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
                          disabled={operatorWriteLocked}
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
              {#if isHostLike}
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
                  disabled={operatorWriteLocked}
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
                onfocus={lockShellModeForComposer}
                onblur={unlockShellModeForComposer}
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
        {:else if inviteRevokePending}
          {GO_ROOM_INVITE_REVOKE}？
        {:else if deleteFileId}
          {GO_ROOM_FILE_DELETE}？
        {:else if pendingAdHref}
          {isHostLike ? "結束這一間並打開小品？" : "離開這一間並打開小品？"}
        {:else}
          {isHostLike ? "結束這一間？" : "離開這一間？"}
        {/if}
      </h2>
      <p class="confirm-body">
        {#if kickTarget}
          {GO_ROOM_KICK_CONFIRM}
        {:else if privatePendingDelete}
          {GO_ROOM_PRIVATE_DELETE_CONFIRM}
        {:else if inviteRevokePending}
          {GO_ROOM_INVITE_REVOKE_CONFIRM}
        {:else if deleteFileId}
          {GO_ROOM_FILE_DELETE_CONFIRM}
        {:else}
          {isHostLike ? GO_ROOM_END_CONFIRM_HOST : GO_ROOM_LEAVE_CONFIRM_GUEST}
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
        {:else if inviteRevokePending}
          <button
            type="button"
            class="pixel-btn pixel-btn--danger"
            onclick={() => confirmRevokeInviteNow()}
          >
            {GO_ROOM_INVITE_REVOKE}
          </button>
        {:else if deleteFileId}
          <button type="button" class="pixel-btn pixel-btn--danger" onclick={() => confirmDeleteFile()}>
            {GO_ROOM_FILE_DELETE}
          </button>
        {:else}
          <button type="button" class="pixel-btn pixel-btn--danger" onclick={() => void confirmEndNow()}>
            {isHostLike ? "結束" : "離開"}
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

  {#if isHostLike}
  <GoRoomSettingsPanel
    bind:open={roomSettingsOpen}
    bind:tvSnowEnabled
    bind:remoteAnchorEnabled
    showRemoteAnchor={!isOperator}
    onRemoteAnchorChange={(enabled) => void onRemoteAnchorChange?.(enabled)}
  />
  {/if}

  {#if isHostLike}
  <GoRoomPlayPicker
    bind:open={playPickerOpen}
    games={playableGames}
    occupants={playPickerOccupants}
    onAutoStart={async (catalogId) => {
      const out = await onStartPlay?.(catalogId);
      if (!out) return { ok: true as const };
      if (out.ok) return { ok: true as const };
      return {
        ok: false as const,
        reason: out.reason,
        ...(out.missingRoles ? { missingRoles: out.missingRoles } : {}),
      };
    }}
    onManualStart={async (catalogId, picks) => {
      if (!onStartManualPlay) {
        return { ok: false as const, reason: "not_playable" };
      }
      const out = await onStartManualPlay(catalogId, picks);
      if (!out) return { ok: false as const, reason: "not_playable" };
      if (out.ok) return { ok: true as const };
      return {
        ok: false as const,
        reason: out.reason,
        ...(out.missingRoles ? { missingRoles: out.missingRoles } : {}),
      };
    }}
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
  .room--in-booth {
    position: relative;
    isolation: isolate;
  }
  .room--in-booth::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(
        ellipse 90% 50% at 50% -5%,
        color-mix(in oklab, rgb(var(--gold)) 10%, transparent),
        transparent 58%
      ),
      radial-gradient(
        ellipse 120% 75% at 50% 105%,
        color-mix(in oklab, #000 14%, transparent),
        transparent 52%
      );
  }
  html[data-theme="dark"] .room--in-booth::before {
    background:
      radial-gradient(
        ellipse 75% 42% at 50% -8%,
        color-mix(in oklab, rgb(var(--accent)) 12%, transparent),
        transparent 55%
      ),
      radial-gradient(
        ellipse 110% 68% at 50% 108%,
        color-mix(in oklab, #000 38%, transparent),
        transparent 58%
      );
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
    border-color: color-mix(in oklab, #f4efe4 32%, transparent);
    background: color-mix(in oklab, #000 58%, transparent);
  }
  .room--cinema .room-status--on-air {
    border-color: color-mix(in oklab, rgb(var(--gold-soft)) 55%, transparent);
    background: color-mix(in oklab, #000 62%, rgb(var(--gold)) 12%);
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
    overflow: hidden;
  }
  .room-tv-gate--connecting::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: -40%;
    height: 35%;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in oklab, rgb(var(--accent)) 32%, transparent) 48%,
      transparent 100%
    );
    animation: room-gate-scan 2s ease-in-out infinite;
  }
  @keyframes room-gate-scan {
    0% {
      transform: translateY(0);
      opacity: 0.35;
    }
    50% {
      transform: translateY(320%);
      opacity: 0.75;
    }
    100% {
      transform: translateY(640%);
      opacity: 0.35;
    }
  }
  .room-tv-gate-title {
    margin: 0;
    font-size: 1.1rem;
    color: #f4efe4;
  }
  .room-tv-gate-body {
    margin: 0;
    line-height: 1.45;
    font-size: 0.92rem;
    max-width: 22rem;
  }
  .room-tv-gate-btn {
    min-height: 44px;
    align-self: stretch;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    box-sizing: border-box;
  }
  .room-tv-gate-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-self: stretch;
  }
  .room-tv-gate .err {
    color: #ffb4b8;
  }
  .room-tv-gate-hint {
    margin: 0;
    color: color-mix(in oklab, #f4efe4 88%, transparent);
  }
  .room-tv-gate--play-load {
    gap: 0.75rem;
  }
  .room-tv-gate--play-load :global(.go-load-bar) {
    width: min(100%, 18rem);
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
    .room-tv-gate-actions {
      align-items: center;
      max-width: 28rem;
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
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin: 0.35rem 0 0;
    padding: 0.28rem 0.6rem;
    max-width: 100%;
    border: 2px solid color-mix(in oklab, rgb(var(--ink)) 20%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, rgb(var(--card)) 88%, transparent);
    font-size: 0.82rem;
    line-height: 1.35;
    color: color-mix(in oklab, rgb(var(--ink)) 78%, transparent);
    box-sizing: border-box;
  }
  .room-status--on-air {
    border-color: color-mix(in oklab, rgb(var(--gold)) 58%, rgb(var(--ink)));
    background: color-mix(in oklab, rgb(var(--gold-soft)) 24%, rgb(var(--card)));
    color: rgb(var(--ink));
  }
  .room-status-dot {
    flex: 0 0 auto;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: rgb(var(--accent));
    box-shadow: 0 0 0 2px color-mix(in oklab, rgb(var(--accent)) 32%, transparent);
    animation: room-status-pulse 2.2s ease-in-out infinite;
  }
  .room-status-text {
    min-width: 0;
  }
  @keyframes room-status-pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.15);
      opacity: 0.82;
    }
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
  .room-tv-hint {
    margin: 0 0 0.55rem;
    line-height: 1.45;
    font-size: 0.88rem;
  }
  .room-host-checklist {
    margin: 0 0 0.55rem;
    padding: 0.55rem 0.65rem;
    border: var(--pixel-edge) solid color-mix(in oklab, rgb(var(--ink)) 28%, transparent);
    border-radius: var(--radius);
    background: color-mix(in oklab, rgb(var(--card)) 92%, rgb(var(--gold-soft)) 8%);
    box-shadow: var(--pixel-shadow);
    line-height: 1.45;
    font-size: 0.88rem;
  }
  .room-host-checklist-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.45rem;
    margin-bottom: 0.35rem;
  }
  .room-host-checklist-title {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .room-host-checklist-dismiss {
    min-height: 44px;
    flex: 0 0 auto;
    padding: 0.35rem 0.65rem;
    font-size: 0.82rem;
  }
  .room-host-checklist-steps {
    margin: 0;
    padding-left: 1.15rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .room-host-checklist-steps li {
    padding-left: 0.1rem;
  }
  .room-cinema-peek-toast {
    position: absolute;
    left: 50%;
    top: 0.65rem;
    z-index: 8;
    margin: 0;
    padding: 0.45rem 0.7rem;
    max-width: calc(100% - 1.2rem);
    transform: translateX(-50%);
    border-radius: 0.35rem;
    background: color-mix(in oklab, #000 72%, transparent);
    color: #f4efe4;
    font-size: 0.85rem;
    line-height: 1.35;
    text-align: center;
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.35s ease;
  }
  .room-cinema-peek-toast--out {
    opacity: 0;
  }
  .room-cinema-peek-edge {
    position: absolute;
    left: 50%;
    top: 0;
    z-index: 7;
    width: 3.5rem;
    height: 44px;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    transform: translateX(-50%);
    cursor: pointer;
  }
  .room-cinema-peek-edge::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 0.45rem;
    width: 2.75rem;
    height: 0.32rem;
    border-radius: 999px;
    transform: translateX(-50%);
    background: color-mix(in oklab, #f4efe4 78%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in oklab, #000 55%, transparent),
      0 1px 6px color-mix(in oklab, #000 40%, transparent);
  }
  .room-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    padding: 0.2rem;
    border: var(--pixel-edge) solid color-mix(in oklab, rgb(var(--ink)) 16%, transparent);
    border-radius: var(--radius);
    background: color-mix(in oklab, rgb(var(--fill)) 65%, rgb(var(--card)));
  }
  .room-tab-btn {
    flex: 1 1 auto;
    min-height: 44px;
    margin: 0;
    padding: 0.35rem 0.55rem;
    border: none;
    border-bottom: 3px solid transparent;
    border-radius: calc(var(--radius) - 1px);
    background: transparent;
    color: color-mix(in oklab, rgb(var(--ink)) 78%, transparent);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }
  .room-tab-btn--on {
    border-bottom-color: rgb(var(--accent));
    background: color-mix(in oklab, rgb(var(--accent)) 14%, transparent);
    color: rgb(var(--ink));
    font-weight: 700;
  }
  .room-tab-btn:focus-visible {
    outline: 2px solid rgb(var(--accent));
    outline-offset: 2px;
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
    gap: 0.1rem;
  }
  .room--portrait .room-tab-btn {
    padding-left: 0.45rem;
    padding-right: 0.45rem;
    font-size: 0.86rem;
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
    align-items: center;
    gap: 0.35rem;
    flex: 0 0 auto;
    padding: 0.35rem 0.45rem;
    border: var(--pixel-edge) solid color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
    border-radius: var(--radius);
    background: color-mix(in oklab, rgb(var(--card)) 90%, transparent);
    box-shadow: var(--pixel-inset);
  }
  .room-dock-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }
  .room-dock-group--end {
    margin-left: auto;
  }
  .room-dock-btn {
    min-height: 44px;
    min-width: 44px;
    width: 44px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.12s ease;
  }
  .room-dock-btn:active:not(:disabled) {
    transform: scale(0.96);
  }
  .room-dock-btn.pixel-btn--primary {
    box-shadow:
      var(--pixel-shadow),
      0 0 0 2px color-mix(in oklab, rgb(var(--accent)) 28%, transparent);
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
  .muted {
    color: color-mix(in oklab, rgb(var(--ink)) 72%, transparent);
    font-size: 0.88rem;
  }
  .err {
    color: rgb(180 35 45);
    margin: 0 0 0.5rem;
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
    margin: 0.35rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .file-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.15rem 0 0.45rem;
  }
  .room--portrait:not(.room--cinema) .file-filters,
  .room--portrait:not(.room--cinema) .file-filters-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
  }
  @media (min-width: 64rem) {
    .room--portrait:not(.room--cinema) .file-filters,
    .room--portrait:not(.room--cinema) .file-filters-row {
      flex-wrap: wrap;
      overflow-x: visible;
    }
  }
  .room--portrait:not(.room--cinema) .file-filter,
  .room--portrait:not(.room--cinema) .file-filter-radio {
    flex: 0 0 auto;
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
  @media (min-width: 64rem) {
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
    .room--desktop:not(.room--cinema) .room-lower {
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
    .room--desktop:not(.room--cinema) .room-dock {
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
  /* Wide hall (≥1440px): control panel splits files | members/chat. */
  @media (min-width: 90rem) {
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
      /* Match .room-tabs top inset so 私有／分享 line up with 成員／聊天. */
      padding-top: 0.25rem;
      padding-right: 0.45rem;
    }
    .room--desktop .room-pane--files > .file-filters:first-child,
    .room--desktop .room-pane--files > .file-filters--kind:first-child {
      margin-top: 0;
    }
    .room--desktop .room-tabs {
      padding-left: 0.45rem;
    }
    .room--desktop .room-pane--members,
    .room--desktop .room-pane--chat {
      padding-left: 0.45rem;
    }
  }
  /* Landscape side-rail: class from roomShellMode (§5.8), not height-only MQ. */
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
  .room--short-landscape:not(.room--cinema) .room-lower {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    background: rgb(var(--card));
    border-left: var(--pixel-edge) solid rgb(var(--ink));
    padding: 0.3rem 0.4rem calc(0.3rem + env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
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
  @media (min-width: 40rem) {
    .confirm-actions {
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
  @media (prefers-reduced-motion: reduce) {
    .room-status-dot,
    .room-tv-gate--connecting::after {
      animation: none;
    }
    .room-dock-btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>

