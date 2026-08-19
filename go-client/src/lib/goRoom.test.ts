import { describe, expect, it, vi } from "vitest";
import {
  GO_ROOM_END_CONFIRM_HOST,
  GO_ROOM_LEAVE_CONFIRM_GUEST,
  GO_ROOM_LOGIN_HINT,
  GO_ROOM_MEDIA_OFF,
  GO_ROOM_MESH_ENABLED,
  GO_ROOM_SHARE_HINT,
  attachMediaStream,
  attachPlaybackUrl,
  GO_ROOM_TV_OFF,
  isRoomInviteShareable,
  mediaTrackHasFrames,
  roomChatWhoLabel,
  roomHostDisplayName,
  roomInviteDoor,
  roomInviteRemainLabel,
  roomMediaSummary,
  roomOccupantCount,
  roomOccupancyFromSnapshot,
  roomOccupantRows,
  roomOccupantSummary,
  roomRemoteSinkVisible,
  roomStageStatus,
  roomTvLabel,
  roomTvStream,
  takePickedFiles,
} from "./goRoom";

function liveFileInput(initial: File[]) {
  let stored = [...initial];
  return {
    get files(): FileList | null {
      const list: Record<PropertyKey, unknown> = {
        length: stored.length,
        item: (i: number) => stored[i] ?? null,
        [Symbol.iterator]: function* () {
          yield* stored;
        },
      };
      stored.forEach((f, i) => {
        list[i] = f;
      });
      return list as unknown as FileList;
    },
    set value(v: string) {
      if (v === "") stored = [];
    },
    get value() {
      return stored.length ? "C:\\fakepath\\note.txt" : "";
    },
  };
}

describe("roomOccupantSummary", () => {
  it("treats the Host alone as already in the booth", () => {
    expect(roomOccupantSummary({ guestCount: 0 })).toBe(
      "就你一個人 · 把這頁開著，這一間才還在"
    );
  });

  it("counts Host plus guests, not 1:1", () => {
    expect(roomOccupantSummary({ guestCount: 1 })).toBe("2 人在");
    expect(roomOccupantSummary({ guestCount: 2 })).toBe("3 人在");
  });
});

describe("room occupancy", () => {
  it("counts Host plus guests, including three or more", () => {
    expect(roomOccupantCount(0)).toBe(1);
    expect(roomOccupantCount(1)).toBe(2);
    expect(roomOccupantCount(2)).toBe(3);
  });
});

describe("roomOccupancyFromSnapshot", () => {
  it("lets a Guest count the third person without listing themselves twice", () => {
    expect(
      roomOccupancyFromSnapshot({
        localPeerId: "g-a",
        occupants: [
          { peerId: "host-1", name: "太郎" },
          { peerId: "g-a", name: "甲" },
          { peerId: "g-b", name: "乙" },
        ],
      })
    ).toEqual({
      guestCount: 2,
      occupantPeers: [
        { peerId: "host-1", name: "太郎" },
        { peerId: "g-b", name: "乙" },
      ],
    });
  });
});

describe("roomMediaSummary", () => {
  it("summarizes the local live stream, not a catalog file", () => {
    expect(roomMediaSummary({ camera: true, mic: true })).toBe(
      "鏡頭已開 · 等對方收看"
    );
    expect(
      roomMediaSummary({
        camera: false,
        mic: false,
        watching: true,
      })
    ).toBe("正在收看鏡頭");
    expect(
      roomMediaSummary({
        camera: false,
        mic: true,
        listening: true,
      })
    ).toBe("正在收聽");
    expect(roomMediaSummary({ camera: false, mic: true })).toBe(
      "麥克風已開 · 等對方收聽"
    );
    expect(roomMediaSummary({ camera: false, mic: false })).toBe(
      GO_ROOM_MEDIA_OFF
    );
    expect(
      roomMediaSummary({ camera: false, mic: false, display: true })
    ).toBe("畫面已開 · 等對方收看");
  });
});

describe("roomTvLabel", () => {
  it("names the shared TV, not a private player", () => {
    expect(roomTvLabel({})).toBe(GO_ROOM_TV_OFF);
    expect(roomTvLabel({ programName: "MTV.mp4" })).toBe("正在播 MTV.mp4");
    expect(roomTvLabel({ remoteProgramName: "clip.webm" })).toBe(
      "正在播 clip.webm"
    );
    expect(roomTvLabel({ sourceName: "小明" })).toBe("電視上是 小明");
  });
});

describe("roomTvStream", () => {
  it("prefers the remote program RTP over the local capture", () => {
    const remote = { id: "remote" } as unknown as MediaStream;
    const local = { id: "local" } as unknown as MediaStream;
    expect(roomTvStream({ programStream: remote, localProgramStream: local })).toBe(
      remote
    );
    expect(roomTvStream({ programStream: null, localProgramStream: local })).toBe(
      local
    );
    expect(roomTvStream({ programStream: null, localProgramStream: null })).toBeNull();
  });
});

describe("roomStageStatus", () => {
  it("keeps the alone line when the TV is off", () => {
    expect(
      roomStageStatus({ guestCount: 0, tvLabel: GO_ROOM_TV_OFF })
    ).toBe("就你一個人 · 把這頁開著，這一間才還在");
  });

  it("appends the TV when people are in or the set is on", () => {
    expect(
      roomStageStatus({ guestCount: 2, tvLabel: GO_ROOM_TV_OFF })
    ).toBe("3 人在 · 電視關機");
    expect(
      roomStageStatus({ guestCount: 0, tvLabel: "正在播 MTV.mp4" })
    ).toBe("就你一個人 · 把這頁開著，這一間才還在 · 正在播 MTV.mp4");
  });
});

describe("roomRemoteSinkVisible", () => {
  it("hides the bound remote live video until the user asks to watch", () => {
    expect(roomRemoteSinkVisible({})).toBe(false);
    expect(roomRemoteSinkVisible({ watching: false, listening: false })).toBe(
      false
    );
    expect(roomRemoteSinkVisible({ watching: true })).toBe(true);
    expect(roomRemoteSinkVisible({ listening: true })).toBe(true);
  });
});

describe("roomOccupantRows", () => {
  it("puts camera and mic on the person, not as catalog files", () => {
    const rows = roomOccupantRows({
      localPeerId: "host",
      localName: "太郎",
      localLiveVideo: true,
      localLiveAudio: true,
      others: [{ peerId: "g-a", name: "小明" }],
      remoteLives: [{ peerId: "g-a", camera: true, mic: false }],
    });
    expect(rows).toEqual([
      {
        peerId: "host",
        name: "太郎",
        mine: true,
        liveVideo: true,
        liveAudio: true,
      },
      {
        peerId: "g-a",
        name: "小明",
        mine: false,
        liveVideo: true,
        liveAudio: false,
      },
    ]);
  });
});

describe("GO_ROOM_MESH_ENABLED", () => {
  it("keeps Guest↔Guest mesh off so Hub star is the only path", () => {
    expect(GO_ROOM_MESH_ENABLED).toBe(false);
  });
});

describe("roomInviteDoor", () => {
  it("is none until a live short URL exists", () => {
    expect(
      roomInviteDoor({ shortUrl: null, expiresAt: null, expired: false })
    ).toBe("none");
  });

  it("is live only while the short URL is unexpired", () => {
    expect(
      roomInviteDoor({
        shortUrl: "https://go.samkuo.me/i/abc",
        expiresAt: Date.now() + 60_000,
        expired: false,
      })
    ).toBe("live");
  });

  it("is expired after TTL even if a stale URL is still held", () => {
    expect(
      roomInviteDoor({
        shortUrl: "https://go.samkuo.me/i/abc",
        expiresAt: Date.now() - 1,
        expired: true,
      })
    ).toBe("expired");
    expect(
      isRoomInviteShareable({
        shortUrl: "https://go.samkuo.me/i/abc",
        expiresAt: Date.now() - 1,
      })
    ).toBe(false);
  });
});

describe("roomInviteRemainLabel", () => {
  it("counts down a live door without calling it the booth", () => {
    expect(roomInviteRemainLabel(Date.now() + 65_000, Date.now())).toBe(
      "還有 1:05"
    );
    expect(roomInviteRemainLabel(Date.now() - 1, Date.now())).toBe("已過期");
    expect(roomInviteRemainLabel(null)).toBe("");
  });
});

describe("roomHostDisplayName", () => {
  it("uses the logged-in profile label", () => {
    expect(roomHostDisplayName({ label: " 太郎 " })).toBe("太郎");
  });

  it("falls back to 主持 when login has no label", () => {
    expect(roomHostDisplayName(null)).toBe("主持");
    expect(roomHostDisplayName({ label: "   " })).toBe("主持");
  });
});

describe("roomChatWhoLabel", () => {
  it("keeps 我 for local bubbles", () => {
    expect(
      roomChatWhoLabel({ local: true, host: true, name: "太郎" })
    ).toBe("我");
  });

  it("shows the host login name next to the 主持 mark", () => {
    expect(
      roomChatWhoLabel({ local: false, host: true, name: "太郎" })
    ).toBe("太郎");
  });

  it("omits a duplicate name when the host has none", () => {
    expect(roomChatWhoLabel({ local: false, host: true, name: "" })).toBe("");
  });

  it("labels guests by their name", () => {
    expect(
      roomChatWhoLabel({ local: false, host: false, name: "小明" })
    ).toBe("小明");
    expect(roomChatWhoLabel({ local: false, host: false })).toBe("對方");
  });
});

describe("booth copy", () => {
  it("tells a second device to scan the live invite instead of opening /room", () => {
    expect(GO_ROOM_SHARE_HINT).toContain(
      "另一台裝置請掃這張邀請進來，不要再開一間包廂。"
    );
    expect(GO_ROOM_LOGIN_HINT).toContain("另一台裝置請掃邀請進來。");
  });

  it("warns that hung items and live pulls stop when the Host ends the booth", () => {
    expect(GO_ROOM_END_CONFIRM_HOST).toBe(
      "關掉後在場的人會斷線，目錄會沒了，電視與鏡頭會停。已存到硬碟的檔不受影響。"
    );
    expect(GO_ROOM_LEAVE_CONFIRM_GUEST).toBe(
      "離開後你會斷線；其他人還在。你掛上的項目會從分享區拿掉。"
    );
  });
});

describe("mediaTrackHasFrames", () => {
  it("treats a muted transceiver placeholder as empty", () => {
    const t = {
      readyState: "live",
      muted: true,
      getSettings: () => ({}),
    } as MediaStreamTrack;
    expect(mediaTrackHasFrames(t)).toBe(false);
  });

  it("treats an unmuted live track as having frames", () => {
    const t = {
      readyState: "live",
      muted: false,
    } as MediaStreamTrack;
    expect(mediaTrackHasFrames(t)).toBe(true);
  });
});

describe("attachPlaybackUrl", () => {
  it("does not reassign src when the playback URL is unchanged", async () => {
    const play = vi.fn(async () => {});
    const assigned: string[] = [];
    const el = {
      paused: true,
      muted: false,
      play,
      _src: "",
      get src() {
        return this._src;
      },
      set src(v: string) {
        assigned.push(v);
        this._src = v;
      },
    };
    const url = "blob:play-1";
    attachPlaybackUrl(el, url);
    el.paused = false;
    attachPlaybackUrl(el, url);
    attachPlaybackUrl(el, url);
    expect(assigned).toEqual([url]);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("mutes and retries when autoplay with audio is blocked", async () => {
    const play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    const el = { src: "", paused: true, muted: false, play };
    attachPlaybackUrl(el, "blob:play-2");
    await vi.waitFor(() => {
      expect(el.muted).toBe(true);
    });
    expect(play).toHaveBeenCalledTimes(2);
  });
});

describe("attachMediaStream", () => {
  it("keeps the same srcObject and plays when the stream is unchanged", async () => {
    const stream = {} as MediaStream;
    const play = vi.fn(async () => {});
    const el = { srcObject: stream, paused: true, muted: false, play };
    attachMediaStream(el, stream);
    expect(el.srcObject).toBe(stream);
    expect(play).toHaveBeenCalledTimes(1);
    el.paused = false;
    attachMediaStream(el, stream);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("mutes and retries when autoplay with audio is blocked", async () => {
    const stream = {} as MediaStream;
    const play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    const el = { srcObject: null as MediaStream | null, paused: true, muted: false, play };
    attachMediaStream(el, stream);
    await vi.waitFor(() => {
      expect(el.muted).toBe(true);
    });
    expect(play).toHaveBeenCalledTimes(2);
  });
});

describe("takePickedFiles", () => {
  it("copies files before resetting the live input FileList", () => {
    const file = new File(["hi"], "note.txt", { type: "text/plain" });
    const input = liveFileInput([file]);
    const held = input.files;
    input.value = "";
    expect(Array.from(held ?? [])).toHaveLength(0);

    const again = liveFileInput([file]);
    const picked = takePickedFiles(again);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.name).toBe("note.txt");
    expect(Array.from(again.files ?? [])).toHaveLength(0);
  });
});
