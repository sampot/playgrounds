/**
 * 包廂分享目錄只掛檔，不掛資料夾、不是裝置。
 * Live stream 出現在在場名單，不進目錄。
 */

export type CatalogKind = "file" | "dir" | "device";
export type CatalogDevice = "camera" | "mic";
export type CatalogConsume = "download" | "play" | "view";

export type CatalogItemLike = {
  kind?: CatalogKind;
  device?: CatalogDevice;
  mime?: string;
  name?: string;
};

const AV_EXT = /\.(mp4|webm|mov|m4v|mkv|mp3|m4a|aac|wav|ogg|flac)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;

export function catalogConsumes(item: CatalogItemLike): CatalogConsume[] {
  if (item.kind === "dir" || item.kind === "device") return [];
  const mime = (item.mime ?? "").toLowerCase();
  const name = item.name ?? "";
  if (mime.startsWith("image/") || IMG_EXT.test(name)) {
    return ["view", "download"];
  }
  if (
    mime.startsWith("video/") ||
    mime.startsWith("audio/") ||
    AV_EXT.test(name)
  ) {
    return ["play", "download"];
  }
  return ["download"];
}

export function catalogPlayLabel(item: CatalogItemLike): "播放" | "收聽" {
  const mime = (item.mime ?? "").toLowerCase();
  if (mime.startsWith("audio/") && !mime.startsWith("video/")) return "收聽";
  const name = item.name ?? "";
  if (/\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(name)) return "收聽";
  return "播放";
}
