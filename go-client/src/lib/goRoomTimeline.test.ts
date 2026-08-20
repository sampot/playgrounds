import { describe, expect, it } from "vitest";
import {
  formatRoomChatClock,
  parseRoomChatSegments,
  roomChatApplyMention,
  roomChatFilterMentionTargets,
  roomChatMentionDraft,
  roomOccupancyChanges,
  roomShareCatalogChanges,
  roomSystemFileActions,
  roomSystemFileText,
  roomSystemJoinText,
  roomSystemLeaveText,
  roomSystemTvFileText,
  roomSystemTvLiveText,
  roomTvCue,
  roomTvCueChange,
} from "./goRoomTimeline";

describe("formatRoomChatClock", () => {
  it("renders local hours:minutes", () => {
    const ts = new Date(2026, 7, 19, 21, 5, 0).getTime();
    expect(formatRoomChatClock(ts)).toBe("21:05");
  });
});

describe("room chat @mentions", () => {
  const people = [
    { peerId: "a", name: "小明" },
    { peerId: "b", name: "小明華" },
    { peerId: "h", name: "太郎" },
  ];

  it("highlights the longest occupant name after @", () => {
    const parts = parseRoomChatSegments("@小明華 看一下", people);
    expect(parts).toEqual([
      { type: "mention", text: "@小明華", peerId: "b", name: "小明華" },
      { type: "text", text: " 看一下" },
    ]);
  });

  it("keeps unmatched @ as plain text", () => {
    expect(parseRoomChatSegments("hi @幽靈", people)).toEqual([
      { type: "text", text: "hi @幽靈" },
    ]);
  });

  it("reads a trailing @query from the composer", () => {
    expect(roomChatMentionDraft("哈囉 @太")).toEqual({ start: 3, query: "太" });
    expect(roomChatMentionDraft("哈囉 太郎")).toBeNull();
  });

  it("filters and inserts a member mention", () => {
    expect(roomChatFilterMentionTargets("太", people).map((p) => p.peerId)).toEqual(
      ["h"]
    );
    expect(roomChatApplyMention("哈囉 @太", 3, { name: "太郎" })).toBe(
      "哈囉 @太郎 "
    );
  });
});

describe("room occupancy system copy", () => {
  it("skips the first snapshot, then reports join and leave", () => {
    const first = [
      { peerId: "host", name: "太郎" },
      { peerId: "g1", name: "張三" },
    ];
    expect(roomOccupancyChanges(null, first)).toEqual({
      joined: [],
      left: [],
    });
    const next = [
      { peerId: "host", name: "太郎" },
      { peerId: "g1", name: "張三" },
      { peerId: "g2", name: "小華" },
    ];
    expect(roomOccupancyChanges(first, next)).toEqual({
      joined: [{ peerId: "g2", name: "小華" }],
      left: [],
    });
    expect(roomOccupancyChanges(next, first)).toEqual({
      joined: [],
      left: [{ peerId: "g2", name: "小華" }],
    });
  });

  it("writes 加入／離開 copy", () => {
    expect(roomSystemJoinText("張三")).toBe("張三 已加入包廂");
    expect(roomSystemLeaveText("張三")).toBe("張三 已離開包廂");
  });
});

describe("room file system copy", () => {
  it("skips the first catalog, then reports new shares", () => {
    const listed = [
      { id: "f1", name: "a.pdf", ownerName: "小明" },
    ];
    expect(roomShareCatalogChanges(null, listed)).toEqual([]);
    expect(
      roomShareCatalogChanges(listed, [
        ...listed,
        { id: "f2", name: "presentation.pdf", ownerName: "小明" },
      ])
    ).toEqual([{ id: "f2", name: "presentation.pdf", ownerName: "小明" }]);
  });

  it("offers 預覽／下載 from catalog consumes; skips both for the owner", () => {
    expect(roomSystemFileText("小明", "presentation.pdf")).toBe(
      "小明 上傳了 presentation.pdf"
    );
    expect(
      roomSystemFileActions({ name: "presentation.pdf", mime: "application/pdf" })
    ).toEqual({ preview: true, download: true });
    expect(roomSystemFileActions({ name: "clip.mp4", mime: "video/mp4" })).toEqual({
      preview: true,
      download: true,
    });
    expect(roomSystemFileActions({ name: "pic.png", mime: "image/png" })).toEqual({
      preview: true,
      download: true,
    });
    expect(
      roomSystemFileActions({
        name: "clip.mp4",
        mime: "video/mp4",
        mine: true,
      })
    ).toEqual({ preview: false, download: false });
  });
});

describe("room TV system copy", () => {
  const people = [
    { peerId: "host", name: "太郎" },
    { peerId: "g2", name: "小華" },
  ];

  it("treats a peer source as live, a filename as a file, empty as off", () => {
    expect(
      roomTvCue({
        tvSourcePeerId: "g2",
        programName: "小華",
        remoteProgramName: null,
        occupants: people,
      })
    ).toEqual({ kind: "live", name: "小華" });
    expect(
      roomTvCue({
        tvSourcePeerId: null,
        programName: "mv.mp4",
        remoteProgramName: null,
        occupants: people,
      })
    ).toEqual({ kind: "file", name: "mv.mp4" });
    expect(
      roomTvCue({
        tvSourcePeerId: null,
        programName: null,
        remoteProgramName: null,
        occupants: people,
      })
    ).toEqual({ kind: "off" });
  });

  it("emits a live or file cue only after the first snapshot", () => {
    const live = { kind: "live" as const, name: "小華" };
    expect(roomTvCueChange(null, live)).toBeNull();
    expect(roomTvCueChange({ kind: "off" }, live)).toEqual(live);
    expect(roomTvCueChange(live, live)).toBeNull();
    expect(roomSystemTvLiveText("主持人", "小華")).toBe(
      "主持人 已將 小華的鏡頭 推播至大螢幕"
    );
    expect(roomSystemTvFileText("主持人", "mv.mp4")).toBe(
      "主持人 已將 mv.mp4 放到大螢幕上"
    );
  });
});
