import { describe, expect, it, vi } from "vitest";
import {
  GO_ROOM_END_CONFIRM_HOST,
  GO_ROOM_GATE_BODY,
  GO_ROOM_LEAVE_CONFIRM_GUEST,
  GO_ROOM_LOGIN_HINT,
  GO_ROOM_CAST_SOURCE_UNSUPPORTED,
  GO_ROOM_CAST_UNSUPPORTED,
  GO_ROOM_MEDIA_OFF,
  GO_ROOM_MESH_ENABLED,
  GO_ROOM_SHARE_HINT,
  allowCanvasProgramCaptureFallback,
  goRoomCastCaptureError,
  htmlMediaCaptureStreamSupported,
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
  roomHostMemberMenu,
  roomMemberAvatarInitial,
  roomMemberCard,
  roomMemberCardsSorted,
  roomMemberOnAir,
  roomMemberShowsDirectLink,
  roomOccupantRows,
  GO_ROOM_FORCE_CAMERA_OFF,
  GO_ROOM_FORCE_MUTE,
  GO_ROOM_KICK,
  GO_ROOM_PUT_ON_TV,
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
  roomTvVolumeIconClick,
  roomTvVolumePanelAfterIconClick,
  roomTvSinkMuted,
  roomTvVolumeFromInput,
  roomInviteDoorRow,
  roomHostLoginGate,
  roomShowAdSlot,
  roomTvStatusGate,
  roomShellActiveTab,
  roomShellDefaultPane,
  roomShellFilesPinned,
  roomShellMode,
  roomShellPanesConcurrent,
  roomShellShowPane,
  roomShellTabPanes,
  ROOM_SHELL_WIDE_MIN_PX,
  roomStageStatus,
  roomTvBindStream,
  roomTvLabel,
  roomTvPictureOn,
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
    expect(roomTvLabel({ sourceName: "小明" })).toBe("大螢幕上是 小明");
  });
});

describe("roomTvPictureOn", () => {
  it("is off when there is no offered program name", () => {
    expect(roomTvPictureOn({})).toBe(false);
    expect(roomTvPictureOn({ programName: null, remoteProgramName: "  " })).toBe(
      false
    );
  });

  it("is on when the host or a remote peer has offered a program", () => {
    expect(roomTvPictureOn({ programName: "MTV.mp4" })).toBe(true);
    expect(roomTvPictureOn({ remoteProgramName: "鏡頭" })).toBe(true);
  });
});

describe("roomTvBindStream", () => {
  it("drops a leftover RTP stream when the TV has no signal", () => {
    const remote = {
      id: "remote",
      getTracks: () => [
        { readyState: "live", muted: false } as MediaStreamTrack,
      ],
    } as unknown as MediaStream;
    expect(
      roomTvBindStream({
        programStream: remote,
        localProgramStream: null,
        programName: null,
        remoteProgramName: null,
      })
    ).toBeNull();
    expect(
      roomTvBindStream({
        programStream: remote,
        remoteProgramName: "MTV.mp4",
      })
    ).toBe(remote);
  });
});

describe("roomTvStream", () => {
  it("prefers the remote program RTP over the local capture", () => {
    const remoteTrack = {
      readyState: "live",
      muted: false,
    } as MediaStreamTrack;
    const localTrack = {
      readyState: "live",
      muted: false,
    } as MediaStreamTrack;
    const remote = {
      id: "remote",
      getTracks: () => [remoteTrack],
    } as unknown as MediaStream;
    const local = {
      id: "local",
      getTracks: () => [localTrack],
    } as unknown as MediaStream;
    expect(roomTvStream({ programStream: remote, localProgramStream: local })).toBe(
      remote
    );
    expect(roomTvStream({ programStream: null, localProgramStream: local })).toBe(
      local
    );
    expect(roomTvStream({ programStream: null, localProgramStream: null })).toBeNull();
  });

  it("falls back to the local capture when the remote program is only a muted placeholder", () => {
    const emptyRemote = {
      id: "remote-empty",
      getTracks: () => [
        {
          readyState: "live",
          muted: true,
          getSettings: () => ({}),
        } as MediaStreamTrack,
      ],
    } as unknown as MediaStream;
    const local = {
      id: "local",
      getTracks: () => [
        {
          readyState: "live",
          muted: false,
        } as MediaStreamTrack,
      ],
    } as unknown as MediaStream;
    expect(
      roomTvStream({ programStream: emptyRemote, localProgramStream: local })
    ).toBe(local);
  });

  it("still binds a muted remote program for joiners who have no local capture", () => {
    const mutedRemote = {
      id: "joiner-remote",
      getTracks: () => [
        {
          readyState: "live",
          muted: true,
          getSettings: () => ({}),
        } as MediaStreamTrack,
      ],
    } as unknown as MediaStream;
    expect(
      roomTvStream({ programStream: mutedRemote, localProgramStream: null })
    ).toBe(mutedRemote);
  });
});

describe("roomStageStatus", () => {
  it("hides the line when the Host is alone and there is no signal", () => {
    expect(
      roomStageStatus({ guestCount: 0, tvLabel: GO_ROOM_TV_OFF })
    ).toBe("");
  });

  it("appends the TV when people are in or the set is on", () => {
    expect(
      roomStageStatus({ guestCount: 2, tvLabel: GO_ROOM_TV_OFF })
    ).toBe("3 人在 · 沒訊號");
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

describe("roomMemberCard", () => {
  const host = {
    peerId: "local",
    name: "太郎",
    mine: true,
    liveVideo: false,
    liveAudio: true,
  };
  const guest = {
    peerId: "g-a",
    name: "小明",
    mine: false,
    liveVideo: true,
    liveAudio: false,
  };

  it("labels 主持人 and 主講人, not a conference seat name", () => {
    expect(
      roomMemberCard({
        occupant: host,
        hostPeerId: "local",
        tvSourcePeerId: "host-agent",
        localAgentId: "host-agent",
      })
    ).toMatchObject({
      name: "太郎",
      host: true,
      presenter: true,
      onAir: true,
      micOn: true,
      cameraOn: false,
    });
    expect(
      roomMemberCard({
        occupant: guest,
        hostPeerId: "local",
        tvSourcePeerId: "g-a",
      })
    ).toMatchObject({
      host: false,
      presenter: true,
      onAir: true,
      micOn: false,
      cameraOn: true,
    });
  });

  it("keeps LIVE off when the TV is a file, not this person's live", () => {
    expect(
      roomMemberOnAir({
        peerId: "g-a",
        mine: false,
        tvSourcePeerId: null,
      })
    ).toBe(false);
    expect(
      roomMemberCard({
        occupant: guest,
        hostPeerId: "local",
        tvSourcePeerId: null,
      }).onAir
    ).toBe(false);
  });

  it("shows a yellow 舉手 mark only while the hand is up", () => {
    expect(
      roomMemberCard({ occupant: guest, hostPeerId: "local" }).handRaised
    ).toBe(false);
    expect(
      roomMemberCard({
        occupant: guest,
        hostPeerId: "local",
        handRaised: true,
      }).handRaised
    ).toBe(true);
  });

  it("marks mesh-direct peers for a compact roster cue (never self)", () => {
    expect(
      roomMemberShowsDirectLink({
        mine: false,
        peerId: "g-b",
        directPeerIds: ["g-b"],
      })
    ).toBe(true);
    expect(
      roomMemberShowsDirectLink({
        mine: true,
        peerId: "local",
        directPeerIds: ["local", "g-b"],
      })
    ).toBe(false);
    expect(
      roomMemberCard({
        occupant: guest,
        hostPeerId: "local",
        directLink: true,
      }).directLink
    ).toBe(true);
    expect(
      roomMemberCard({ occupant: guest, hostPeerId: "local" }).directLink
    ).toBe(false);
  });

  it("animates the mic only when the open mic is speaking", () => {
    expect(
      roomMemberCard({
        occupant: host,
        hostPeerId: "local",
        speaking: true,
      }).speaking
    ).toBe(true);
    expect(
      roomMemberCard({
        occupant: guest,
        hostPeerId: "local",
        speaking: true,
      }).speaking
    ).toBe(false);
  });

  it("takes the first grapheme for a fallback avatar", () => {
    expect(roomMemberAvatarInitial("太郎")).toBe("太");
    expect(roomMemberAvatarInitial("  ")).toBe("?");
  });
});

function memberStub(
  patch: Partial<ReturnType<typeof roomMemberCard>> & {
    name: string;
    peerId: string;
  }
): ReturnType<typeof roomMemberCard> {
  return {
    mine: false,
    avatarUrl: null,
    avatarInitial: roomMemberAvatarInitial(patch.name),
    host: false,
    presenter: false,
    micOn: false,
    cameraOn: false,
    speaking: false,
    onAir: false,
    handRaised: false,
    directLink: false,
    ...patch,
  };
}

describe("roomMemberCardsSorted", () => {
  it("orders host, on-stage LIVE, 舉手, speaking, then name", () => {
    const zebra = memberStub({ peerId: "z", name: "Zebra" });
    const speaking = memberStub({
      peerId: "s",
      name: "Sam",
      speaking: true,
    });
    const hand = memberStub({
      peerId: "h",
      name: "Hana",
      handRaised: true,
    });
    const live = memberStub({
      peerId: "l",
      name: "Live",
      onAir: true,
      presenter: true,
    });
    const host = memberStub({
      peerId: "host",
      name: "我",
      host: true,
    });
    const apple = memberStub({ peerId: "a", name: "Apple" });
    expect(
      roomMemberCardsSorted([
        zebra,
        apple,
        speaking,
        hand,
        live,
        host,
      ]).map((c) => c.peerId)
    ).toEqual(["host", "l", "h", "s", "a", "z"]);
  });

  it("keeps the Host first even when someone else is LIVE or speaking", () => {
    expect(
      roomMemberCardsSorted([
        memberStub({
          peerId: "g",
          name: "甲",
          onAir: true,
          handRaised: true,
          speaking: true,
        }),
        memberStub({ peerId: "host", name: "乙", host: true }),
      ]).map((c) => c.peerId)
    ).toEqual(["host", "g"]);
  });
});

describe("roomHostMemberMenu", () => {
  it("lets the Host put a live occupant on the TV, mute, close camera, or kick", () => {
    const items = roomHostMemberMenu({
      mine: false,
      liveAudio: true,
      liveVideo: true,
    });
    expect(items.map((i) => i.action)).toEqual([
      "putOnTv",
      "forceMute",
      "forceCameraOff",
      "kick",
    ]);
    expect(items.find((i) => i.action === "putOnTv")).toMatchObject({
      label: GO_ROOM_PUT_ON_TV,
      enabled: true,
    });
    expect(items.find((i) => i.action === "forceMute")).toMatchObject({
      label: GO_ROOM_FORCE_MUTE,
      enabled: true,
    });
    expect(items.find((i) => i.action === "forceCameraOff")).toMatchObject({
      label: GO_ROOM_FORCE_CAMERA_OFF,
      enabled: true,
    });
    expect(items.find((i) => i.action === "kick")).toMatchObject({
      label: GO_ROOM_KICK,
      enabled: true,
      danger: true,
    });
  });

  it("disables put-on-TV when that member is already on the big screen", () => {
    const items = roomHostMemberMenu({
      mine: false,
      liveAudio: true,
      liveVideo: true,
      onAir: true,
    });
    expect(items.find((i) => i.action === "putOnTv")?.enabled).toBe(false);
  });

  it("does not let the Host kick themselves, and disables mute when the mic is already off", () => {
    const items = roomHostMemberMenu({
      mine: true,
      liveAudio: false,
      liveVideo: true,
    });
    expect(items.map((i) => i.action)).toEqual([
      "putOnTv",
      "forceMute",
      "forceCameraOff",
    ]);
    expect(items.find((i) => i.action === "forceMute")?.enabled).toBe(false);
    expect(items.find((i) => i.action === "forceCameraOff")?.enabled).toBe(
      true
    );
    expect(items.find((i) => i.action === "putOnTv")?.enabled).toBe(true);
  });
});

describe("GO_ROOM_MESH_ENABLED", () => {
  it("enables Guest↔Guest mesh so file bytes can skip the Host star", () => {
    expect(GO_ROOM_MESH_ENABLED).toBe(true);
  });
});

describe("program capture capability", () => {
  it("detects native HTMLMediaElement.captureStream", () => {
    expect(
      htmlMediaCaptureStreamSupported({
        captureStream: () => null,
      })
    ).toBe(true);
    expect(
      htmlMediaCaptureStreamSupported({
        mozCaptureStream: () => null,
      })
    ).toBe(true);
    expect(htmlMediaCaptureStreamSupported({})).toBe(false);
    expect(htmlMediaCaptureStreamSupported(null)).toBe(false);
  });

  it("does not allow canvas-only program capture without native media capture", () => {
    expect(
      allowCanvasProgramCaptureFallback({
        nativeHtmlMediaCaptureStream: false,
      })
    ).toBe(false);
    expect(
      allowCanvasProgramCaptureFallback({
        nativeHtmlMediaCaptureStream: true,
      })
    ).toBe(true);
  });

  it("uses Safari-oriented copy when native capture is missing", () => {
    expect(
      goRoomCastCaptureError({ nativeHtmlMediaCaptureStream: false })
    ).toBe(GO_ROOM_CAST_SOURCE_UNSUPPORTED);
    expect(
      goRoomCastCaptureError({ nativeHtmlMediaCaptureStream: true })
    ).toBe(GO_ROOM_CAST_UNSUPPORTED);
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

  it("frames the login gate around live video and file sharing, not watching TV", () => {
    expect(GO_ROOM_GATE_BODY).toBe(
      "請人進來：即時視訊、共享檔案。被請進來的人不必有通行證。"
    );
    expect(GO_ROOM_GATE_BODY).not.toContain("一起看大螢幕");
  });

  it("hides the host login gate until the client is ready", () => {
    expect(
      roomHostLoginGate({
        role: "host",
        loggedIn: false,
        phase: "idle",
        clientReady: false,
      })
    ).toBe(false);
    expect(
      roomHostLoginGate({
        role: "host",
        loggedIn: false,
        phase: "idle",
        clientReady: true,
      })
    ).toBe(true);
    expect(
      roomHostLoginGate({
        role: "host",
        loggedIn: true,
        phase: "idle",
        clientReady: true,
      })
    ).toBe(false);
    expect(
      roomHostLoginGate({
        role: "guest",
        loggedIn: false,
        phase: "idle",
        clientReady: true,
      })
    ).toBe(false);
  });

  it("puts connecting／error／ended copy on the TV, not a bottom sheet", () => {
    expect(roomTvStatusGate("connecting")).toBe(true);
    expect(roomTvStatusGate("error")).toBe(true);
    expect(roomTvStatusGate("ended")).toBe(true);
    expect(roomTvStatusGate("ready")).toBe(false);
    expect(roomTvStatusGate("open")).toBe(false);
    expect(roomTvStatusGate("idle")).toBe(false);
  });

  it("warns that hung items and live pulls stop when the Host ends the booth", () => {
    expect(GO_ROOM_END_CONFIRM_HOST).toBe(
      "關掉後在場的人會斷線，目錄會沒了，大螢幕與鏡頭會停，進行中的遊戲會停。已存到硬碟的檔不受影響。"
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

  it("does not call load on the first src assign (Safari aborts the first Range)", () => {
    const load = vi.fn();
    const el = {
      src: "",
      paused: true,
      muted: false,
      play: async () => {},
      load,
    };
    attachPlaybackUrl(el, "/room-file/tr-1");
    expect(el.src).toBe("/room-file/tr-1");
    expect(load).not.toHaveBeenCalled();
  });

  it("calls load when replacing an existing playback URL", () => {
    const load = vi.fn();
    const el = {
      src: "/room-file/old",
      paused: true,
      muted: false,
      play: async () => {},
      load,
    };
    attachPlaybackUrl(el, "/room-file/tr-1");
    expect(el.src).toBe("/room-file/tr-1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("mutes and retries when autoplay with audio is blocked", async () => {
    const play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    const el = { src: "", paused: true, muted: false, play };
    attachPlaybackUrl(el, "/room-file/play-2");
    await vi.waitFor(() => {
      expect(el.muted).toBe(true);
    });
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("keeps src as /room-file/<id> on the attribute (Safari must not see blob: or an absolute URL)", () => {
    const attrs: Record<string, string> = {};
    const assigned: string[] = [];
    const el = {
      paused: true,
      muted: false,
      play: async () => {},
      _src: "",
      get src() {
        return this._src.startsWith("/")
          ? `https://go.example${this._src}`
          : this._src;
      },
      set src(v: string) {
        assigned.push(v);
        this._src = v.startsWith("http") ? v : `https://go.example${v}`;
        attrs.src = this._src;
      },
      getAttribute(name: string) {
        return attrs[name] ?? null;
      },
      setAttribute(name: string, value: string) {
        attrs[name] = value;
        if (name === "src") this._src = value;
      },
      removeAttribute(name: string) {
        delete attrs[name];
      },
    };
    attachPlaybackUrl(el, "/room-file/clip-1");
    expect(el.getAttribute("src")).toBe("/room-file/clip-1");
    expect(assigned).toEqual([]);
  });

  it("still assigns .src=/room-file/<id> when setAttribute does not stick", () => {
    const el = {
      src: "",
      paused: true,
      muted: false,
      play: async () => {},
      getAttribute: () => null,
      setAttribute: vi.fn(),
    };
    attachPlaybackUrl(el, "/room-file/clip-1");
    expect(el.src).toBe("/room-file/clip-1");
    expect(el.setAttribute).toHaveBeenCalledWith("src", "/room-file/clip-1");
  });

  it("does not reassign when .src resolved to an absolute /room-file/ URL", () => {
    const setAttribute = vi.fn();
    const el = {
      src: "https://go.example/room-file/tr-1",
      paused: false,
      muted: false,
      play: vi.fn(async () => {}),
      load: vi.fn(),
      getAttribute: (name: string) =>
        name === "src" ? "https://go.example/room-file/tr-1" : null,
      setAttribute,
    };
    attachPlaybackUrl(el, "/room-file/tr-1");
    expect(setAttribute).not.toHaveBeenCalled();
    expect(el.load).not.toHaveBeenCalled();
    expect(el.play).not.toHaveBeenCalled();
  });

  it("mutes a /room-file/ video preview before play so Safari can autoplay", async () => {
    const play = vi.fn(async () => {});
    const el = {
      src: "",
      paused: true,
      muted: false,
      defaultMuted: false,
      play,
      getAttribute: () => null,
      setAttribute: vi.fn(),
    };
    attachPlaybackUrl(el, "/room-file/clip-1", { muted: true });
    expect(el.muted).toBe(true);
    expect(el.defaultMuted).toBe(true);
    expect(el.setAttribute).toHaveBeenCalledWith("muted", "");
    expect(el.setAttribute).toHaveBeenCalledWith("playsinline", "");
    expect(el.setAttribute).toHaveBeenCalledWith("webkit-playsinline", "");
    expect(el.setAttribute).toHaveBeenCalledWith("src", "/room-file/clip-1");
    await vi.waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
  });

  it("does not remute a /room-file/ preview after the user turns sound on", () => {
    const el = {
      src: "https://go.example/room-file/clip-1",
      paused: false,
      muted: false,
      play: vi.fn(async () => {}),
      getAttribute: (name: string) =>
        name === "src" ? "/room-file/clip-1" : null,
      setAttribute: vi.fn(),
    };
    attachPlaybackUrl(el, "/room-file/clip-1", { muted: true });
    expect(el.muted).toBe(false);
    expect(el.setAttribute).not.toHaveBeenCalled();
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
    expect(GO_ROOM_TV_TITLE).toBe("包廂大螢幕");
    expect(GO_ROOM_TV_FULLSCREEN).toBe("全螢幕");
    expect(GO_ROOM_TV_HINT_HOST).toContain("檔案區");
    expect(GO_ROOM_TV_HINT_HOST).toContain("放到大螢幕上");
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

  it("clears the last decoded frame when the stream is removed", () => {
    const stream = {} as MediaStream;
    const play = vi.fn(async () => {});
    const load = vi.fn();
    const el = {
      srcObject: stream as MediaStream | null,
      paused: false,
      muted: false,
      play,
      load,
    };
    attachMediaStream(el, null);
    expect(el.srcObject).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
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

  it("keeps the element muted when autoplay fallback wins over an unmuted sink", async () => {
    const stream = {} as MediaStream;
    const play = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    const el = {
      srcObject: null as MediaStream | null,
      paused: true,
      muted: false,
      volume: 1,
      play,
    };
    const onAutoplayMuted = vi.fn();
    attachMediaStream(el, stream, {
      volume: 1,
      muted: false,
      onAutoplayMuted,
    });
    await vi.waitFor(() => {
      expect(play).toHaveBeenCalledTimes(2);
    });
    expect(el.muted).toBe(true);
    expect(onAutoplayMuted).toHaveBeenCalledTimes(1);
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
    expect(ROOM_SHELL_WIDE_MIN_PX).toBe(1281);
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

  it("does not treat in-card member／file menus as chrome overlays", () => {
    // Card「更多」lives in the control rail — must not reveal／pin the header.
    expect(roomChromeShouldHold({ overlayOpen: false })).toBe(false);
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

  it("hides the house ad while booth play is active (開局)", () => {
    expect(roomShowAdSlot({ inBooth: true, tvOn: false, playActive: true })).toBe(
      false
    );
    expect(
      roomShowAdSlot({ inBooth: true, tvOn: false, playActive: false })
    ).toBe(true);
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
    expect(roomEscStep({ previewOpen: true, cinema: true })).toBe(
      "close-preview"
    );
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
      roomTvHudKind({ tvOn: true, role: "host", fileOnTv: true })
    ).toBe("host-file");
    expect(
      roomTvHudKind({ tvOn: true, role: "host", fileTransport: false })
    ).toBe("watch");
    expect(roomTvHudKind({ tvOn: true, role: "guest" })).toBe("watch");
    expect(
      roomTvHudKind({ tvOn: true, role: "guest", fileTransport: true })
    ).toBe("watch");
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

  it("starts the TV muted at full volume; user turns sound on", () => {
    const sink = roomTvHudDefaultSink();
    expect(sink.volume).toBe(1);
    expect(sink.muted).toBe(true);
    expect(roomTvSinkMuted(sink.volume, sink.muted)).toBe(true);
  });

  it("unmutes on the first speaker tap when the TV is quiet", () => {
    expect(
      roomTvVolumeIconClick({ quiet: true, panelOpen: false, volume: 1 })
    ).toEqual({ muted: false, panelOpen: true, volume: 1 });
    expect(
      roomTvVolumeIconClick({ quiet: true, panelOpen: false, volume: 0 })
    ).toEqual({ muted: false, panelOpen: true, volume: 1 });
    expect(
      roomTvVolumeIconClick({ quiet: false, panelOpen: false, volume: 1 })
    ).toEqual({ muted: false, panelOpen: true, volume: 1 });
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
