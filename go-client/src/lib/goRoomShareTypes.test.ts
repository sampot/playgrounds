import { describe, expect, it } from "vitest";
import {
  GO_ROOM_SHARE_ID_PREFIX,
  isShareDirFileId,
  shareFileIdForPath,
} from "./goRoomShareTypes";

describe("goRoomShareTypes", () => {
  it("builds stable ids from relative paths", () => {
    const a = shareFileIdForPath("movie.mp4");
    const b = shareFileIdForPath("movie.mp4");
    const c = shareFileIdForPath("other.mp4");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith(GO_ROOM_SHARE_ID_PREFIX)).toBe(true);
    expect(isShareDirFileId(a)).toBe(true);
    expect(isShareDirFileId("file-1")).toBe(false);
  });
});
