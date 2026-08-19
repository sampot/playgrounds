import { describe, expect, it, vi } from "vitest";
import {
  GO_ROOM_END_CONFIRM_HOST,
  GO_ROOM_LEAVE_CONFIRM_GUEST,
  GO_ROOM_LOGIN_HINT,
  GO_ROOM_MEDIA_OFF,
  GO_ROOM_MESH_ENABLED,
  GO_ROOM_SHARE_HINT,
  applyTvSinkVolume,
  attachMediaStream,
  attachPlaybackUrl,
  enterTvFullscreen,
  syncTvSinkPlayback,
  toggleTvFullscreen,
  tvIsFullscreen,
  GO_ROOM_TV_FULLSCREEN,
  GO_ROOM_TV_HINT_GUEST,
  GO_ROOM_TV_HINT_HOST,
  GO_ROOM_TV_OFF,
  GO_ROOM_TV_TITLE,
  isRoomInviteShareable,
  mediaTrackHasFrames,
  roomChatBoxesOverlap,
  roomChatBoxHasSize,
  roomChatDismissesOnFocusLoss,
  roomChatLayout,
  roomChatPredictedOverlayBox,
  roomChatShouldCloseOnFocusMove,
  roomChatShouldCloseOnOutsidePress,
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
  roomShortLandscape,
  roomChromeHideable,
  roomChromePeekInsetEndPx,
  roomChromeShouldHold,
  GO_ROOM_CINEMA_ENTER,
  GO_ROOM_CINEMA_EXIT,
  roomCinemaActive,
  roomCinemaAllowed,
  roomCinemaExitOnChromeReveal,
  roomCinemaHudVisible,
  roomCinemaToggleLabel,
  roomEscStep,
  roomTvClockLabel,
  roomTvHudKind,
  roomTvHudHasTransport,
  roomTvHudRestore,
  roomTvHudDefaultSink,
  roomTvVolumePanelAfterIconClick,
  roomTvSinkMuted,
  roomTvVolumeFromInput,
  roomInviteDoorRow,
  roomShowAdSlot,
  roomShellActiveTab,
  roomShellDefaultPane,
  roomShellFilesPinned,
  roomShellMode,
  roomShellPanesConcurrent,
  roomShellShowPane,
  roomShellTabPanes,
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
  it("stays quiet when the Host is alone", () => {
    expect(roomOccupantSummary({ guestCount: 0 })).toBe("");
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
  it("hides the line when the Host is alone and the TV is off", () => {
    expect(
      roomStageStatus({ guestCount: 0, tvLabel: GO_ROOM_TV_OFF })
    ).toBe("");
  });

  it("appends the TV when people are in or the set is on", () => {
    expect(
      roomStageStatus({ guestCount: 2, tvLabel: GO_ROOM_TV_OFF })
    ).toBe("3 人在 · 電視關機");
    expect(
      roomStageStatus({ guestCount: 0, tvLabel: "正在播 MTV.mp4" })
    ).toBe("正在播 MTV.mp4");
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
      "關掉後在場的人會斷線，目錄會沒了，電視與鏡頭會停，進行中的遊戲會停。已存到硬碟的檔不受影響。"
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

describe("enterTvFullscreen", () => {
  it("fullscreens the TV slot so the same HUD stays on top", async () => {
    const requestFullscreen = vi.fn(async () => {});
    expect(await enterTvFullscreen({ requestFullscreen })).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    const webkitRequestFullscreen = vi.fn(async () => {});
    expect(await enterTvFullscreen({ webkitRequestFullscreen })).toBe(true);
    expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);

    expect(await enterTvFullscreen(null)).toBe(false);
  });

  it("does not open the native video player", async () => {
    const webkitEnterFullscreen = vi.fn();
    expect(
      await enterTvFullscreen({
        requestFullscreen: async () => {
          throw new Error("denied");
        },
        webkitEnterFullscreen,
      })
    ).toBe(false);
    expect(webkitEnterFullscreen).not.toHaveBeenCalled();
    expect(await enterTvFullscreen({ webkitEnterFullscreen })).toBe(false);
  });

  it("exits the same slot fullscreen it entered", async () => {
    const slot = { requestFullscreen: vi.fn(async () => {}) };
    const exitFullscreen = vi.fn(async () => {});
    expect(
      await toggleTvFullscreen({
        container: slot,
        fullscreenElement: slot,
        exitFullscreen,
      })
    ).toBe("exited");
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(
      await toggleTvFullscreen({
        container: slot,
        fullscreenElement: null,
      })
    ).toBe("entered");
    expect(tvIsFullscreen(slot, slot)).toBe(true);
    expect(tvIsFullscreen(slot, {})).toBe(false);
  });

  it("resumes the TV sink after native pause without touching the program clock", () => {
    const play = vi.fn(async () => {});
    const el = { paused: true, play };
    syncTvSinkPlayback(el);
    expect(play).toHaveBeenCalledTimes(1);
    syncTvSinkPlayback({ paused: false, play });
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("room TV copy", () => {
  it("names the booth TV panel, not the share catalog", () => {
    expect(GO_ROOM_TV_TITLE).toBe("包廂電視");
    expect(GO_ROOM_TV_FULLSCREEN).toBe("全螢幕");
    expect(GO_ROOM_TV_HINT_HOST).toContain("檔案區");
    expect(GO_ROOM_TV_HINT_HOST).toContain("放到電視上");
    expect(GO_ROOM_TV_HINT_GUEST).toContain("主持");
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

describe("roomShortLandscape", () => {
  it("is compact on a phone landscape viewport", () => {
    expect(roomShortLandscape({ widthPx: 844, heightPx: 390 })).toBe(true);
    expect(roomShortLandscape({ widthPx: 667, heightPx: 375 })).toBe(true);
  });

  it("stays stacked on phone portrait and laptop height", () => {
    expect(roomShortLandscape({ widthPx: 390, heightPx: 844 })).toBe(false);
    expect(roomShortLandscape({ widthPx: 1440, heightPx: 900 })).toBe(false);
  });
});

describe("roomShellMode", () => {
  it("defaults to portrait on a phone", () => {
    expect(roomShellMode({ widthPx: 390, heightPx: 844 })).toBe("portrait");
    expect(roomShellMode({ widthPx: 767, heightPx: 1024 })).toBe("portrait");
    expect(roomShellPanesConcurrent("portrait")).toBe(false);
    expect(roomShellFilesPinned("portrait")).toBe(false);
    expect(roomShellTabPanes("portrait")).toEqual([
      "members",
      "files",
      "chat",
    ]);
    expect(roomShellDefaultPane()).toBe("members");
  });

  it("uses a short-landscape split on a phone on its side, with three tabs", () => {
    expect(roomShellMode({ widthPx: 667, heightPx: 375 })).toBe(
      "short-landscape"
    );
    expect(roomShellMode({ widthPx: 844, heightPx: 390 })).toBe(
      "short-landscape"
    );
    expect(roomShellPanesConcurrent("short-landscape")).toBe(false);
    expect(roomShellFilesPinned("short-landscape")).toBe(false);
    expect(roomShellTabPanes("short-landscape")).toEqual([
      "members",
      "files",
      "chat",
    ]);
  });

  it("uses the desktop right rail from 768px when height is not scarce", () => {
    expect(roomShellMode({ widthPx: 768, heightPx: 1024 })).toBe("desktop");
    expect(roomShellPanesConcurrent("desktop")).toBe(false);
    expect(roomShellFilesPinned("desktop")).toBe(true);
    expect(roomShellTabPanes("desktop")).toEqual(["members", "chat"]);
  });

  it("pins files on the desktop rail and tabs members with chat", () => {
    expect(roomShellMode({ widthPx: 1440, heightPx: 900 })).toBe("desktop");
    expect(roomShellPanesConcurrent("desktop")).toBe(false);
    expect(roomShellFilesPinned("desktop")).toBe(true);
    expect(roomShellTabPanes("desktop")).toEqual(["members", "chat"]);
    expect(
      roomShellShowPane({
        target: "files",
        pane: "members",
        concurrent: false,
        filesPinned: true,
      })
    ).toBe(true);
    expect(
      roomShellShowPane({
        target: "members",
        pane: "files",
        concurrent: false,
        filesPinned: true,
      })
    ).toBe(true);
    expect(
      roomShellShowPane({
        target: "chat",
        pane: "members",
        concurrent: false,
        filesPinned: true,
      })
    ).toBe(false);
    expect(
      roomShellShowPane({
        target: "chat",
        pane: "chat",
        concurrent: false,
        filesPinned: true,
      })
    ).toBe(true);
    expect(roomShellActiveTab("files", true)).toBe("members");
    expect(roomShellActiveTab("chat", true)).toBe("chat");
    expect(roomShellActiveTab("files", false)).toBe("files");
  });
});

describe("roomChromePeekInsetEndPx", () => {
  it("keeps the top-edge peek off the short-landscape tab rail", () => {
    expect(
      roomChromePeekInsetEndPx({
        mode: "short-landscape",
        cinema: false,
        viewportWidthPx: 844,
        railLeftPx: 500,
      })
    ).toBe(344);
  });

  it("stays full-width in cinema", () => {
    expect(
      roomChromePeekInsetEndPx({
        mode: "short-landscape",
        cinema: true,
        viewportWidthPx: 844,
        railLeftPx: 500,
      })
    ).toBe(0);
    expect(
      roomChromePeekInsetEndPx({
        mode: "desktop",
        cinema: true,
        viewportWidthPx: 1440,
        railLeftPx: 1120,
      })
    ).toBe(0);
    expect(
      roomChromePeekInsetEndPx({
        mode: "portrait",
        cinema: false,
        viewportWidthPx: 390,
        railLeftPx: 0,
      })
    ).toBe(0);
  });

  it("also leaves the desktop right rail uncovered", () => {
    expect(
      roomChromePeekInsetEndPx({
        mode: "desktop",
        cinema: false,
        viewportWidthPx: 1440,
        railLeftPx: 1120,
      })
    ).toBe(320);
  });
});

describe("roomChromeHideable", () => {
  it("hides chrome only on the live booth surface", () => {
    expect(
      roomChromeHideable({
        role: "host",
        phase: "open",
        loggedIn: true,
        inBooth: true,
      })
    ).toBe(true);
    expect(
      roomChromeHideable({
        role: "guest",
        phase: "ready",
        loggedIn: false,
        inBooth: true,
      })
    ).toBe(true);
  });

  it("keeps chrome up for login, connecting, and ended", () => {
    expect(
      roomChromeHideable({
        role: "host",
        phase: "idle",
        loggedIn: false,
        inBooth: false,
      })
    ).toBe(false);
    expect(
      roomChromeHideable({
        role: "guest",
        phase: "connecting",
        loggedIn: false,
        inBooth: false,
      })
    ).toBe(false);
    expect(
      roomChromeHideable({
        role: "host",
        phase: "ended",
        loggedIn: true,
        inBooth: false,
      })
    ).toBe(false);
  });
});

describe("roomChromeShouldHold", () => {
  it("pauses auto-hide while a sheet or overlay is in the way", () => {
    expect(roomChromeShouldHold({ shareOpen: true })).toBe(true);
    expect(roomChromeShouldHold({ confirmOpen: true })).toBe(true);
    expect(roomChromeShouldHold({ overlayOpen: true })).toBe(true);
    expect(roomChromeShouldHold({ drawerOpen: true })).toBe(true);
    expect(roomChromeShouldHold({})).toBe(false);
  });

  it("does not pause auto-hide when the chat composer is focused", () => {
    expect(roomChromeShouldHold({ composerFocused: true })).toBe(false);
    expect(
      roomChromeShouldHold({ composerFocused: true, shareOpen: true })
    ).toBe(true);
  });
});

describe("room cinema shell", () => {
  it("stays in the hall until the booth is live", () => {
    expect(
      roomCinemaAllowed({ inBooth: false, phase: "connecting" })
    ).toBe(false);
    expect(roomCinemaAllowed({ inBooth: true, phase: "open" })).toBe(true);
  });

  it("stays in the hall until the user hides the control panel", () => {
    expect(
      roomCinemaActive({ allowed: true, userEnter: false })
    ).toBe(false);
    expect(
      roomCinemaActive({ allowed: true, userEnter: true })
    ).toBe(true);
    expect(
      roomCinemaActive({ allowed: false, userEnter: true })
    ).toBe(false);
  });

  it("labels the dock toggle as hide vs show the control panel", () => {
    expect(roomCinemaToggleLabel(false)).toBe(GO_ROOM_CINEMA_ENTER);
    expect(roomCinemaToggleLabel(true)).toBe(GO_ROOM_CINEMA_EXIT);
  });

  it("hides the hall panel while cinema is on", () => {
    expect(roomCinemaHudVisible({ cinema: false })).toBe(true);
    expect(roomCinemaHudVisible({ cinema: true })).toBe(false);
  });

  it("leaves cinema when overlay chrome comes back", () => {
    expect(
      roomCinemaExitOnChromeReveal({ cinema: true, chromeHidden: true })
    ).toBe(false);
    expect(
      roomCinemaExitOnChromeReveal({ cinema: true, chromeHidden: false })
    ).toBe(true);
    expect(
      roomCinemaExitOnChromeReveal({ cinema: false, chromeHidden: false })
    ).toBe(false);
  });

  it("floats on the TV when idle, and hides while the program is streaming", () => {
    expect(roomShowAdSlot({})).toBe(true);
    expect(roomShowAdSlot({ inBooth: true, tvOn: false })).toBe(true);
    expect(roomShowAdSlot({ tvOn: true })).toBe(false);
    expect(roomShowAdSlot({ inBooth: false })).toBe(false);
    expect(roomShowAdSlot({ shortLandscape: true })).toBe(true);
  });

  it("keeps hall pane geometry independent of cinema", () => {
    expect(roomShellPanesConcurrent("desktop", true)).toBe(false);
    expect(roomShellFilesPinned("desktop", true)).toBe(true);
    expect(roomShellTabPanes("desktop", true)).toEqual(["members", "chat"]);
    expect(roomShellPanesConcurrent("desktop")).toBe(false);
    expect(roomShellFilesPinned("desktop")).toBe(true);
    expect(roomShellTabPanes("portrait", true)).toEqual([
      "members",
      "files",
      "chat",
    ]);
  });
});

describe("roomEscStep", () => {
  it("closes overlays before shrinking cinema, then asks to leave", () => {
    expect(roomEscStep({ shareOpen: true, cinema: true })).toBe("close-share");
    expect(roomEscStep({ tvHudOpen: true, cinema: true })).toBe("close-tv-hud");
    expect(roomEscStep({ selectedPeerId: "p", cinema: true })).toBe(
      "clear-peer"
    );
    expect(roomEscStep({ cinema: true, drawerOpen: true })).toBe(
      "close-drawer"
    );
    expect(roomEscStep({ cinema: true })).toBe("exit-cinema");
    expect(roomEscStep({})).toBe("confirm-end");
  });
});

describe("room TV HUD", () => {
  it("keeps host file transport on the picture, not a bottom sheet", () => {
    expect(roomTvHudKind({ tvOn: false })).toBe("none");
    expect(
      roomTvHudKind({ tvOn: true, role: "host", fileTransport: true })
    ).toBe("host-file");
    expect(
      roomTvHudKind({ tvOn: true, role: "host", fileTransport: false })
    ).toBe("watch");
    expect(roomTvHudKind({ tvOn: true, role: "guest" })).toBe("watch");
    expect(roomTvHudHasTransport("host-file")).toBe(true);
    expect(roomTvHudHasTransport("watch")).toBe(false);
    expect(roomTvHudHasTransport("none")).toBe(false);
  });

  it("shows restore while the TV already fills the screen", () => {
    expect(roomTvHudRestore({ slotFullscreen: true })).toBe(true);
    expect(roomTvHudRestore({ cinema: true })).toBe(true);
    expect(roomTvHudRestore({})).toBe(false);
  });

  it("keeps the volume slider behind the speaker until that control is used", () => {
    expect(roomTvVolumePanelAfterIconClick(false)).toBe(true);
    expect(roomTvVolumePanelAfterIconClick(true)).toBe(false);
  });

  it("starts the speaker at full volume, matching the slider", () => {
    const sink = roomTvHudDefaultSink();
    expect(sink.volume).toBe(1);
    expect(sink.muted).toBe(false);
    expect(roomTvSinkMuted(sink.volume, sink.muted)).toBe(false);
  });

  it("clamps local TV volume and treats zero as muted", () => {
    expect(roomTvVolumeFromInput(0.4)).toBe(0.4);
    expect(roomTvVolumeFromInput(1.8)).toBe(1);
    expect(roomTvVolumeFromInput(-2)).toBe(0);
    expect(roomTvSinkMuted(0.5, false)).toBe(false);
    expect(roomTvSinkMuted(0, false)).toBe(true);
    expect(roomTvSinkMuted(1, true)).toBe(true);
    const el = { volume: 1, muted: false };
    applyTvSinkVolume(el, { volume: 0.25, muted: false });
    expect(el.volume).toBe(0.25);
    expect(el.muted).toBe(false);
    applyTvSinkVolume(el, { volume: 0, muted: false });
    expect(el.muted).toBe(true);
  });

  it("formats a compact clock without stacking titles on the picture", () => {
    expect(roomTvClockLabel(0)).toBe("0:00");
    expect(roomTvClockLabel(65.2)).toBe("1:05");
    expect(roomTvClockLabel(Number.NaN)).toBe("0:00");
  });
});

describe("roomInviteDoorRow", () => {
  it("keeps the door as a small status, not a hero QR", () => {
    expect(roomInviteDoorRow({ door: "none" })).toEqual({
      label: "還沒發邀請",
      action: "請人進來",
    });
    expect(
      roomInviteDoorRow({ door: "live", remainLabel: "還有 4:32" })
    ).toEqual({
      label: "邀請有效 · 還有 4:32",
      action: "顯示邀請",
    });
    expect(roomInviteDoorRow({ door: "expired" })).toEqual({
      label: "邀請已過期",
      action: "再發一張",
    });
  });
});

describe("room chat overlay vs canvas", () => {
  const phoneCanvas = { left: 16, right: 374, top: 80, bottom: 304 };
  const wideCanvas = { left: 396, right: 1004, top: 80, bottom: 460 };

  it("treats chat as a covering drawer when the overlay overlaps the canvas", () => {
    const overlay = roomChatPredictedOverlayBox({
      viewportWidthPx: 390,
      viewportHeightPx: 844,
      chromeHeightPx: 60,
    });
    expect(roomChatBoxesOverlap(phoneCanvas, overlay)).toBe(true);
    expect(roomChatLayout(true)).toBe("drawer");
  });

  it("keeps a right overlay when the panel sits in the empty margin", () => {
    const overlay = roomChatPredictedOverlayBox({
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
      chromeHeightPx: 60,
    });
    expect(overlay.left).toBe(1048);
    expect(roomChatBoxesOverlap(wideCanvas, overlay)).toBe(false);
    expect(roomChatLayout(false)).toBe("sidebar");
  });

  it("still covers a centered canvas at 1024px — a 22rem rail does not fit beside 40rem", () => {
    const overlay = roomChatPredictedOverlayBox({
      viewportWidthPx: 1024,
      viewportHeightPx: 768,
      chromeHeightPx: 60,
    });
    const canvas = { left: 208, right: 816, top: 80, bottom: 460 };
    expect(roomChatBoxesOverlap(canvas, overlay)).toBe(true);
  });

  it("does not treat an unmeasured canvas as clear of the overlay", () => {
    const empty = { left: 0, right: 0, top: 0, bottom: 0 };
    expect(roomChatBoxHasSize(empty)).toBe(false);
    expect(roomChatBoxHasSize(phoneCanvas)).toBe(true);
  });

  it("dismisses on focus loss only while the overlay covers the canvas", () => {
    expect(roomChatDismissesOnFocusLoss(false)).toBe(false);
    expect(roomChatDismissesOnFocusLoss(true)).toBe(true);
    expect(
      roomChatShouldCloseOnFocusMove({
        coversCanvas: false,
        panelContainsNext: false,
        nextIsNull: true,
      })
    ).toBe(false);
    expect(
      roomChatShouldCloseOnFocusMove({
        coversCanvas: true,
        panelContainsNext: true,
        nextIsNull: false,
      })
    ).toBe(false);
    expect(
      roomChatShouldCloseOnFocusMove({
        coversCanvas: true,
        panelContainsNext: false,
        nextIsNull: false,
      })
    ).toBe(true);
    expect(
      roomChatShouldCloseOnFocusMove({
        coversCanvas: true,
        panelContainsNext: false,
        nextIsNull: true,
      })
    ).toBe(true);
    expect(
      roomChatShouldCloseOnFocusMove({
        coversCanvas: true,
        panelContainsNext: false,
        nextIsNull: true,
        lostControlRemoved: true,
      })
    ).toBe(false);
    expect(
      roomChatShouldCloseOnOutsidePress({
        coversCanvas: false,
        pressInsidePanel: false,
        pressOnToggle: false,
      })
    ).toBe(false);
    expect(
      roomChatShouldCloseOnOutsidePress({
        coversCanvas: true,
        pressInsidePanel: true,
        pressOnToggle: false,
      })
    ).toBe(false);
    expect(
      roomChatShouldCloseOnOutsidePress({
        coversCanvas: true,
        pressInsidePanel: false,
        pressOnToggle: true,
      })
    ).toBe(false);
    expect(
      roomChatShouldCloseOnOutsidePress({
        coversCanvas: true,
        pressInsidePanel: false,
        pressOnToggle: false,
      })
    ).toBe(true);
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
