/** Shared 包廂 copy and chat hints (Host＋Guest). */

import { SESSION_CHAT_HOST_DISPLAY_NAME } from "@pg/roster/rosterSessionChat";

export const GO_ROOM_SHARE_TITLE = "邀請你進包廂";
export const GO_ROOM_SHARE_HINT =
  "這張邀請約 5 分鐘內有效；過期後再發一張即可，這一間不會因此關掉。請對方用相機掃碼進來。另一台裝置請掃這張邀請進來，不要再開一間包廂。";

export const GO_ROOM_QUICK_REPLIES = ["在嗎", "等一下", "收到", "謝謝"] as const;

export const GO_ROOM_EMPTY_TIMELINE = "還沒有訊息。先打字也可以。";

export const GO_ROOM_KEEP_OPEN = "這一間只在這個畫面開著的時候存在。";

export const GO_ROOM_LOGIN_HINT =
  "被請進來的人不必有通行證；開這一間的人要留在這個畫面。另一台裝置請掃邀請進來。";

export const GO_ROOM_END_CONFIRM_HOST =
  "關掉後在場的人會斷線，目錄會沒了，鏡頭與投放會停。已存到硬碟的檔不受影響。";

export const GO_ROOM_LEAVE_CONFIRM_GUEST =
  "離開後你會斷線；其他人還在。你掛上的檔會從分享區拿掉。";

export const GO_ROOM_CONNECT_FAILED =
  "連線失敗。請靠近同一網路，或請對方再發一次邀請。";

export const GO_ROOM_MEDIA_OFF = "鏡頭與投放 · 關";
export const GO_ROOM_CAMERA_PAIR_ONLY = "鏡頭只在兩人時";
export const GO_ROOM_CAMERA_WATCH = "收看鏡頭";
export const GO_ROOM_CAMERA_STOP_WATCH = "停止收看";
export const GO_ROOM_CAST_UNSUPPORTED =
  "這台裝置播不出這份影片。請換電腦播出，或改掛在分享區。";
export const GO_ROOM_MEDIA_PERM_DENIED = "沒有鏡頭或麥克風權限。";

/** Host plus guests currently in the booth. */
export function roomOccupantCount(guestCount: number): number {
  return Math.max(0, Math.floor(guestCount)) + 1;
}

/** 在場視訊僅恰好兩人（主持＋一位 Guest，含自己的第二台）。 */
export function roomCameraAllowed(occupantCount: number): boolean {
  return occupantCount === 2;
}

export function roomMediaSummary(opts: {
  camera: boolean;
  mic: boolean;
  programName: string | null;
  watching?: boolean;
}): string {
  const name = opts.programName?.trim();
  if (name) return `正在播出 · ${name}`;
  if (opts.watching) return "正在收看鏡頭";
  if (opts.camera) return "鏡頭已開 · 等對方收看";
  if (opts.mic) return "麥克風開著";
  return GO_ROOM_MEDIA_OFF;
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
