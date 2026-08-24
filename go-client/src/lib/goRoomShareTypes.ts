/**
 * Host share library — directory-backed catalog (ENGINE §11.2a / TAURI §7.4).
 * Embedded browser uses in-memory shareLocalFile instead.
 */

export const GO_ROOM_SHARE_ID_PREFIX = "shr_";
export const GO_ROOM_SHARE_UNSUPPORTED =
  "這台環境沒有分享資料夾。可改用逐檔掛分享。";

export type ShareLibraryFile = {
  id: string;
  relativePath: string;
  name: string;
  size: number;
  mime?: string;
};

export type HostShareLibrary = {
  readonly supported: boolean;
  shareLibraryDir(): Promise<string | null>;
  scan(): Promise<ShareLibraryFile[]>;
  loadFile(entry: ShareLibraryFile): Promise<File>;
};

export function isShareDirFileId(id: string): boolean {
  return (
    typeof id === "string" &&
    id.startsWith(GO_ROOM_SHARE_ID_PREFIX) &&
    id.length > GO_ROOM_SHARE_ID_PREFIX.length
  );
}

/** Stable catalog id from a path relative to shareLibraryDir. */
export function shareFileIdForPath(relativePath: string): string {
  const norm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  let h = 2166136261;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const sizePart = (norm.length >>> 0).toString(16).padStart(4, "0");
  return `${GO_ROOM_SHARE_ID_PREFIX}${(h >>> 0).toString(16).padStart(8, "0")}${sizePart}`;
}

export function normalizeShareRelativePath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\/+/, "");
}
