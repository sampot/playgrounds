import { describe, expect, it } from "vitest";
import {
  catalogConsumes,
  catalogPlayLabel,
  catalogTransferHint,
} from "./goRoomCatalog";

describe("catalogConsumes", () => {
  it("lets a video file be downloaded or played on the receiver, not as a live RTP stream", () => {
    expect(
      catalogConsumes({ kind: "file", mime: "video/mp4", name: "clip.mp4" })
    ).toEqual(["play", "download"]);
    expect(catalogPlayLabel({ mime: "video/mp4" })).toBe("播放");
  });

  it("calls in-progress remote play 播放中, not 傳送中", () => {
    expect(
      catalogTransferHint({ status: "transferring", playing: true })
    ).toBe("播放中");
    expect(
      catalogTransferHint({ status: "transferring", playing: false })
    ).toBe("傳送中");
    expect(catalogTransferHint({ status: "listed", playing: true })).toBe(
      "播放中"
    );
    expect(catalogTransferHint({ status: "listed", playing: false })).toBeNull();
  });

  it("does not treat a camera or mic as a catalog item", () => {
    expect(
      catalogConsumes({ kind: "device", device: "camera", name: "鏡頭" })
    ).toEqual([]);
    expect(
      catalogConsumes({ kind: "device", device: "mic", name: "麥克風" })
    ).toEqual([]);
  });

  it("does not give a directory a consume protocol", () => {
    expect(catalogConsumes({ kind: "dir", name: "album" })).toEqual([]);
  });
});
