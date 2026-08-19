/** Shared 包廂 copy and chat hints (Host＋Guest). */

import { SESSION_CHAT_HOST_DISPLAY_NAME } from "@pg/roster/rosterSessionChat";

export const GO_ROOM_SHARE_TITLE = "邀請你進包廂";
export const GO_ROOM_SHARE_HINT =
  "這張邀請約 5 分鐘內有效；過期後再發一張即可，這一間不會因此關掉。請對方用相機掃碼進來。另一台裝置請掃這張邀請進來，不要再開一間包廂。";

export const GO_ROOM_QUICK_REPLIES = ["在嗎", "等一下", "收到", "謝謝"] as const;

/** Right overlay width in rem. Always overlay; never in-flow. */
export const ROOM_CHAT_PANEL_REM = 22;
/** Leave a sliver of the page visible beside a covering overlay. */
export const ROOM_CHAT_PANEL_GUTTER_REM = 2.75;

/** Phone landscape: height is the scarce axis. Keep in sync with CSS max-height. */
export const ROOM_SHORT_LANDSCAPE_MAX_HEIGHT_PX = 560;
export const ROOM_SHORT_LANDSCAPE_MQ = `(orientation: landscape) and (max-height: ${ROOM_SHORT_LANDSCAPE_MAX_HEIGHT_PX}px)`;

/** 40rem — tablet concurrent panes. Keep in sync with CSS min-width. */
export const ROOM_SHELL_TABLET_MIN_PX = 640;
/** 64rem — desktop TV + rail. Keep in sync with CSS min-width. */
export const ROOM_SHELL_DESKTOP_MIN_PX = 1024;

export type RoomShellMode =
  | "portrait"
  | "short-landscape"
  | "tablet"
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
  if (opts.widthPx >= ROOM_SHELL_TABLET_MIN_PX) return "tablet";
  return "portrait";
}

export function roomShellPanesConcurrent(
  mode: RoomShellMode,
  cinema = false
): boolean {
  if (cinema) return false;
  return mode === "tablet" || mode === "desktop";
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

/** Pause chrome 3s hide while a sheet or the composer is in the way. */
export function roomChromeShouldHold(opts: {
  shareOpen?: boolean;
  confirmOpen?: boolean;
  composerFocused?: boolean;
  overlayOpen?: boolean;
  drawerOpen?: boolean;
}): boolean {
  return Boolean(
    opts.shareOpen ||
      opts.confirmOpen ||
      opts.composerFocused ||
      opts.overlayOpen ||
      opts.drawerOpen
  );
}

/** Theatre mode: app-level fullscreen video. Not the browser Fullscreen API. */
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
  tvOn: boolean;
  userExit: boolean;
}): boolean {
  if (!opts.allowed || !opts.tvOn || opts.userExit) return false;
  return true;
}

/** House ad floats on the idle TV; hide once a program is streaming. */
export function roomShowAdSlot(opts: {
  inBooth?: boolean;
  tvOn?: boolean;
}): boolean {
  if (opts.inBooth === false) return false;
  return !opts.tvOn;
}

export type RoomEscStep =
  | "close-share"
  | "close-tv-sheet"
  | "clear-peer"
  | "close-drawer"
  | "exit-cinema"
  | "confirm-end";

/** Esc: overlays first; cinema shrinks to hall; only then leave-confirm. */
export function roomEscStep(opts: {
  shareOpen?: boolean;
  tvOpen?: boolean;
  selectedPeerId?: string | null;
  cinema?: boolean;
  drawerOpen?: boolean;
}): RoomEscStep {
  if (opts.shareOpen) return "close-share";
  if (opts.tvOpen) return "close-tv-sheet";
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

export const GO_ROOM_LOGIN_HINT =
  "被請進來的人不必有通行證；開這一間的人要留在這個畫面。另一台裝置請掃邀請進來。";

export const GO_ROOM_END_CONFIRM_HOST =
  "關掉後在場的人會斷線，目錄會沒了，電視與鏡頭會停，進行中的遊戲會停。已存到硬碟的檔不受影響。";

export const GO_ROOM_LEAVE_CONFIRM_GUEST =
  "離開後你會斷線；其他人還在。你掛上的項目會從分享區拿掉。";

export const GO_ROOM_CONNECT_FAILED =
  "連線失敗。請靠近同一網路，或請對方再發一次邀請。";

export const GO_ROOM_MEDIA_OFF = "鏡頭 · 未開";
export const GO_ROOM_TV_OFF = "電視關機";
export const GO_ROOM_TV_TITLE = "包廂電視";
export const GO_ROOM_TV_FULLSCREEN = "全螢幕";
export const GO_ROOM_TV_HINT_HOST =
  "片子在檔案區掛上後按放到電視上。鏡頭在成員區指定。";
export const GO_ROOM_TV_HINT_GUEST = "電視畫面由主持指定。點全螢幕可放大。";
export const GO_ROOM_PUT_ON_TV = "放到電視上";
export const GO_ROOM_TV_OFF_BTN = "關掉電視";
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

/** Bind the TV hole: remote program RTP, else the local capture while we are the house. */
export function roomTvStream(opts: {
  programStream: MediaStream | null;
  localProgramStream?: MediaStream | null;
}): MediaStream | null {
  return opts.programStream ?? opts.localProgramStream ?? null;
}

/** Status line: who is in + what the TV is doing. Never a door-code countdown. */
export function roomStageStatus(opts: {
  guestCount: number;
  tvLabel: string;
}): string {
  const people = roomOccupantSummary({ guestCount: opts.guestCount });
  const tv = opts.tvLabel.trim();
  if (!tv || tv === GO_ROOM_TV_OFF) {
    if (opts.guestCount <= 0) return people;
    return `${people} · ${GO_ROOM_TV_OFF}`;
  }
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
  if (guests <= 0) return "就你一個人 · 把這頁開著，這一間才還在";
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
  play: () => Promise<void>;
};

export function attachMediaStream(
  el: AttachMediaEl | HTMLMediaElement | null | undefined,
  stream: MediaStream | null
): void {
  if (!el) return;
  const media = el as AttachMediaEl;
  if (media.srcObject === stream) {
    if (stream && media.paused) void tryPlay(media);
    return;
  }
  media.srcObject = stream;
  if (stream) void tryPlay(media);
}

/** Expand the booth TV. Prefers standard Fullscreen, then iOS `<video>` fullscreen. */
export async function enterTvFullscreen(
  el:
    | {
        requestFullscreen?: () => Promise<void>;
        webkitEnterFullscreen?: () => void;
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
    /* iOS often exposes requestFullscreen but only webkitEnterFullscreen works. */
  }
  try {
    if (typeof el.webkitEnterFullscreen === "function") {
      el.webkitEnterFullscreen();
      return true;
    }
    if (typeof el.webkitRequestFullscreen === "function") {
      await el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function playbackSrcOf(el: { src: string; getAttribute?: (name: string) => string | null }): string {
  const attr = el.getAttribute?.("src");
  if (attr) return attr;
  return el.src || "";
}

/**
 * Bind a blob / HTTP playback URL without resetting media src on every roster emit.
 * Re-assigning the same blob: MediaSource URL closes the source and leaves a black frame.
 */
export function attachPlaybackUrl(
  el: {
    src: string;
    paused: boolean;
    muted: boolean;
    play: () => Promise<void>;
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
  void tryPlay(el);
}

async function tryPlay(el: {
  muted: boolean;
  play: () => Promise<void>;
}): Promise<void> {
  try {
    await el.play();
  } catch {
    el.muted = true;
    try {
      await el.play();
    } catch {
      /* autoplay still blocked */
    }
  }
}
