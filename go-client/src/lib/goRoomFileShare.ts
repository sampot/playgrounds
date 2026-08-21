/**
 * 包廂分享區：多媒體卡片、篩選、權限、大螢幕播放中標記。
 */

export const GO_ROOM_FILE_PREVIEW = "預覽";
export const GO_ROOM_FILE_CAST = "推播至大螢幕";
export const GO_ROOM_FILE_DELETE = "撤回";
export const GO_ROOM_FILE_ON_AIR = "大螢幕播放中";
export const GO_ROOM_FILE_DOWNLOAD = "下載";
/** In-flight remote／HTTP save — replace the download affordance. */
export const GO_ROOM_FILE_CANCEL = "取消";
/** Safari／無 Save picker：第一次「下載」只拉齊 bytes；就緒後改此文案再點才存到本機。 */
export const GO_ROOM_FILE_SAVE = "存檔";
export const GO_ROOM_FILE_SAVE_READY_HINT =
  "檔已就緒。再按「存檔」才會存到這台；存完會釋放暫存。";
export const GO_ROOM_FILE_DROP = "拖進來或點這裡掛上檔案";
export const GO_ROOM_FILE_DELETE_CONFIRM =
  "撤回後在場的人看不到這個檔。已存到硬碟的不受影響。";

export const GO_ROOM_FILE_ZONE = ["share", "private"] as const;
export type RoomFileZone = (typeof GO_ROOM_FILE_ZONE)[number];

export const GO_ROOM_FILE_ZONE_LABEL: Record<RoomFileZone, string> = {
  share: "分享",
  private: "私有",
};

export const GO_ROOM_PRIVATE_IMPORT = "匯入私有";
export const GO_ROOM_PRIVATE_DROP = "拖進來或點這裡匯入私有檔";
export const GO_ROOM_PRIVATE_MOUNT = "掛到分享";
export const GO_ROOM_PRIVATE_DELETE = "刪除";
export const GO_ROOM_PRIVATE_DELETE_CONFIRM =
  "刪除後這台私有片庫裡就沒有這個檔。已掛到分享的不受影響。";
export const GO_ROOM_PRIVATE_UNSUPPORTED_HINT =
  "這台瀏覽器沒有私有片庫（需要 OPFS）。可改用分享區掛檔。";

export const GO_ROOM_FILE_FILTERS = ["all", "av", "doc"] as const;
export type RoomFileShareFilter = (typeof GO_ROOM_FILE_FILTERS)[number];

export const GO_ROOM_FILE_FILTER_LABEL: Record<RoomFileShareFilter, string> = {
  all: "全部",
  av: "影音",
  doc: "文件",
};

export type FileShareKind = "video" | "audio" | "image" | "doc";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;

export function fileShareKind(item: {
  mime?: string;
  name?: string;
}): FileShareKind {
  const mime = (item.mime ?? "").toLowerCase();
  const name = item.name ?? "";
  if (mime.startsWith("video/") || VIDEO_EXT.test(name)) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXT.test(name)) return "audio";
  if (mime.startsWith("image/") || IMAGE_EXT.test(name)) return "image";
  return "doc";
}

export function fileShareIcon(kind: FileShareKind): string {
  if (kind === "video") return "🎬";
  if (kind === "audio") return "🎵";
  if (kind === "image") return "🖼️";
  return "📄";
}

export function roomFileShareMatches(
  filter: RoomFileShareFilter,
  kind: FileShareKind
): boolean {
  if (filter === "all") return true;
  if (filter === "av") return kind === "video" || kind === "audio";
  return kind === "doc" || kind === "image";
}

/**
 * Keep the preview media node in the tree for the whole overlay session.
 * Gating `<video>` on playback.url remounts it after the layer is already
 * open — Safari then drops the compositor layer / first Range.
 */
export function roomFilePreviewMountsMedia(kind: FileShareKind): boolean {
  return kind === "video" || kind === "audio" || kind === "image";
}

/**
 * Bind `/room-file` only when the overlay is open *and* the URL exists.
 * Do not clear src while waiting for SW open — that aborts Safari's Range.
 */
export function roomFilePreviewShouldAttachUrl(opts: {
  open: boolean;
  url: string | null | undefined;
}): boolean {
  return Boolean(opts.open && opts.url);
}

/**
 * Muted autoplay starts the play Range immediately. `metadata` makes Safari
 * abort a probe GET, then often give up on the remote `/room-file` body.
 */
export const ROOM_FILE_PREVIEW_VIDEO_PRELOAD = "auto" as const;

export function roomFileShareActions(opts: {
  role: "host" | "guest";
  mine: boolean;
  kind: FileShareKind;
}): {
  download: boolean;
  preview: boolean;
  cast: boolean;
  remove: boolean;
} {
  const av = opts.kind === "video" || opts.kind === "audio";
  return {
    download: !opts.mine,
    preview: !opts.mine,
    cast: opts.role === "host" && av,
    remove: opts.mine || opts.role === "host",
  };
}

/** Host-only private library row — no peer download／preview. */
export function roomFilePrivateActions(opts: {
  kind: FileShareKind;
}): {
  cast: boolean;
  mount: boolean;
  remove: boolean;
  preview: boolean;
} {
  const av = opts.kind === "video" || opts.kind === "audio";
  const image = opts.kind === "image";
  return {
    cast: av,
    mount: true,
    remove: true,
    preview: av || image,
  };
}

export function roomFileOnAir(opts: {
  fileId: string;
  fileName: string;
  streamingFileId: string | null;
  programName: string | null;
  liveOnTv: boolean;
}): boolean {
  if (opts.liveOnTv) return false;
  const listed = opts.streamingFileId?.trim() || "";
  if (listed) return listed === opts.fileId;
  const name = opts.programName?.trim() || "";
  return Boolean(name) && name === opts.fileName.trim();
}

/** Human size label using decimal units (SI) — matches Finder／Chrome downloads. */
export function formatFileShareSize(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1000) return `${Math.round(n)} B`;
  if (n < 1000 * 1000) return `${(n / 1000).toFixed(1)} KB`;
  if (n < 1000 * 1000 * 1000) return `${(n / (1000 * 1000)).toFixed(1)} MB`;
  return `${(n / (1000 * 1000 * 1000)).toFixed(1)} GB`;
}

export function roomFileShareProgress(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/**
 * Primary download-slot mode for a catalog row.
 * Cancel only while this peer is mid-save (transferring, not private-playing).
 */
export function roomFileDownloadMode(opts: {
  status?: string;
  pendingSave?: boolean;
  playing?: boolean;
}): "download" | "save" | "cancel" {
  if (opts.pendingSave) return "save";
  if (opts.status === "transferring" && !opts.playing) return "cancel";
  return "download";
}

/**
 * Download stays disabled for the whole private-play session — seek Range
 * churn must not re-enable it (status may briefly leave transferring).
 */
export function roomFileDownloadDisabled(opts: {
  status?: string;
  pendingSave?: boolean;
  playing?: boolean;
}): boolean {
  const mode = roomFileDownloadMode(opts);
  if (mode === "cancel") return false;
  if (opts.pendingSave) return false;
  if (opts.playing) return true;
  return opts.status === "transferring";
}

export const GO_ROOM_FILE_VIEW = "檢視";
export const GO_ROOM_FILE_PLAY = "播放";
export const GO_ROOM_FILE_LISTEN = "收聽";

/** File-row open action: 檢視 image／播放 video／收聽 audio. */
export function roomFileShareOpenLabel(kind: FileShareKind): string {
  if (kind === "image") return GO_ROOM_FILE_VIEW;
  if (kind === "audio") return GO_ROOM_FILE_LISTEN;
  if (kind === "video") return GO_ROOM_FILE_PLAY;
  return GO_ROOM_FILE_PREVIEW;
}
