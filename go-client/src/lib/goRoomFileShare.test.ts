import { describe, expect, it } from "vitest";
import {
  GO_ROOM_FILE_CAST,
  GO_ROOM_FILE_CANCEL,
  GO_ROOM_FILE_DELETE,
  GO_ROOM_FILE_DROP,
  GO_ROOM_FILE_FILTERS,
  GO_ROOM_FILE_FILTER_LABEL,
  GO_ROOM_FILE_ON_AIR,
  GO_ROOM_FILE_PREVIEW,
  fileShareIcon,
  fileShareKind,
  formatFileShareSize,
  roomFileDownloadMode,
  roomFileOnAir,
  roomFileShareActions,
  roomFileShareMatches,
  roomFileShareProgress,
} from "./goRoomFileShare";

describe("fileShareKind", () => {
  it("maps extensions to video, audio, image, or document", () => {
    expect(fileShareKind({ name: "clip.mp4" })).toBe("video");
    expect(fileShareKind({ mime: "video/webm", name: "x" })).toBe("video");
    expect(fileShareKind({ name: "song.mp3" })).toBe("audio");
    expect(fileShareKind({ mime: "audio/mpeg", name: "x" })).toBe("audio");
    expect(fileShareKind({ name: "pic.PNG" })).toBe("image");
    expect(fileShareKind({ mime: "image/jpeg", name: "x" })).toBe("image");
    expect(fileShareKind({ name: "notes.pdf" })).toBe("doc");
    expect(fileShareKind({ name: "readme" })).toBe("doc");
  });
});

describe("fileShareIcon", () => {
  it("uses a type emoji for cards", () => {
    expect(fileShareIcon("video")).toBe("🎬");
    expect(fileShareIcon("audio")).toBe("🎵");
    expect(fileShareIcon("doc")).toBe("📄");
    expect(fileShareIcon("image")).toBe("🖼️");
  });
});

describe("roomFileShareMatches", () => {
  it("filters 全部 | 影音 | 文件", () => {
    expect(GO_ROOM_FILE_FILTERS).toEqual(["all", "av", "doc"]);
    expect(GO_ROOM_FILE_FILTER_LABEL.all).toBe("全部");
    expect(GO_ROOM_FILE_FILTER_LABEL.av).toBe("影音");
    expect(GO_ROOM_FILE_FILTER_LABEL.doc).toBe("文件");
    expect(roomFileShareMatches("all", "video")).toBe(true);
    expect(roomFileShareMatches("av", "video")).toBe(true);
    expect(roomFileShareMatches("av", "audio")).toBe(true);
    expect(roomFileShareMatches("av", "image")).toBe(false);
    expect(roomFileShareMatches("doc", "doc")).toBe(true);
    expect(roomFileShareMatches("doc", "image")).toBe(true);
    expect(roomFileShareMatches("doc", "video")).toBe(false);
  });
});

describe("roomFileShareActions", () => {
  it("lets peers download and preview; owner skips those; only host casts; owner or host deletes", () => {
    expect(GO_ROOM_FILE_PREVIEW).toBe("預覽");
    expect(GO_ROOM_FILE_CAST).toBe("推播至大螢幕");
    expect(GO_ROOM_FILE_DELETE).toBe("撤回");
    expect(GO_ROOM_FILE_DROP).toBe("拖進來或點這裡掛上檔案");
    expect(
      roomFileShareActions({ role: "guest", mine: false, kind: "video" })
    ).toEqual({
      download: true,
      preview: true,
      cast: false,
      remove: false,
    });
    expect(
      roomFileShareActions({ role: "guest", mine: true, kind: "image" })
    ).toEqual({
      download: false,
      preview: false,
      cast: false,
      remove: true,
    });
    expect(
      roomFileShareActions({ role: "host", mine: true, kind: "video" })
    ).toEqual({
      download: false,
      preview: false,
      cast: true,
      remove: true,
    });
    expect(
      roomFileShareActions({ role: "host", mine: false, kind: "audio" })
    ).toEqual({
      download: true,
      preview: true,
      cast: true,
      remove: true,
    });
    expect(
      roomFileShareActions({ role: "host", mine: false, kind: "doc" })
    ).toEqual({
      download: true,
      preview: true,
      cast: false,
      remove: true,
    });
  });
});

describe("roomFileOnAir", () => {
  it("marks the catalog file the host put on the TV", () => {
    expect(GO_ROOM_FILE_ON_AIR).toBe("大螢幕播放中");
    expect(
      roomFileOnAir({
        fileId: "a",
        fileName: "mv.mp4",
        streamingFileId: "a",
        programName: "mv.mp4",
        liveOnTv: false,
      })
    ).toBe(true);
    expect(
      roomFileOnAir({
        fileId: "a",
        fileName: "mv.mp4",
        streamingFileId: "b",
        programName: "mv.mp4",
        liveOnTv: false,
      })
    ).toBe(false);
    expect(
      roomFileOnAir({
        fileId: "a",
        fileName: "mv.mp4",
        streamingFileId: null,
        programName: "mv.mp4",
        liveOnTv: false,
      })
    ).toBe(true);
    expect(
      roomFileOnAir({
        fileId: "a",
        fileName: "mv.mp4",
        streamingFileId: null,
        programName: "mv.mp4",
        liveOnTv: true,
      })
    ).toBe(false);
  });
});

describe("formatFileShareSize", () => {
  it("uses decimal MB／GB like Finder／Chrome (not 1024-based MiB)", () => {
    expect(formatFileShareSize(500)).toBe("500 B");
    expect(formatFileShareSize(2000)).toBe("2.0 KB");
    expect(formatFileShareSize(2_000_000)).toBe("2.0 MB");
    /** 561.1×10⁶ bytes → Finder 「561.1 MB」; 1024² would wrongly show 535.1 */
    expect(formatFileShareSize(561_100_000)).toBe("561.1 MB");
  });
});

describe("roomFileShareProgress", () => {
  it("maps hang progress to a 0–100 bar", () => {
    expect(roomFileShareProgress(0, 0)).toBe(0);
    expect(roomFileShareProgress(1, 4)).toBe(25);
    expect(roomFileShareProgress(4, 4)).toBe(100);
  });
});

describe("roomFileDownloadMode", () => {
  it("shows cancel while mid-save, save when blob bridge ready, else download", () => {
    expect(GO_ROOM_FILE_CANCEL).toBe("取消");
    expect(roomFileDownloadMode({ status: "listed" })).toBe("download");
    expect(
      roomFileDownloadMode({ status: "transferring", playing: true })
    ).toBe("download");
    expect(
      roomFileDownloadMode({ status: "transferring", playing: false })
    ).toBe("cancel");
    expect(
      roomFileDownloadMode({
        status: "transferring",
        pendingSave: true,
        playing: false,
      })
    ).toBe("save");
  });
});
