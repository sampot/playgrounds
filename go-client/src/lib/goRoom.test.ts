import { describe, expect, it } from "vitest";
import {
  GO_ROOM_CAMERA_PAIR_ONLY,
  GO_ROOM_END_CONFIRM_HOST,
  GO_ROOM_LOGIN_HINT,
  GO_ROOM_MEDIA_OFF,
  GO_ROOM_SHARE_HINT,
  isRoomInviteShareable,
  roomCameraAllowed,
  roomChatWhoLabel,
  roomHostDisplayName,
  roomInviteDoor,
  roomInviteRemainLabel,
  roomMediaSummary,
  roomOccupantCount,
  roomOccupantSummary,
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

describe("room camera occupancy", () => {
  it("allows the camera only when exactly two people are in", () => {
    expect(roomOccupantCount(0)).toBe(1);
    expect(roomOccupantCount(1)).toBe(2);
    expect(roomCameraAllowed(1)).toBe(false);
    expect(roomCameraAllowed(2)).toBe(true);
    expect(roomCameraAllowed(3)).toBe(false);
  });
});

describe("roomMediaSummary", () => {
  it("prefers the program name over camera, and uses the off line when idle", () => {
    expect(
      roomMediaSummary({ camera: true, mic: true, programName: "片.mp4" })
    ).toBe("正在播出 · 片.mp4");
    expect(
      roomMediaSummary({ camera: true, mic: false, programName: null })
    ).toBe("鏡頭已開 · 等對方收看");
    expect(
      roomMediaSummary({
        camera: false,
        mic: false,
        programName: null,
        watching: true,
      })
    ).toBe("正在收看鏡頭");
    expect(
      roomMediaSummary({ camera: false, mic: true, programName: null })
    ).toBe("麥克風開著");
    expect(
      roomMediaSummary({ camera: false, mic: false, programName: null })
    ).toBe(GO_ROOM_MEDIA_OFF);
    expect(GO_ROOM_CAMERA_PAIR_ONLY).toBe("鏡頭只在兩人時");
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

  it("warns that camera and cast stop when the Host ends the booth", () => {
    expect(GO_ROOM_END_CONFIRM_HOST).toBe(
      "關掉後在場的人會斷線，目錄會沒了，鏡頭與投放會停。已存到硬碟的檔不受影響。"
    );
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
