import { describe, expect, it } from "vitest";
import {
  bytesToFileContent,
  fileContentToBytes,
  imageMimeType,
  isBinaryPath,
  isEmptyTextContent,
  isImagePath,
  isMediaPreviewPath,
  isPdfPath,
  mediaPreviewKind,
  mediaPreviewMimeType,
  writeShouldReloadCanvas,
} from "./fileContent";

describe("fileContent", () => {
  it("treats image and apk paths as binary", () => {
    expect(isBinaryPath("logo.png")).toBe(true);
    expect(isBinaryPath("vendor/foo.apk")).toBe(true);
    expect(isBinaryPath("app.js")).toBe(false);
  });

  it("skips canvas reload for binary dumps", () => {
    expect(writeShouldReloadCanvas("shots/board.png")).toBe(false);
    expect(writeShouldReloadCanvas("charts/plot.JPEG")).toBe(false);
    expect(writeShouldReloadCanvas("index.html")).toBe(true);
    expect(writeShouldReloadCanvas("app.js")).toBe(true);
  });

  it("classifies native media preview kinds", () => {
    expect(mediaPreviewKind("a/b/logo.PNG")).toBe("image");
    expect(mediaPreviewKind("docs/spec.PDF")).toBe("pdf");
    expect(mediaPreviewKind("track.mp3")).toBe("audio");
    expect(mediaPreviewKind("clip.webm")).toBe("video");
    expect(mediaPreviewKind("pkg.apk")).toBeNull();
    expect(mediaPreviewKind("font.woff2")).toBeNull();
    expect(isImagePath("x.webp")).toBe(true);
    expect(isPdfPath("a.pdf")).toBe(true);
    expect(isMediaPreviewPath("a.mp4")).toBe(true);
    expect(isMediaPreviewPath("a.apk")).toBe(false);
    expect(imageMimeType("photo.jpg")).toBe("image/jpeg");
    expect(mediaPreviewMimeType("x.pdf")).toBe("application/pdf");
    expect(mediaPreviewMimeType("a.wav")).toBe("audio/wav");
    expect(mediaPreviewMimeType("b.mp4")).toBe("video/mp4");
  });

  it("round-trips bytes for binary paths", () => {
    const raw = new Uint8Array([1, 2, 3, 0, 4]);
    const content = bytesToFileContent("x.apk", raw);
    expect(content).toBeInstanceOf(Uint8Array);
    expect(fileContentToBytes(content)).toEqual(raw);
  });

  it("decodes utf-8 text when path is not binary", () => {
    const enc = new TextEncoder().encode("你好");
    expect(bytesToFileContent("hi.txt", enc)).toBe("你好");
  });

  it("empty-text helper", () => {
    expect(isEmptyTextContent("  ")).toBe(true);
    expect(isEmptyTextContent(new Uint8Array([1]))).toBe(false);
  });
});
