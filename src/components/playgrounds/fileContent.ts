/** Helpers for workspace files that may be UTF-8 text or binary. */

const BINARY_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "avif",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "apk",
  "so",
  "o",
  "a",
  "exe",
  "dll",
  "bin",
  "wasm",
  "zip",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "pdf",
  "mp3",
  "mp4",
  "webm",
  "ogg",
  "wav",
  "flac",
  "sqlite",
  "db",
]);

/** Raster / browser-displayable image extensions (subset of binary). */
const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "avif",
]);

/** Native <audio> — no third-party decoder. */
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "flac"]);

/** Native <video> — no third-party decoder. */
const VIDEO_EXT = new Set(["mp4", "webm"]);

const MEDIA_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
};

export type FileContent = string | Uint8Array;

/** Editor-pane preview kinds that use only browser built-ins (no PDF.js / codecs libs). */
export type MediaPreviewKind = "image" | "pdf" | "audio" | "video";

export function extensionOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i + 1).toLowerCase();
}

/** True when path is conventionally binary (images, fonts, packages, …). */
export function isBinaryPath(path: string): boolean {
  return BINARY_EXT.has(extensionOf(path));
}

/**
 * Whether writing this path should remount the work canvas iframe.
 * Binary dumps (screenshots, fonts, archives, …) must not — remount wipes
 * SPA runtime state (e.g. an in-progress canvas game).
 */
export function writeShouldReloadCanvas(path: string): boolean {
  return !isBinaryPath(path);
}

export function mediaPreviewKind(path: string): MediaPreviewKind | null {
  const ext = extensionOf(path);
  if (IMAGE_EXT.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

/** True for common image types shown as preview in the editor pane. */
export function isImagePath(path: string): boolean {
  return mediaPreviewKind(path) === "image";
}

export function isPdfPath(path: string): boolean {
  return mediaPreviewKind(path) === "pdf";
}

export function isAudioPath(path: string): boolean {
  return mediaPreviewKind(path) === "audio";
}

export function isVideoPath(path: string): boolean {
  return mediaPreviewKind(path) === "video";
}

/** Native browser preview (img / iframe PDF / audio / video) — not CodeMirror. */
export function isMediaPreviewPath(path: string): boolean {
  return mediaPreviewKind(path) !== null;
}

export function imageMimeType(path: string): string {
  return MEDIA_MIME[extensionOf(path)] ?? "application/octet-stream";
}

export function mediaPreviewMimeType(path: string): string {
  return MEDIA_MIME[extensionOf(path)] ?? "application/octet-stream";
}

export function isBinaryContent(content: FileContent): content is Uint8Array {
  return content instanceof Uint8Array;
}

export function isTextContent(content: FileContent): content is string {
  return typeof content === "string";
}

/** Decode bytes as UTF-8 text when they look textual; otherwise keep binary. */
export function bytesToFileContent(
  path: string,
  data: Uint8Array
): FileContent {
  if (isBinaryPath(path)) return data;
  // NUL in the first chunk → binary
  const sample = data.subarray(0, Math.min(data.length, 8000));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return data;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return data;
  }
}

export function fileContentToBytes(content: FileContent): Uint8Array {
  if (content instanceof Uint8Array) return content;
  return new TextEncoder().encode(content);
}

export function fileContentByteLength(content: FileContent): number {
  if (content instanceof Uint8Array) return content.byteLength;
  return new TextEncoder().encode(content).byteLength;
}

/** Empty / whitespace-only text; binaries count as non-empty. */
export function isEmptyTextContent(content: FileContent | undefined): boolean {
  if (content === undefined) return true;
  if (content instanceof Uint8Array) return content.byteLength === 0;
  return !content.trim();
}
