/** Shared 包廂 copy and chat hints (Host＋Guest). */

import { SESSION_CHAT_HOST_DISPLAY_NAME } from "@pg/roster/rosterSessionChat";

export const GO_ROOM_SHARE_TITLE = "邀請你進包廂";
export const GO_ROOM_SHARE_HINT =
  "這張邀請約 5 分鐘內有效；過期後再發一張即可，這一間不會因此關掉。請對方用相機掃碼進來。另一台裝置請掃這張邀請進來，不要再開一間包廂。";

export const GO_ROOM_QUICK_REPLIES = ["在嗎", "等一下", "收到", "謝謝"] as const;
export const GO_ROOM_TEXT_LOCK = "全員禁言";
export const GO_ROOM_TEXT_UNLOCK = "解除全員禁言";
export const GO_ROOM_TEXT_SILENCE = "暫時禁言";
export const GO_ROOM_TEXT_UNSILENCE = "解除禁言";
export const GO_ROOM_TEXT_DELETE = "刪除訊息";
export const GO_ROOM_TEXT_CAPTION = "推播至大電視";
export const GO_ROOM_TEXT_LOCKED_HINT = "僅主持人可發言";
export const GO_ROOM_TEXT_SILENCED_HINT = "你已被暫時禁言";

/** Right overlay width in rem. Always overlay; never in-flow. */
export const ROOM_CHAT_PANEL_REM = 22;
/** Leave a sliver of the page visible beside a covering overlay. */
export const ROOM_CHAT_PANEL_GUTTER_REM = 2.75;

/** Phone landscape: height is the scarce axis. Keep in sync with CSS max-height. */
export const ROOM_SHORT_LANDSCAPE_MAX_HEIGHT_PX = 560;
export const ROOM_SHORT_LANDSCAPE_MQ = `(orientation: landscape) and (max-height: ${ROOM_SHORT_LANDSCAPE_MAX_HEIGHT_PX}px)`;

/** 48rem — desktop TV + right rail. Keep in sync with CSS min-width. */
export const ROOM_SHELL_DESKTOP_MIN_PX = 768;
/** >1280px — wide control: files | members/chat. Keep in sync with CSS. */
export const ROOM_SHELL_WIDE_MIN_PX = 1281;

export type RoomShellMode =
  | "portrait"
  | "short-landscape"
  | "desktop";

export type RoomShellPane = "members" | "files" | "chat";

export type RoomUiPhase = "idle" | "open" | "ended" | "error" | "connecting" | "ready";

/** Stacked portrait chrome vs a short-landscape stage+rail. */
export function roomShortLandscape(opts: {
  widthPx: number;
  heightPx: number;
}): boolean {
  return opts.widthPx > opts.heightPx && opts.heightPx <= ROOM_SHORT_LANDSCAPE_MAX_HEIGHT_PX;
}

export function roomShellMode(opts: {
  widthPx: number;
  heightPx: number;
}): RoomShellMode {
  if (roomShortLandscape(opts)) return "short-landscape";
  if (opts.widthPx >= ROOM_SHELL_DESKTOP_MIN_PX) return "desktop";
  return "portrait";
}

/** Hall never shows members/files/chat as three concurrent columns. */
export function roomShellPanesConcurrent(
  _mode: RoomShellMode,
  _cinema = false
): boolean {
  return false;
}

/** Desktop hall: files stay on the rail; members/chat share the lower half. */
export function roomShellFilesPinned(
  mode: RoomShellMode,
  _cinema = false
): boolean {
  return mode === "desktop";
}

/** Tabs to render. Empty = all panes in flow. */
export function roomShellTabPanes(
  mode: RoomShellMode,
  _cinema = false
): RoomShellPane[] {
  if (mode === "desktop") return ["members", "chat"];
  return ["members", "files", "chat"];
}

export function roomShellShowPane(opts: {
  target: RoomShellPane;
  pane: RoomShellPane;
  concurrent: boolean;
  filesPinned: boolean;
}): boolean {
  if (opts.concurrent) return true;
  if (opts.filesPinned) {
    if (opts.target === "files") return true;
    const lower = opts.pane === "chat" ? "chat" : "members";
    return opts.target === lower;
  }
  return opts.pane === opts.target;
}

/** Lower-half tab while files are pinned; otherwise the selected pane. */
export function roomShellActiveTab(
  pane: RoomShellPane,
  filesPinned: boolean
): RoomShellPane {
  if (filesPinned) return pane === "chat" ? "chat" : "members";
  return pane;
}

export function roomShellDefaultPane(): RoomShellPane {
  return "members";
}

/**
 * Top-edge chrome peek is 44px full-width by default. Hall side-rails put
 * 成員／檔案／文字 under that strip — inset the peek so tabs stay tappable.
 */
export function roomChromePeekInsetEndPx(opts: {
  mode: RoomShellMode;
  cinema: boolean;
  viewportWidthPx: number;
  railLeftPx: number;
}): number {
  if (opts.cinema) return 0;
  if (opts.mode !== "short-landscape" && opts.mode !== "desktop") return 0;
  if (opts.railLeftPx <= 0) return 0;
  return Math.max(0, Math.round(opts.viewportWidthPx - opts.railLeftPx));
}

/** Overlay chrome auto-hide only on the live booth main surface. */
export function roomChromeHideable(opts: {
  role: "host" | "guest";
  phase: RoomUiPhase;
  loggedIn: boolean;
  inBooth: boolean;
}): boolean {
  if (!opts.inBooth) return false;
  if (
    opts.phase === "connecting" ||
    opts.phase === "error" ||
    opts.phase === "ended"
  ) {
    return false;
  }
  if (opts.role === "host" && !opts.loggedIn) return false;
  return true;
}

/** Pause chrome 3s hide while a sheet／overlay is in the way. Chat composer does not. */
export function roomChromeShouldHold(opts: {
  shareOpen?: boolean;
  confirmOpen?: boolean;
  /** Ignored: typing in 文字 must not reveal or pin the playground header. */
  composerFocused?: boolean;
  overlayOpen?: boolean;
  drawerOpen?: boolean;
}): boolean {
  return Boolean(
    opts.shareOpen ||
      opts.confirmOpen ||
      opts.overlayOpen ||
      opts.drawerOpen
  );
}

/** Theatre mode: user hid the control panel. Not auto-on when the TV plays. */
export function roomCinemaAllowed(opts: {
  inBooth: boolean;
  phase: RoomUiPhase;
}): boolean {
  if (!opts.inBooth) return false;
  return (
    opts.phase !== "connecting" &&
    opts.phase !== "error" &&
    opts.phase !== "ended"
  );
}

export function roomCinemaActive(opts: {
  allowed: boolean;
  userEnter: boolean;
}): boolean {
  return Boolean(opts.allowed && opts.userEnter);
}

export function roomCinemaToggleLabel(cinema: boolean): string {
  return cinema ? GO_ROOM_CINEMA_EXIT : GO_ROOM_CINEMA_ENTER;
}

/** Hall control panel is in-flow; cinema has no panel overlay. */
export function roomCinemaHudVisible(opts: { cinema: boolean }): boolean {
  return !opts.cinema;
}

/** Pull-down／peek／Esc revealing chrome leaves cinema for the hall. */
export function roomCinemaExitOnChromeReveal(opts: {
  cinema: boolean;
  chromeHidden: boolean;
}): boolean {
  return opts.cinema && !opts.chromeHidden;
}

/** House ad floats on the idle TV; hide once a program is streaming. */
export function roomShowAdSlot(opts: {
  inBooth?: boolean;
  tvOn?: boolean;
}): boolean {
  if (opts.inBooth === false) return false;
  return !opts.tvOn;
}

/**
 * Host login CTA on the TV slot. Wait until the client has run so prerender／
 * hydration do not flash「登入後開包廂」while sessionStorage rehydrates and
 * route chunks finish downloading.
 */
export function roomHostLoginGate(opts: {
  role: "host" | "guest";
  loggedIn: boolean;
  phase: RoomUiPhase;
  clientReady: boolean;
}): boolean {
  if (!opts.clientReady) return false;
  return opts.role === "host" && !opts.loggedIn && opts.phase === "idle";
}

export type RoomEscStep =
  | "close-share"
  | "close-preview"
  | "close-tv-hud"
  | "clear-peer"
  | "close-drawer"
  | "exit-cinema"
  | "confirm-end";

/** Esc: overlays first; cinema shrinks to hall; only then leave-confirm. */
export function roomEscStep(opts: {
  shareOpen?: boolean;
  previewOpen?: boolean;
  tvHudOpen?: boolean;
  selectedPeerId?: string | null;
  cinema?: boolean;
  drawerOpen?: boolean;
}): RoomEscStep {
  if (opts.shareOpen) return "close-share";
  if (opts.previewOpen) return "close-preview";
  if (opts.tvHudOpen) return "close-tv-hud";
  if (opts.selectedPeerId) return "clear-peer";
  if (opts.cinema && opts.drawerOpen) return "close-drawer";
  if (opts.cinema) return "exit-cinema";
  return "confirm-end";
}

export function roomInviteDoorRow(opts: {
  door: RoomInviteDoor;
  remainLabel?: string;
}): { label: string; action: string } {
  if (opts.door === "live") {
    const remain = opts.remainLabel?.trim();
    return {
      label: remain ? `邀請有效 · ${remain}` : "邀請有效",
      action: "顯示邀請",
    };
  }
  if (opts.door === "expired") {
    return { label: "邀請已過期", action: "再發一張" };
  }
  return { label: "還沒發邀請", action: "請人進來" };
}

export type RoomChatLayout = "drawer" | "sidebar";

export type RoomChatBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Chat is always a fixed overlay. Drawer = it covers the canvas. */
export function roomChatLayout(coversCanvas: boolean): RoomChatLayout {
  return coversCanvas ? "drawer" : "sidebar";
}

export function roomChatBoxesOverlap(a: RoomChatBox, b: RoomChatBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export function roomChatBoxHasSize(box: RoomChatBox): boolean {
  return box.right > box.left && box.bottom > box.top;
}

export function roomChatBoxFromRect(rect: {
  left: number;
  right: number;
  top: number;
  bottom: number;
}): RoomChatBox {
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
}

/** Right-edge overlay box before the panel is in the DOM. */
export function roomChatPredictedOverlayBox(opts: {
  viewportWidthPx: number;
  viewportHeightPx: number;
  chromeHeightPx: number;
  remPx?: number;
}): RoomChatBox {
  const rem = opts.remPx ?? 16;
  const width = Math.min(
    ROOM_CHAT_PANEL_REM * rem,
    Math.max(0, opts.viewportWidthPx - ROOM_CHAT_PANEL_GUTTER_REM * rem)
  );
  return {
    left: opts.viewportWidthPx - width,
    right: opts.viewportWidthPx,
    top: opts.chromeHeightPx,
    bottom: opts.viewportHeightPx,
  };
}

export function roomChatDismissesOnFocusLoss(coversCanvas: boolean): boolean {
  return coversCanvas;
}

export function roomChatShouldCloseOnFocusMove(opts: {
  coversCanvas: boolean;
  panelContainsNext: boolean;
  nextIsNull: boolean;
  /** Quick replies unmount the focused chip; that blur must not dismiss chat. */
  lostControlRemoved?: boolean;
}): boolean {
  if (!roomChatDismissesOnFocusLoss(opts.coversCanvas)) return false;
  if (opts.panelContainsNext) return false;
  if (opts.lostControlRemoved) return false;
  return true;
}

export function roomChatShouldCloseOnOutsidePress(opts: {
  coversCanvas: boolean;
  pressInsidePanel: boolean;
  pressOnToggle: boolean;
}): boolean {
  if (!roomChatDismissesOnFocusLoss(opts.coversCanvas)) return false;
  if (opts.pressInsidePanel || opts.pressOnToggle) return false;
  return true;
}

export const GO_ROOM_EMPTY_TIMELINE = "還沒有訊息。";

export const GO_ROOM_KEEP_OPEN = "這一間只在這個畫面開著的時候存在。";

export const GO_ROOM_GATE_BODY =
  "請人進來：即時視訊、共享檔案。被請進來的人不必有通行證。";

export const GO_ROOM_LOGIN_HINT =
  "被請進來的人不必有通行證；開這一間的人要留在這個畫面。另一台裝置請掃邀請進來。";

export const GO_ROOM_END_CONFIRM_HOST =
  "關掉後在場的人會斷線，目錄會沒了，電視與鏡頭會停，進行中的遊戲會停。已存到硬碟的檔不受影響。";

export const GO_ROOM_LEAVE_CONFIRM_GUEST =
  "離開後你會斷線；其他人還在。你掛上的項目會從分享區拿掉。";

export const GO_ROOM_CONNECT_FAILED =
  "連線失敗。請靠近同一網路，或請對方再發一次邀請。";

export const GO_ROOM_MEDIA_OFF = "鏡頭 · 未開";
export const GO_ROOM_TV_OFF = "沒訊號";
export const GO_ROOM_TV_TITLE = "包廂電視";
export const GO_ROOM_TV_FULLSCREEN = "全螢幕";
export const GO_ROOM_TV_EXIT_FULLSCREEN = "離開全螢幕";
export const GO_ROOM_TV_VOLUME = "音量";
export const GO_ROOM_TV_HINT_HOST =
  "片子在檔案區掛上後按放到電視上。鏡頭在成員區指定。";
export const GO_ROOM_TV_HINT_GUEST = "電視畫面由主持指定。點全螢幕可放大。";
export const GO_ROOM_PUT_ON_TV = "放到電視上";
export const GO_ROOM_FORCE_MUTE = "強制靜音";
export const GO_ROOM_FORCE_CAMERA_OFF = "關閉鏡頭";
export const GO_ROOM_KICK = "踢出包廂";
export const GO_ROOM_MEMBER_MORE = "更多";
export const GO_ROOM_KICK_CONFIRM =
  "要把這個人請出這一間？對方會斷線；其他人還在。";
export const GO_ROOM_KICKED = "主持請你離開這一間";
export const GO_ROOM_TV_OFF_BTN = "從電視拿掉";
export const GO_ROOM_TV_PLAY = "播放";
export const GO_ROOM_TV_PAUSE = "暫停";
export const GO_ROOM_CINEMA_ENTER = "隱藏控制面板";
export const GO_ROOM_CINEMA_EXIT = "顯示控制面板";
export const GO_ROOM_CAMERA_WATCH = "收看";
export const GO_ROOM_CAMERA_STOP_WATCH = "停止收看";
export const GO_ROOM_MIC_LISTEN = "收聽";
export const GO_ROOM_MIC_STOP_LISTEN = "停止收聽";
export const GO_ROOM_CAST_WATCH = "播放";
export const GO_ROOM_CAST_STOP_WATCH = "停止播放";
export const GO_ROOM_HANG_FILES_ONLY = "只能掛檔，不掛資料夾";
export const GO_ROOM_CAST_UNSUPPORTED =
  "播不了這份檔。請改用電腦再掛一次，或改下載。";
export const GO_ROOM_OWNER_DECODE =
  "這一頁正在解碼這份檔。請留著這個畫面，對方才能收看。";
export const GO_ROOM_MEDIA_PERM_DENIED = "沒有鏡頭或麥克風權限。";
export const GO_ROOM_DISPLAY_PERM_DENIED = "沒有畫面分享權限。";

/** Guest↔Guest mesh is postponed; Hub star carries files and media. */
export const GO_ROOM_MESH_ENABLED = false;

/** Host plus guests currently in the booth. */
export function roomOccupantCount(guestCount: number): number {
  return Math.max(0, Math.floor(guestCount)) + 1;
}

/** Remote live sink is bound as soon as the PC exists; show it only after 收看. */
export function roomRemoteSinkVisible(opts: {
  watching?: boolean;
  listening?: boolean;
}): boolean {
  return Boolean(opts.watching || opts.listening);
}

export function roomMediaSummary(opts: {
  camera: boolean;
  mic: boolean;
  display?: boolean;
  watching?: boolean;
  listening?: boolean;
}): string {
  if (opts.watching) return "正在收看鏡頭";
  if (opts.listening) return "正在收聽";
  if (opts.display) return "畫面已開 · 等對方收看";
  if (opts.camera) return "鏡頭已開 · 等對方收看";
  if (opts.mic) return "麥克風已開 · 等對方收聽";
  return GO_ROOM_MEDIA_OFF;
}

/** Shared TV label. Private playback never belongs here. */
export function roomTvLabel(opts: {
  programName?: string | null;
  remoteProgramName?: string | null;
  sourceName?: string | null;
}): string {
  const file = opts.remoteProgramName?.trim() || opts.programName?.trim();
  if (file) return `正在播 ${file}`;
  const who = opts.sourceName?.trim();
  if (who) return `電視上是 ${who}`;
  return GO_ROOM_TV_OFF;
}

function mediaStreamHasFrames(stream: MediaStream): boolean {
  try {
    return stream.getTracks().some((t) => mediaTrackHasFrames(t));
  } catch {
    return false;
  }
}

/**
 * Bind the TV hole.
 * - Host casting a file: keep the local capture when remote is only a muted
 *   transceiver placeholder from a newly joined peer.
 * - Joiners watching RTP: bind the remote program even while muted so the
 *   first frames can paint (do not drop a muted remote when there is no local).
 */
export function roomTvStream(opts: {
  programStream: MediaStream | null;
  localProgramStream?: MediaStream | null;
}): MediaStream | null {
  const remote = opts.programStream;
  const local = opts.localProgramStream ?? null;
  if (local && !(remote && mediaStreamHasFrames(remote))) {
    return local;
  }
  return remote ?? local ?? null;
}

export type RoomTvHudKind = "none" | "host-file" | "watch";

/** Host file clock lives on the picture; guests only watch. No-input snow has no HUD. */
export function roomTvHudKind(opts: {
  tvOn: boolean;
  role?: "host" | "guest";
  fileTransport?: boolean;
}): RoomTvHudKind {
  if (!opts.tvOn) return "none";
  if (opts.role === "host" && opts.fileTransport) return "host-file";
  return "watch";
}

export function roomTvHudHasTransport(kind: RoomTvHudKind): boolean {
  return kind === "host-file";
}

/** System slot fullscreen or in-app cinema both already fill the screen. */
export function roomTvHudRestore(opts: {
  slotFullscreen?: boolean;
  cinema?: boolean;
}): boolean {
  return Boolean(opts.slotFullscreen || opts.cinema);
}

/** Speaker tap reveals／hides the volume slider; it is not inline on the bar. */
export function roomTvVolumePanelAfterIconClick(open: boolean): boolean {
  return !open;
}

export function roomTvVolumeFromInput(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

/** TV starts muted + playsinline so joiners can autoplay; user unmutes. */
export function roomTvHudDefaultSink(): { volume: number; muted: boolean } {
  return { volume: 1, muted: true };
}

/**
 * Speaker: when quiet, first tap unmutes (and opens the slider).
 * When already audible, tap only toggles the slider panel.
 */
export function roomTvVolumeIconClick(opts: {
  quiet: boolean;
  panelOpen: boolean;
  volume: number;
}): { muted: boolean; panelOpen: boolean; volume: number } {
  if (opts.quiet) {
    return {
      muted: false,
      panelOpen: true,
      volume: opts.volume > 0 ? opts.volume : 1,
    };
  }
  return {
    muted: false,
    panelOpen: roomTvVolumePanelAfterIconClick(opts.panelOpen),
    volume: opts.volume,
  };
}

export function roomTvSinkMuted(volume: number, muted: boolean): boolean {
  return Boolean(muted) || roomTvVolumeFromInput(volume) <= 0;
}

export function applyTvSinkVolume(
  el: { volume: number; muted: boolean } | null | undefined,
  opts: { volume: number; muted: boolean }
): void {
  if (!el) return;
  const volume = roomTvVolumeFromInput(opts.volume);
  el.volume = volume;
  el.muted = roomTvSinkMuted(volume, opts.muted);
}

export function roomTvClockLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Status line: who is in + what the TV is doing. Never a door-code countdown. */
export function roomStageStatus(opts: {
  guestCount: number;
  tvLabel: string;
}): string {
  const people = roomOccupantSummary({ guestCount: opts.guestCount });
  const tv = opts.tvLabel.trim();
  const tvOn = Boolean(tv && tv !== GO_ROOM_TV_OFF);
  if (!people && !tvOn) return "";
  if (!people) return tv;
  if (!tvOn) return `${people} · ${GO_ROOM_TV_OFF}`;
  return `${people} · ${tv}`;
}

export type RoomOccupantPeer = {
  peerId: string;
  name: string;
};

/**
 * Guest view of a Host occupancy snapshot: everyone else, including Host.
 * `guestCount` matches Host (guests including self; Host not counted).
 */
export function roomOccupancyFromSnapshot(opts: {
  localPeerId: string;
  occupants: readonly RoomOccupantPeer[];
}): { guestCount: number; occupantPeers: RoomOccupantPeer[] } {
  const seen = new Set<string>();
  const occupantPeers: RoomOccupantPeer[] = [];
  for (const row of opts.occupants) {
    const peerId = row.peerId?.trim();
    if (!peerId || peerId === opts.localPeerId || seen.has(peerId)) continue;
    seen.add(peerId);
    occupantPeers.push({
      peerId,
      name: row.name?.trim() || "訪客",
    });
  }
  return {
    guestCount: occupantPeers.length,
    occupantPeers,
  };
}

export type RoomRemoteLive = {
  peerId: string;
  camera?: boolean;
  mic?: boolean;
};

export type RoomOccupant = {
  peerId: string;
  name: string;
  mine: boolean;
  liveVideo: boolean;
  liveAudio: boolean;
};

/** In-booth roster: live camera／mic sit on the person, not in the share catalog. */
export function roomOccupantRows(opts: {
  localPeerId: string;
  localName: string;
  localLiveVideo: boolean;
  localLiveAudio: boolean;
  others: RoomOccupantPeer[];
  remoteLives?: RoomRemoteLive[];
}): RoomOccupant[] {
  const lives = new Map(
    (opts.remoteLives ?? []).map((l) => [l.peerId, l] as const)
  );
  return [
    {
      peerId: opts.localPeerId,
      name: opts.localName,
      mine: true,
      liveVideo: opts.localLiveVideo,
      liveAudio: opts.localLiveAudio,
    },
    ...opts.others
      .filter((o) => o.peerId && o.peerId !== opts.localPeerId)
      .map((o) => {
        const live = lives.get(o.peerId);
        return {
          peerId: o.peerId,
          name: o.name,
          mine: false,
          liveVideo: Boolean(live?.camera),
          liveAudio: Boolean(live?.mic),
        };
      }),
  ];
}

export const GO_ROOM_ROLE_HOST = "主持人";
export const GO_ROOM_ROLE_PRESENTER = "主講人";
export const GO_ROOM_ON_AIR = "LIVE";
export const GO_ROOM_HAND_RAISE = "舉手";

export type RoomMemberCardView = {
  peerId: string;
  name: string;
  mine: boolean;
  avatarUrl: string | null;
  avatarInitial: string;
  host: boolean;
  presenter: boolean;
  micOn: boolean;
  cameraOn: boolean;
  speaking: boolean;
  onAir: boolean;
  handRaised: boolean;
};

/** First visible grapheme for a letter avatar when there is no photo. */
export function roomMemberAvatarInitial(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const first = [...t][0];
  return first || "?";
}

/** True when this occupant's live is the designated TV source. */
export function roomMemberOnAir(opts: {
  peerId: string;
  mine: boolean;
  tvSourcePeerId: string | null;
  localAgentId?: string | null;
}): boolean {
  const src = opts.tvSourcePeerId?.trim();
  if (!src) return false;
  if (src === opts.peerId) return true;
  if (!opts.mine) return false;
  if (src === "local") return true;
  const localId = opts.localAgentId?.trim();
  return Boolean(localId) && src === localId;
}

/** Member-list card model: roles, mic／camera, LIVE, 舉手. */
export function roomMemberCard(opts: {
  occupant: RoomOccupant;
  hostPeerId?: string | null;
  tvSourcePeerId?: string | null;
  localAgentId?: string | null;
  speaking?: boolean;
  handRaised?: boolean;
  avatarUrl?: string | null;
}): RoomMemberCardView {
  const hostId = opts.hostPeerId?.trim() || "";
  const host = Boolean(hostId) && opts.occupant.peerId === hostId;
  const onAir = roomMemberOnAir({
    peerId: opts.occupant.peerId,
    mine: opts.occupant.mine,
    tvSourcePeerId: opts.tvSourcePeerId ?? null,
    localAgentId: opts.localAgentId,
  });
  const micOn = opts.occupant.liveAudio;
  return {
    peerId: opts.occupant.peerId,
    name: opts.occupant.name,
    mine: opts.occupant.mine,
    avatarUrl: opts.avatarUrl?.trim() || null,
    avatarInitial: roomMemberAvatarInitial(opts.occupant.name),
    host,
    presenter: onAir,
    micOn,
    cameraOn: opts.occupant.liveVideo,
    speaking: Boolean(opts.speaking) && micOn,
    onAir,
    handRaised: Boolean(opts.handRaised),
  };
}

function memberRankBit(on: boolean): number {
  return on ? 0 : 1;
}

/**
 * Roster order: 主持人 → 播送中 LIVE → 舉手 → 發言中 → 名稱.
 * Does not mutate the input.
 */
export function roomMemberCardsSorted(
  cards: readonly RoomMemberCardView[]
): RoomMemberCardView[] {
  return [...cards].sort((a, b) => {
    const rank =
      memberRankBit(a.host) - memberRankBit(b.host) ||
      memberRankBit(a.onAir) - memberRankBit(b.onAir) ||
      memberRankBit(a.handRaised) - memberRankBit(b.handRaised) ||
      memberRankBit(a.speaking) - memberRankBit(b.speaking);
    if (rank !== 0) return rank;
    const byName = a.name.localeCompare(b.name, "zh-Hant");
    if (byName !== 0) return byName;
    return a.peerId.localeCompare(b.peerId);
  });
}

export type RoomHostMenuAction =
  | "putOnTv"
  | "forceMute"
  | "forceCameraOff"
  | "kick";

export type RoomHostMenuItem = {
  action: RoomHostMenuAction;
  label: string;
  enabled: boolean;
  danger?: boolean;
};

/** Host-only overflow next to a member card. Kick is never for the local row. */
export function roomHostMemberMenu(opts: {
  mine: boolean;
  liveAudio: boolean;
  liveVideo: boolean;
}): RoomHostMenuItem[] {
  const items: RoomHostMenuItem[] = [
    {
      action: "putOnTv",
      label: GO_ROOM_PUT_ON_TV,
      enabled: opts.liveAudio || opts.liveVideo,
    },
    {
      action: "forceMute",
      label: GO_ROOM_FORCE_MUTE,
      enabled: opts.liveAudio,
    },
    {
      action: "forceCameraOff",
      label: GO_ROOM_FORCE_CAMERA_OFF,
      enabled: opts.liveVideo,
    },
  ];
  if (!opts.mine) {
    items.push({
      action: "kick",
      label: GO_ROOM_KICK,
      enabled: true,
      danger: true,
    });
  }
  return items;
}

export type RoomInviteDoor = "none" | "live" | "expired";

/** Login profile label for Host presence／chat; 主持 is the role mark, not the name. */
export function roomHostDisplayName(
  profile: { label?: string | null } | null | undefined
): string {
  const label = profile?.label?.trim();
  return label || SESSION_CHAT_HOST_DISPLAY_NAME;
}

/** Bubble name beside the 主持 tag. Local stays first-person. */
export function roomChatWhoLabel(opts: {
  local: boolean;
  host: boolean;
  name?: string | null;
}): string {
  if (opts.local) return "我";
  const n = opts.name?.trim();
  if (n) return n;
  return opts.host ? "" : "對方";
}

/** Status line: who is in the booth. Never a door-code countdown. */
export function roomOccupantSummary(opts: { guestCount: number }): string {
  const guests = Math.max(0, Math.floor(opts.guestCount));
  if (guests <= 0) return "";
  return `${guests + 1} 人在`;
}

export function roomInviteDoor(opts: {
  shortUrl: string | null;
  expiresAt: number | null;
  expired?: boolean;
  now?: number;
}): RoomInviteDoor {
  if (opts.expired) return "expired";
  if (
    opts.shortUrl &&
    typeof opts.expiresAt === "number" &&
    Number.isFinite(opts.expiresAt) &&
    (opts.now ?? Date.now()) < opts.expiresAt
  ) {
    return "live";
  }
  return "none";
}

export function isRoomInviteShareable(opts: {
  shortUrl: string | null;
  expiresAt: number | null;
  now?: number;
}): boolean {
  return roomInviteDoor({ ...opts, expired: false }) === "live";
}

/** Share-sheet／door-row countdown. Not the booth status line. */
export function roomInviteRemainLabel(
  expiresAt: number | null,
  now = Date.now()
): string {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return "";
  const ms = expiresAt - now;
  if (ms <= 0) return "已過期";
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `還有 ${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Snapshot the picker before resetting it. `input.files` is a live FileList;
 * assigning `value = ""` empties that same object.
 */
export function takePickedFiles(input: {
  files: FileList | null;
  value: string;
}): File[] {
  const picked = Array.from(input.files ?? []);
  input.value = "";
  return picked;
}

export function canShareDisplay(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );
}

export function mediaTrackHasFrames(t: MediaStreamTrack): boolean {
  if (t.readyState === "ended") return false;
  if (!t.muted) return true;
  const settings =
    typeof t.getSettings === "function" ? t.getSettings() : undefined;
  return (settings?.width ?? 0) > 0 || (settings?.height ?? 0) > 0;
}

/** Bind a stream to a media element without resetting srcObject on every emit. */
export type AttachMediaEl = {
  srcObject: MediaStream | null;
  paused: boolean;
  muted: boolean;
  volume?: number;
  play: () => Promise<void>;
};

export type TvSinkVolume = { volume: number; muted: boolean };

export type AttachMediaSink = TvSinkVolume & {
  /** Fired when play only succeeded after forcing mute (autoplay policy). */
  onAutoplayMuted?: () => void;
};

/** Bind a stream to a media element without resetting srcObject on every emit. */
export function attachMediaStream(
  el: AttachMediaEl | HTMLMediaElement | null | undefined,
  stream: MediaStream | null,
  sink?: AttachMediaSink
): void {
  if (!el) return;
  const media = el as AttachMediaEl;
  const play = () => {
    if (!stream) return;
    void tryPlay(media).then((result) => {
      if (!sink) return;
      if (result === "muted") {
        applyTvSinkVolume(media as { volume: number; muted: boolean }, {
          volume: sink.volume,
          muted: true,
        });
        sink.onAutoplayMuted?.();
        return;
      }
      if (result === "ok") {
        applyTvSinkVolume(media as { volume: number; muted: boolean }, sink);
      }
    });
  };
  if (media.srcObject === stream) {
    if (stream && media.paused) play();
    else if (sink) {
      applyTvSinkVolume(media as { volume: number; muted: boolean }, sink);
    }
    return;
  }
  media.srcObject = stream;
  play();
}

/** Expand the booth TV slot (HUD included). Never the native `<video>` player. */
export async function enterTvFullscreen(
  el:
    | {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void>;
      }
    | null
    | undefined
): Promise<boolean> {
  if (!el) return false;
  try {
    if (typeof el.requestFullscreen === "function") {
      await el.requestFullscreen();
      return true;
    }
  } catch {
    /* try the webkit prefix next */
  }
  try {
    if (typeof el.webkitRequestFullscreen === "function") {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function exitTvFullscreen(
  doc:
    | {
        exitFullscreen?: () => Promise<void>;
        webkitExitFullscreen?: () => Promise<void>;
      }
    | null
    | undefined
): Promise<boolean> {
  if (!doc) return false;
  try {
    if (typeof doc.exitFullscreen === "function") {
      await doc.exitFullscreen();
      return true;
    }
  } catch {
    /* try the webkit prefix next */
  }
  try {
    if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function tvFullscreenElement(
  doc:
    | {
        fullscreenElement?: Element | null;
        webkitFullscreenElement?: Element | null;
      }
    | null
    | undefined
): Element | null {
  if (!doc) return null;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function tvIsFullscreen(
  container: object | null | undefined,
  fullscreenElement: object | null | undefined
): boolean {
  return Boolean(container && fullscreenElement && container === fullscreenElement);
}

export async function toggleTvFullscreen(opts: {
  container:
    | {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void>;
      }
    | null
    | undefined;
  fullscreenElement?: object | null;
  exitFullscreen?: () => Promise<void>;
}): Promise<"entered" | "exited" | "failed"> {
  if (tvIsFullscreen(opts.container, opts.fullscreenElement)) {
    if (opts.exitFullscreen) {
      try {
        await opts.exitFullscreen();
        return "exited";
      } catch {
        return "failed";
      }
    }
    const ok = await exitTvFullscreen(
      typeof document !== "undefined" ? document : null
    );
    return ok ? "exited" : "failed";
  }
  const ok = await enterTvFullscreen(opts.container);
  return ok ? "entered" : "failed";
}

/** Keep showing the program after leaving fullscreen; do not change the host clock. */
export function syncTvSinkPlayback(
  el: { paused?: boolean; play?: () => Promise<void> } | null | undefined
): void {
  if (!el || !el.paused || typeof el.play !== "function") return;
  void el.play().catch(() => {});
}

function playbackSrcOf(el: { src: string; getAttribute?: (name: string) => string | null }): string {
  const attr = el.getAttribute?.("src");
  if (attr) return attr;
  return el.src || "";
}

/**
 * Bind a playback URL without resetting media src on every roster emit.
 * Re-assigning the same blob: URL can close the source and leave a black frame.
 */
export function attachPlaybackUrl(
  el: {
    src: string;
    paused: boolean;
    muted: boolean;
    play: () => Promise<void>;
    load?: () => void;
    getAttribute?: (name: string) => string | null;
    removeAttribute?: (name: string) => void;
  } | null | undefined,
  url: string | null
): void {
  if (!el) return;
  if (!url) {
    if (playbackSrcOf(el)) {
      el.removeAttribute?.("src");
      el.src = "";
    }
    return;
  }
  if (playbackSrcOf(el) === url || el.src === url) {
    if (el.paused) void tryPlay(el);
    return;
  }
  el.src = url;
  el.load?.();
  void tryPlay(el);
}

async function tryPlay(el: {
  muted: boolean;
  play: () => Promise<void>;
}): Promise<"ok" | "muted" | "fail"> {
  try {
    await el.play();
    return "ok";
  } catch {
    el.muted = true;
    try {
      await el.play();
      return "muted";
    } catch {
      return "fail";
    }
  }
}
