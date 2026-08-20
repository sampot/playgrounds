/**
 * 包廂分享區：多媒體卡片、篩選、權限、大螢幕播放中標記。
 */

export const GO_ROOM_FILE_PREVIEW = "預覽";
export const GO_ROOM_FILE_CAST = "推播至大螢幕";
export const GO_ROOM_FILE_DELETE = "撤回";
export const GO_ROOM_FILE_ON_AIR = "大螢幕播放中";
export const GO_ROOM_FILE_DOWNLOAD = "下載";
/** Safari／無 Save picker：第一次「下載」只拉齊 bytes；就緒後改此文案再點才存到本機。 */
export const GO_ROOM_FILE_SAVE = "存檔";
export const GO_ROOM_FILE_SAVE_READY_HINT =
  "檔已就緒。再按「存檔」才會存到這台。";
export const GO_ROOM_FILE_DROP = "拖進來或點這裡掛上檔案";
export const GO_ROOM_FILE_DELETE_CONFIRM =
  "撤回後在場的人看不到這個檔。已存到硬碟的不受影響。";

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
