import { describe, expect, it, vi } from "vitest";
import { BOOTH_TRANSCEIVER_SLOTS } from "@pg/roster/rosterBoothMedia";
import { SESSION_CAST_TYPE } from "@pg/roster/rosterSessionCast";
import { SESSION_CAMERA_TYPE, SESSION_MIC_TYPE } from "@pg/roster/rosterSessionCamera";
import { createRoomMedia } from "./goRoomMedia";
import {
  GO_ROOM_CAST_SOURCE_UNSUPPORTED,
  GO_ROOM_CAST_UNSUPPORTED,
  roomTvStream,
} from "./goRoom";

function track(kind: "audio" | "video", id = kind) {
  return {
    kind,
    id,
    readyState: "live" as const,
    enabled: true,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function mockPc() {
  const transceivers = BOOTH_TRANSCEIVER_SLOTS.map((slot) => ({
    sender: {
      replaceTrack: vi.fn(async () => {}),
    },
    receiver: {
      track: {
        kind: slot.kind,
        id: `${slot.layer}-${slot.kind}`,
        readyState: "ended" as const,
      },
    },
  }));
  return {
    getTransceivers: () => transceivers,
    transceivers,
  };
}

describe("createRoomMedia", () => {
  it("lets a lone host hang a camera without sending RTP", async () => {
    const json: unknown[] = [];
    const cam = track("video", "cam");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 1,
      peers: () => [],
      sendJson: (m) => json.push(m),
      getUserMedia: async () =>
        ({ getVideoTracks: () => [cam], getAudioTracks: () => [] }) as unknown as MediaStream,
    });
    const out = await media.enableCamera();
    expect(out.ok).toBe(true);
    expect(media.getState().cameraBlocked).toBe(false);
    expect(json).toContainEqual({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "offer",
      from: "host",
    });
  });

  it("does not push camera RTP until the other person requests to watch", async () => {
    const json: unknown[] = [];
    const pc = mockPc();
    const cam = track("video", "cam");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: (m) => json.push(m),
      getUserMedia: async () =>
        ({ getVideoTracks: () => [cam], getAudioTracks: () => [] }) as unknown as MediaStream,
    });
    expect((await media.enableCamera()).ok).toBe(true);
    expect(json).toContainEqual({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "offer",
      from: "host",
    });
    expect(pc.transceivers[1]!.sender.replaceTrack).not.toHaveBeenCalledWith(
      cam
    );

    await media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    expect(pc.transceivers[1]!.sender.replaceTrack).toHaveBeenCalledWith(cam);
  });

  it("keeps a requested camera up when a third person joins", async () => {
    let occupants = 2;
    const pc = mockPc();
    const cam = track("video", "cam");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => occupants,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: () => {},
      getUserMedia: async () =>
        ({ getVideoTracks: () => [cam], getAudioTracks: () => [] }) as unknown as MediaStream,
    });
    expect((await media.enableCamera()).ok).toBe(true);
    await media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    expect(pc.transceivers[1]!.sender.replaceTrack).toHaveBeenCalledWith(cam);
    occupants = 3;
    await media.refresh();
    expect(pc.transceivers[1]!.sender.replaceTrack).toHaveBeenLastCalledWith(
      cam
    );
    expect(cam.stop).not.toHaveBeenCalled();
    expect(media.getState().camera).toBe(true);
  });

  it("binds a remote camera to the sink as soon as the peer is up, before watch", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);
    const pc = mockPc();
    const remote = track("video", "their-cam");
    Object.defineProperty(remote, "muted", { value: true, configurable: true });
    pc.transceivers[1]!.receiver.track = remote as unknown as {
      kind: "video";
      id: string;
      readyState: "live";
    };
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [{ peerId: "host", pc, via: "entrance" }],
      sendJson: (m) => json.push(m),
    });
    media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "offer",
      from: "host",
    });
    expect(media.getState().remoteCameraOffered).toBe(true);
    await media.refresh();
    expect(media.getState().watching).toBe(false);
    expect(media.getState().presenceStream).not.toBeNull();

    expect((await media.watchCamera()).ok).toBe(true);
    expect(json).toContainEqual({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    expect(media.getState().watching).toBe(true);
    expect(media.getState().presenceStream).not.toBeNull();
  });

  it("pushes mic RTP to everyone in the booth without waiting for a listen request", async () => {
    const json: unknown[] = [];
    const pc = mockPc();
    const mic = track("audio", "mic");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 3,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: (m) => json.push(m),
      getUserMedia: async () =>
        ({ getVideoTracks: () => [], getAudioTracks: () => [mic] }) as unknown as MediaStream,
    });
    expect((await media.enableMic()).ok).toBe(true);
    expect(json).toContainEqual({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "host",
    });
    expect(pc.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(mic);
  });

  it("auto-listens when someone offers a mic", async () => {
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [],
      sendJson: (m) => json.push(m),
    });
    await media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "host",
    });
    expect(media.getState().listening).toBe(true);
    expect(json).toContainEqual({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
  });

  it("puts a local file on the TV program slot for every peer", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);
    const json: unknown[] = [];
    const pc = mockPc();
    const video = track("video", "prog-v");
    const file = new File([new Uint8Array(4)], "MTV.mp4", { type: "video/mp4" });
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: (m) => json.push(m),
      captureProgram: async () => ({
        audio: null,
        video,
        stop: vi.fn(),
      }),
    });
    expect((await media.startProgram(file)).ok).toBe(true);
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "MTV.mp4",
    });
    expect(pc.transceivers[3]!.sender.replaceTrack).toHaveBeenCalledWith(video);
    expect(media.getState().programName).toBe("MTV.mp4");
    expect(media.getState().localProgramStream).not.toBeNull();
    expect(media.getState().streamingFileId).toBeNull();
  });

  it("keeps the host TV on the local capture when a new peer joins with muted program receivers", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);
    const a = mockPc();
    const b = mockPc();
    const video = track("video", "prog-v");
    Object.defineProperty(video, "muted", { value: false, configurable: true });
    const placeholder = track("video", "guest-prog-placeholder");
    Object.defineProperty(placeholder, "muted", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(placeholder, "getSettings", {
      value: () => ({}),
      configurable: true,
    });
    b.transceivers[3]!.receiver.track = placeholder as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    let peers = [{ peerId: "g-a", pc: a, via: "entrance" as const }];
    const file = new File([new Uint8Array(4)], "MTV.mp4", { type: "video/mp4" });
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => peers.length + 1,
      peers: () => peers,
      sendJson: () => {},
      captureProgram: async () => ({
        audio: null,
        video,
        stop: vi.fn(),
      }),
    });
    expect((await media.startProgram(file)).ok).toBe(true);
    const before = media.getState();
    expect(before.localProgramStream).not.toBeNull();

    peers = [
      { peerId: "g-a", pc: a, via: "entrance" },
      { peerId: "g-b", pc: b, via: "entrance" },
    ];
    await media.refresh();

    const after = media.getState();
    expect(after.programName).toBe("MTV.mp4");
    expect(after.localProgramStream).not.toBeNull();
    // Joiner PC may expose a muted program placeholder; TV must still prefer local.
    expect(
      roomTvStream({
        programStream: after.programStream,
        localProgramStream: after.localProgramStream,
      })
    ).toBe(after.localProgramStream);
    expect(b.transceivers[3]!.sender.replaceTrack).toHaveBeenCalledWith(video);
  });

  it("exposes a muted remote program so joiners can bind the TV before the first frame", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);
    const pc = mockPc();
    const remote = track("video", "host-prog");
    Object.defineProperty(remote, "muted", { value: true, configurable: true });
    Object.defineProperty(remote, "getSettings", {
      value: () => ({}),
      configurable: true,
    });
    pc.transceivers[3]!.receiver.track = remote as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    const media = createRoomMedia({
      localAgentId: "g-b",
      occupantCount: () => 2,
      peers: () => [{ peerId: "host", pc, via: "entrance" }],
      sendJson: () => {},
    });
    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "MTV.mp4",
      id: "file-1",
    });
    await media.refresh();
    expect(media.getState().watchingProgram).toBe(true);
    expect(media.getState().programStream).not.toBeNull();
    expect(
      roomTvStream({
        programStream: media.getState().programStream,
        localProgramStream: media.getState().localProgramStream,
      })
    ).toBe(media.getState().programStream);
  });

  it("drops the program stream on unoffer so receivers clear the TV picture", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);
    const pc = mockPc();
    const remote = track("video", "host-prog");
    Object.defineProperty(remote, "muted", { value: false, configurable: true });
    pc.transceivers[3]!.receiver.track = remote as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    const media = createRoomMedia({
      localAgentId: "g-b",
      occupantCount: () => 2,
      peers: () => [{ peerId: "host", pc, via: "entrance" }],
      sendJson: () => {},
    });
    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "鏡頭",
    });
    await media.refresh();
    expect(media.getState().programStream).not.toBeNull();
    expect(media.getState().remoteProgramName).toBe("鏡頭");

    media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "unoffer",
      from: "host",
    });
    await media.refresh();
    expect(media.getState().remoteProgramName).toBeNull();
    expect(media.getState().watchingProgram).toBe(false);
    expect(media.getState().programStream).toBeNull();
  });

  it("tags the catalog file id when the host puts a hanging file on the TV", async () => {
    const video = track("video", "prog-v");
    const file = new File([new Uint8Array(4)], "MTV.mp4", { type: "video/mp4" });
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc: mockPc(), via: "entrance" }],
      sendJson: (m) => json.push(m),
      resolveLocalFile: (id) => (id === "file-1" ? file : null),
      captureProgram: async () => ({
        audio: null,
        video,
        stop: vi.fn(),
      }),
    });
    expect((await media.startListedProgram("file-1")).ok).toBe(true);
    expect(media.getState().streamingFileId).toBe("file-1");
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "MTV.mp4",
      id: "file-1",
    });
  });

  it("warms owner decode from /room-file/<id>, not an object URL", async () => {
    const file = new File([new Uint8Array(4)], "MTV.mp4", { type: "video/mp4" });
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 1,
      peers: () => [],
      sendJson: () => {},
      resolveLocalFile: (id) => (id === "file-1" ? file : null),
    });
    expect((await media.warmProgram("file-1")).ok).toBe(true);
    expect(media.getState().ownerDecodeUrl).toBe("/room-file/file-1");
    expect(media.getState().ownerDecodeUrl?.startsWith("blob:")).toBe(false);
  });

  it("lets the host put a guest-hung file on the TV without pulling bytes", async () => {
    const json: unknown[] = [];
    const guestPc = mockPc();
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc: guestPc, via: "entrance" }],
      sendJson: (m) => json.push(m),
      forward: true,
      resolveLocalFile: () => null,
      ownerOf: (id) => (id === "file-1" ? "g-a" : null),
      fileMeta: (id) =>
        id === "file-1"
          ? { name: "guest-clip.mp4", kind: "video" as const }
          : null,
    });
    expect((await media.startListedProgram("file-1")).ok).toBe(true);
    expect(media.getState().streamingFileId).toBe("file-1");
    expect(media.getState().programName).toBe("guest-clip.mp4");
    expect(media.getState().localProgramStream).toBeNull();
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "guest-clip.mp4",
      id: "file-1",
      fromPeer: "g-a",
    });
  });

  it("binds the owner program track onto the host TV without waiting for a track event", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);

    const remote = track("video", "from-owner");
    Object.defineProperty(remote, "muted", { value: false, configurable: true });
    const guestPc = mockPc();
    guestPc.transceivers[3]!.receiver.track = remote as unknown as {
      kind: "video";
      id: string;
      readyState: "live";
    };

    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc: guestPc, via: "entrance" }],
      sendJson: () => {},
      forward: true,
      resolveLocalFile: () => null,
      ownerOf: (id) => (id === "file-1" ? "g-a" : null),
      fileMeta: (id) =>
        id === "file-1"
          ? { name: "guest-clip.mp4", kind: "video" as const }
          : null,
    });
    expect((await media.startListedProgram("file-1")).ok).toBe(true);
    expect(media.getState().programStream).not.toBeNull();
    expect(
      roomTvStream({
        programStream: media.getState().programStream,
        localProgramStream: media.getState().localProgramStream,
      })
    ).not.toBeNull();

    vi.unstubAllGlobals();
  });

  it("rebinds the host TV when owner clock telemetry arrives after replaceTrack", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);

    const guestPc = mockPc();
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc: guestPc, via: "entrance" }],
      sendJson: () => {},
      forward: true,
      resolveLocalFile: () => null,
      ownerOf: (id) => (id === "file-1" ? "g-a" : null),
      fileMeta: (id) =>
        id === "file-1"
          ? { name: "guest-clip.mp4", kind: "video" as const }
          : null,
    });
    expect((await media.startListedProgram("file-1")).ok).toBe(true);
    expect(media.getState().programStream).toBeNull();

    const remote = track("video", "late-owner");
    Object.defineProperty(remote, "muted", { value: false, configurable: true });
    guestPc.transceivers[3]!.receiver.track = remote as unknown as {
      kind: "video";
      id: string;
      readyState: "live";
    };

    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "state",
      from: "g-a",
      paused: false,
      t: 1,
      duration: 90,
      id: "file-1",
    });
    expect(media.getState().programStream).not.toBeNull();

    vi.unstubAllGlobals();
  });

  it("keeps host TV and third guest program after refresh during remote file cast", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);

    const ownerPc = mockPc();
    const thirdPc = mockPc();
    const remote = track("video", "from-owner");
    Object.defineProperty(remote, "muted", { value: false, configurable: true });
    Object.defineProperty(remote, "clone", {
      value: () => {
        const c = track("video", `clone-${Math.random()}`);
        Object.defineProperty(c, "muted", { value: false, configurable: true });
        return c;
      },
      configurable: true,
    });
    ownerPc.transceivers[3]!.receiver.track = remote as unknown as {
      kind: "video";
      id: string;
      readyState: "live";
    };

    let peers = [{ peerId: "g-a", pc: ownerPc, via: "entrance" as const }];
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => peers.length + 1,
      peers: () => peers,
      sendJson: () => {},
      forward: true,
      resolveLocalFile: () => null,
      ownerOf: (id) => (id === "file-1" ? "g-a" : null),
      fileMeta: (id) =>
        id === "file-1"
          ? { name: "guest-clip.mp4", kind: "video" as const }
          : null,
    });
    expect((await media.startListedProgram("file-1")).ok).toBe(true);
    expect(media.getState().programStream).not.toBeNull();

    peers = [
      { peerId: "g-a", pc: ownerPc, via: "entrance" },
      { peerId: "g-b", pc: thirdPc, via: "entrance" },
    ];
    await media.refresh();

    expect(media.getState().programStream).not.toBeNull();
    const replaceCalls = thirdPc.transceivers[3]!.sender.replaceTrack.mock
      .calls as unknown[][];
    expect(replaceCalls.length).toBeGreaterThan(0);
    const last = replaceCalls[replaceCalls.length - 1]![0];
    expect(last).not.toBeNull();
    expect((last as MediaStreamTrack).kind).toBe("video");

    vi.unstubAllGlobals();
  });

  it("does not bind the host TV to a joiner program placeholder during remote file cast", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
      getTracks() {
        return this.tracks;
      }
    }
    vi.stubGlobal("MediaStream", FakeStream);

    const ownerPc = mockPc();
    const joinerPc = mockPc();
    const fromOwner = track("video", "from-owner");
    Object.defineProperty(fromOwner, "muted", {
      value: false,
      configurable: true,
    });
    Object.defineProperty(fromOwner, "clone", {
      value: () => track("video", `clone-${Math.random()}`),
      configurable: true,
    });
    ownerPc.transceivers[3]!.receiver.track = fromOwner as unknown as {
      kind: "video";
      id: string;
      readyState: "live";
    };

    const placeholder = track("video", "joiner-placeholder");
    Object.defineProperty(placeholder, "muted", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(placeholder, "getSettings", {
      value: () => ({}),
      configurable: true,
    });
    joinerPc.transceivers[3]!.receiver.track = placeholder as unknown as {
      kind: "video";
      id: string;
      readyState: "live";
    };

    let peers = [{ peerId: "edge", pc: ownerPc, via: "entrance" as const }];
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => peers.length + 1,
      peers: () => peers,
      sendJson: () => {},
      forward: true,
      resolveLocalFile: () => null,
      ownerOf: (id) => (id === "file-1" ? "edge" : null),
      fileMeta: (id) =>
        id === "file-1"
          ? { name: "edge-clip.mp4", kind: "video" as const }
          : null,
    });
    expect((await media.startListedProgram("file-1")).ok).toBe(true);
    expect(media.getState().programStream?.getTracks()[0]?.id).toBe(
      "from-owner"
    );

    peers = [
      { peerId: "edge", pc: ownerPc, via: "entrance" },
      { peerId: "safari", pc: joinerPc, via: "entrance" },
    ];
    await media.refresh();

    const after = media.getState();
    expect(after.programStream?.getTracks()[0]?.id).toBe("from-owner");
    expect(
      roomTvStream({
        programStream: after.programStream,
        localProgramStream: after.localProgramStream,
      })?.getTracks()[0]?.id
    ).toBe("from-owner");

    vi.unstubAllGlobals();
  });

  it("re-offers remote file cast when a third peer joins so late joiners leave 沒訊號", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);

    const ownerPc = mockPc();
    const joinerPc = mockPc();
    const remote = track("video", "from-owner");
    Object.defineProperty(remote, "muted", { value: false, configurable: true });
    Object.defineProperty(remote, "clone", {
      value: () => track("video", `clone-${Math.random()}`),
      configurable: true,
    });
    ownerPc.transceivers[3]!.receiver.track = remote as unknown as {
      kind: "video";
      id: string;
      readyState: "live";
    };

    let peers = [{ peerId: "edge", pc: ownerPc, via: "entrance" as const }];
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => peers.length + 1,
      peers: () => peers,
      sendJson: (m) => json.push(m),
      forward: true,
      resolveLocalFile: () => null,
      ownerOf: (id) => (id === "file-1" ? "edge" : null),
      fileMeta: (id) =>
        id === "file-1"
          ? { name: "edge-clip.mp4", kind: "video" as const }
          : null,
    });
    expect((await media.startListedProgram("file-1")).ok).toBe(true);
    const offersBefore = json.filter((m) => (m as { op?: string }).op === "offer");
    expect(offersBefore.length).toBe(1);

    peers = [
      { peerId: "edge", pc: ownerPc, via: "entrance" },
      { peerId: "safari", pc: joinerPc, via: "entrance" },
    ];
    await media.refresh();

    const offers = json.filter((m) => (m as { op?: string }).op === "offer");
    expect(offers.length).toBeGreaterThan(1);
    expect(offers[offers.length - 1]).toMatchObject({
      type: SESSION_CAST_TYPE,
      op: "offer",
      kind: "video",
      name: "edge-clip.mp4",
      id: "file-1",
      fromPeer: "edge",
    });

    const safari = createRoomMedia({
      localAgentId: "safari",
      occupantCount: () => 3,
      peers: () => [{ peerId: "host", pc: mockPc(), via: "entrance" }],
      sendJson: () => {},
    });
    await safari.onControl(offers[offers.length - 1]!);
    expect(safari.getState().remoteProgramName).toBe("edge-clip.mp4");
    expect(safari.getState().streamingFileId).toBe("file-1");

    vi.unstubAllGlobals();
  });

  it("captures on the file owner when the host casts their hanging file", async () => {
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
    }
    vi.stubGlobal("MediaStream", FakeStream);

    const video = track("video", "owner-prog");
    Object.defineProperty(video, "muted", { value: false, configurable: true });
    const file = new File([new Uint8Array(4)], "guest-clip.mp4", {
      type: "video/mp4",
    });
    const json: unknown[] = [];
    const hostPc = mockPc();
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [{ peerId: "host", pc: hostPc, via: "entrance" }],
      sendJson: (m) => json.push(m),
      resolveLocalFile: (id) => (id === "file-1" ? file : null),
      captureProgram: async () => ({
        audio: null,
        video,
        stop: vi.fn(),
      }),
    });
    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "guest-clip.mp4",
      id: "file-1",
      fromPeer: "g-a",
    });
    expect(media.getState().streamingFileId).toBe("file-1");
    expect(media.getState().programName).toBe("guest-clip.mp4");
    expect(media.getState().localProgramStream).not.toBeNull();
    expect(hostPc.transceivers[3]!.sender.replaceTrack).toHaveBeenCalledWith(
      video
    );
    expect(json.some((m) => (m as { op?: string }).op === "reject")).toBe(
      false
    );
    vi.unstubAllGlobals();
  });

  it("rejects when the designated owner cannot capture the file", async () => {
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [{ peerId: "host", pc: mockPc(), via: "entrance" }],
      sendJson: (m) => json.push(m),
      resolveLocalFile: () => null,
    });
    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "missing.mp4",
      id: "file-1",
      fromPeer: "g-a",
    });
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "reject",
      from: "g-a",
      id: "file-1",
      reason: GO_ROOM_CAST_UNSUPPORTED,
    });
    expect(media.getState().localProgramStream).toBeNull();
  });

  it("rejects with source-unsupported reason when capture yields no tracks", async () => {
    const file = new File([new Uint8Array(4)], "safari.mp4", {
      type: "video/mp4",
    });
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [{ peerId: "host", pc: mockPc(), via: "entrance" }],
      sendJson: (m) => json.push(m),
      resolveLocalFile: (id) => (id === "file-1" ? file : null),
      captureProgram: async () => null,
    });
    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "safari.mp4",
      id: "file-1",
      fromPeer: "g-a",
    });
    const reject = json.find(
      (m) => (m as { op?: string }).op === "reject"
    ) as { reason?: string } | undefined;
    expect(reject?.reason).toBeTruthy();
    expect(
      reject?.reason === GO_ROOM_CAST_UNSUPPORTED ||
        reject?.reason === GO_ROOM_CAST_SOURCE_UNSUPPORTED
    ).toBe(true);
    expect(media.getState().localProgramStream).toBeNull();
  });

  it("surfaces owner reject reason on the host and clears remote cast", async () => {
    const hostJson: unknown[] = [];
    const host = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc: mockPc(), via: "entrance" }],
      sendJson: (m) => hostJson.push(m),
      forward: true,
      ownerOf: (id) => (id === "file-1" ? "g-a" : null),
      fileMeta: () => ({ name: "safari.mp4", kind: "video" }),
    });
    expect((await host.startListedProgram("file-1")).ok).toBe(true);
    expect(host.getState().streamingFileId).toBe("file-1");
    await host.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "reject",
      from: "g-a",
      id: "file-1",
      reason: GO_ROOM_CAST_SOURCE_UNSUPPORTED,
    });
    expect(host.getState().error).toBe(GO_ROOM_CAST_SOURCE_UNSUPPORTED);
    expect(host.getState().streamingFileId).toBeNull();
    expect(host.getState().remoteProgramName).toBeNull();
    expect(hostJson.some((m) => (m as { op?: string }).op === "unoffer")).toBe(
      true
    );
  });

  it("lets the host pause and seek a guest-hung file via cast state", async () => {
    const clock = { paused: false, currentTime: 12, duration: 90 };
    const video = track("video", "owner-prog");
    const file = new File([new Uint8Array(4)], "guest-clip.mp4", {
      type: "video/mp4",
    });
    const ownerJson: unknown[] = [];
    const owner = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [{ peerId: "host", pc: mockPc(), via: "entrance" }],
      sendJson: (m) => ownerJson.push(m),
      resolveLocalFile: (id) => (id === "file-1" ? file : null),
      captureProgram: async () => ({
        audio: null,
        video,
        stop: vi.fn(),
        play() {
          clock.paused = false;
        },
        pause() {
          clock.paused = true;
        },
        seek(seconds: number) {
          clock.currentTime = seconds;
        },
        clock: () => ({ ...clock }),
      }),
    });
    await owner.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "guest-clip.mp4",
      id: "file-1",
      fromPeer: "g-a",
    });

    const hostJson: unknown[] = [];
    const host = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc: mockPc(), via: "entrance" }],
      sendJson: (m) => hostJson.push(m),
      forward: true,
      resolveLocalFile: () => null,
      ownerOf: (id) => (id === "file-1" ? "g-a" : null),
      fileMeta: (id) =>
        id === "file-1"
          ? { name: "guest-clip.mp4", kind: "video" as const }
          : null,
    });
    expect((await host.startListedProgram("file-1")).ok).toBe(true);

    host.pauseProgram();
    const pauseCmd = hostJson.find(
      (m) =>
        (m as { op?: string; paused?: boolean }).op === "state" &&
        (m as { paused?: boolean }).paused === true
    );
    expect(pauseCmd).toMatchObject({
      type: SESSION_CAST_TYPE,
      op: "state",
      from: "host",
      paused: true,
    });
    await owner.onControl(pauseCmd);
    expect(clock.paused).toBe(true);
    expect(owner.getState().programPaused).toBe(true);

    host.seekProgram(44);
    const seekCmd = hostJson.find(
      (m) =>
        (m as { op?: string; t?: number }).op === "state" &&
        (m as { t?: number }).t === 44
    );
    expect(seekCmd).toBeTruthy();
    await owner.onControl(seekCmd);
    expect(clock.currentTime).toBe(44);

    host.playProgram();
    const playCmd = [...hostJson]
      .reverse()
      .find(
        (m) =>
          (m as { op?: string; paused?: boolean }).op === "state" &&
          (m as { paused?: boolean }).paused === false
      );
    expect(playCmd).toBeTruthy();
    await owner.onControl(playCmd);
    expect(clock.paused).toBe(false);

    await host.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "state",
      from: "g-a",
      paused: false,
      t: 44,
      duration: 90,
      id: "file-1",
    });
    expect(host.getState().programPaused).toBe(false);
    expect(host.getState().programTime).toBe(44);
    expect(host.getState().programDuration).toBe(90);
  });

  it("lets a guest mark on-air from the cast offer file id", async () => {
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [],
      sendJson: () => {},
    });
    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "MTV.mp4",
      id: "file-1",
    });
    expect(media.getState().streamingFileId).toBe("file-1");
  });

  it("lets the host pause and seek the file that is on the TV", async () => {
    const clock = { paused: false, currentTime: 12, duration: 90 };
    const video = track("video", "prog-v");
    const file = new File([new Uint8Array(4)], "MTV.mp4", { type: "video/mp4" });
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 1,
      peers: () => [],
      sendJson: () => {},
      captureProgram: async () => ({
        audio: null,
        video,
        stop: vi.fn(),
        play() {
          clock.paused = false;
        },
        pause() {
          clock.paused = true;
        },
        seek(seconds: number) {
          clock.currentTime = seconds;
        },
        clock: () => ({ ...clock }),
      }),
    });
    expect((await media.startProgram(file)).ok).toBe(true);
    expect(media.getState().programTransport).toBe(true);
    expect(media.getState().programPaused).toBe(false);
    media.pauseProgram();
    expect(media.getState().programPaused).toBe(true);
    media.playProgram();
    expect(media.getState().programPaused).toBe(false);
    media.seekProgram(40);
    expect(media.getState().programTime).toBe(40);
  });

  it("auto-pulls program RTP when the TV is offered", async () => {
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [],
      sendJson: (m) => json.push(m),
    });
    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "offer",
      from: "host",
      kind: "video",
      name: "MTV.mp4",
    });
    expect(media.getState().watchingProgram).toBe(true);
    expect(media.getState().remoteProgramName).toBe("MTV.mp4");
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
  });

  it("sends presence audio and program video to the same peer", async () => {
    const pc = mockPc();
    const mic = track("audio", "mic");
    const video = track("video", "prog-v");
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: () => {},
      getUserMedia: async () =>
        ({ getVideoTracks: () => [], getAudioTracks: () => [mic] }) as unknown as MediaStream,
      captureProgram: async () => ({
        audio: null,
        video,
        stop: vi.fn(),
      }),
    });
    expect((await media.enableMic()).ok).toBe(true);
    expect((await media.startProgram(file)).ok).toBe(true);
    expect(pc.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(mic);
    expect(pc.transceivers[3]!.sender.replaceTrack).toHaveBeenCalledWith(video);
  });

  it("puts a designated peer live onto the program slot", async () => {
    const json: unknown[] = [];
    const a = mockPc();
    const b = mockPc();
    const cam = track("video", "from-a");
    a.transceivers[1]!.receiver.track = cam as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 3,
      peers: () => [
        { peerId: "g-a", pc: a, via: "entrance" },
        { peerId: "g-b", pc: b, via: "entrance" },
      ],
      sendJson: (m) => json.push(m),
      forward: true,
    });
    await media.putLiveOnTv("g-a", "小明");
    expect(media.getState().tvSourcePeerId).toBe("g-a");
    expect(json).toContainEqual({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "host",
    });
    expect(b.transceivers[3]!.sender.replaceTrack).toHaveBeenCalledWith(cam);
    expect(media.getState().programName).toBe("小明");
  });

  it("clears the TV when the local camera on air is turned off", async () => {
    const json: unknown[] = [];
    const cam = track("video", "cam");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 1,
      peers: () => [],
      sendJson: (m) => json.push(m),
      getUserMedia: async () =>
        ({
          getVideoTracks: () => [cam],
          getAudioTracks: () => [],
        }) as unknown as MediaStream,
    });
    expect((await media.enableCamera()).ok).toBe(true);
    expect((await media.putLiveOnTv("local", "主持")).ok).toBe(true);
    expect(media.getState().programName).toBe("主持");
    expect(media.getState().tvSourcePeerId).toBe("local");

    await media.disableCamera();
    expect(media.getState().camera).toBe(false);
    expect(media.getState().programName).toBeNull();
    expect(media.getState().tvSourcePeerId).toBeNull();
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "unoffer",
      from: "host",
    });
  });

  it("clears the TV when display share on air ends", async () => {
    const json: unknown[] = [];
    const screen = track("video", "screen");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 1,
      peers: () => [],
      sendJson: (m) => json.push(m),
      getDisplayMedia: async () =>
        ({
          getVideoTracks: () => [screen],
          getAudioTracks: () => [],
        }) as unknown as MediaStream,
    });
    expect((await media.enableDisplay()).ok).toBe(true);
    expect((await media.putLiveOnTv("local")).ok).toBe(true);

    await media.disableDisplay();
    expect(media.getState().display).toBe(false);
    expect(media.getState().programName).toBeNull();
    expect(media.getState().tvSourcePeerId).toBeNull();
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "unoffer",
      from: "host",
    });
  });

  it("clears the TV when a remote live source on air unoffers the camera", async () => {
    const json: unknown[] = [];
    const a = mockPc();
    const cam = track("video", "from-a");
    a.transceivers[1]!.receiver.track = cam as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc: a, via: "entrance" }],
      sendJson: (m) => json.push(m),
      forward: true,
    });
    await media.putLiveOnTv("g-a", "小明");
    expect(media.getState().tvSourcePeerId).toBe("g-a");

    await media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "unoffer",
      from: "g-a",
    });
    expect(media.getState().programName).toBeNull();
    expect(media.getState().tvSourcePeerId).toBeNull();
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "unoffer",
      from: "host",
    });
  });

  it("clears the TV when mic-only local source on air is muted", async () => {
    const json: unknown[] = [];
    const mic = track("audio", "mic");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 1,
      peers: () => [],
      sendJson: (m) => json.push(m),
      getUserMedia: async () =>
        ({
          getVideoTracks: () => [],
          getAudioTracks: () => [mic],
        }) as unknown as MediaStream,
    });
    expect((await media.enableMic()).ok).toBe(true);
    expect((await media.putLiveOnTv("local", "主持")).ok).toBe(true);

    await media.disableMic();
    expect(media.getState().mic).toBe(false);
    expect(media.getState().programName).toBeNull();
    expect(media.getState().tvSourcePeerId).toBeNull();
    expect(json).toContainEqual({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "unoffer",
      from: "host",
    });
  });

  it("lets display media replace the camera on the same live video slot", async () => {
    const pc = mockPc();
    const cam = track("video", "cam");
    const screen = track("video", "screen");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: () => {},
      getUserMedia: async () =>
        ({
          getVideoTracks: () => [cam],
          getAudioTracks: () => [],
        }) as unknown as MediaStream,
      getDisplayMedia: async () =>
        ({
          getVideoTracks: () => [screen],
          getAudioTracks: () => [],
        }) as unknown as MediaStream,
    });
    expect((await media.enableCamera()).ok).toBe(true);
    expect(media.getState().camera).toBe(true);
    expect(media.getState().display).toBe(false);

    expect((await media.enableDisplay()).ok).toBe(true);
    expect(cam.stop).toHaveBeenCalled();
    expect(media.getState().display).toBe(true);
    expect(media.getState().camera).toBe(false);

    await media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    expect(pc.transceivers[1]!.sender.replaceTrack).toHaveBeenCalledWith(screen);
    expect(pc.transceivers[1]!.sender.replaceTrack).not.toHaveBeenLastCalledWith(
      cam
    );
  });

  it("lets the camera replace display media on the same live video slot", async () => {
    const cam = track("video", "cam");
    const screen = track("video", "screen");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 1,
      peers: () => [],
      sendJson: () => {},
      getUserMedia: async () =>
        ({
          getVideoTracks: () => [cam],
          getAudioTracks: () => [],
        }) as unknown as MediaStream,
      getDisplayMedia: async () =>
        ({
          getVideoTracks: () => [screen],
          getAudioTracks: () => [],
        }) as unknown as MediaStream,
    });
    expect((await media.enableDisplay()).ok).toBe(true);
    expect((await media.enableCamera()).ok).toBe(true);
    expect(screen.stop).toHaveBeenCalled();
    expect(media.getState().camera).toBe(true);
    expect(media.getState().display).toBe(false);
  });

  it("keeps camera and mic on the same live stream", async () => {
    const pc = mockPc();
    const cam = track("video", "cam");
    const mic = track("audio", "mic");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: () => {},
      getUserMedia: async (c) =>
        ({
          getVideoTracks: () => (c.video ? [cam] : []),
          getAudioTracks: () => (c.audio ? [mic] : []),
        }) as unknown as MediaStream,
    });
    expect((await media.enableCamera()).ok).toBe(true);
    expect((await media.enableMic()).ok).toBe(true);
    await media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    await media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    expect(pc.transceivers[1]!.sender.replaceTrack).toHaveBeenCalledWith(cam);
    expect(pc.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(mic);
  });

  it("lists remote live offers on occupants, not as catalog files", () => {
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 3,
      peers: () => [],
      sendJson: () => {},
    });
    media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
    });
    media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "g-b",
    });
    expect(media.getState().remoteLives).toEqual([
      { peerId: "g-a", camera: true, mic: false },
      { peerId: "g-b", camera: false, mic: true },
    ]);
  });

  it("does not start file RTP when a catalog video is requested", async () => {
    const pc = mockPc();
    const cam = track("video", "cam");
    const video = track("video", "prog-v");
    const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: () => {},
      getUserMedia: async () =>
        ({ getVideoTracks: () => [cam], getAudioTracks: () => [] }) as unknown as MediaStream,
      resolveLocalFile: (id) => (id === "file-1" ? file : null),
      captureProgram: async () => ({
        audio: null,
        video,
        stop: vi.fn(),
      }),
    });
    expect((await media.enableCamera()).ok).toBe(true);
    await media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    await media.onControl({
      type: SESSION_CAST_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
      id: "file-1",
    });
    expect(pc.transceivers[3]!.sender.replaceTrack).not.toHaveBeenCalledWith(
      video
    );
    expect(pc.transceivers[1]!.sender.replaceTrack).toHaveBeenLastCalledWith(
      cam
    );
  });

  it("does not drop a live watch when a catalog file asks to play", async () => {
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [],
      sendJson: (m) => json.push(m),
    });
    expect((await media.watchCamera()).ok).toBe(true);
    expect((await media.watchProgram("file-1")).ok).toBe(false);
    expect(media.getState().watching).toBe(true);
    expect(media.getState().watchingProgram).toBe(false);
    expect(json.some((m) => (m as { op?: string }).op === "release")).toBe(
      false
    );
  });

  it("forwards a guest camera track only to peers that requested it", async () => {
    const a = mockPc();
    const b = mockPc();
    const cam = track("video", "from-a");
    a.transceivers[1]!.receiver.track = cam as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 3,
      peers: () => [
        { peerId: "g-a", pc: a, via: "entrance" },
        { peerId: "g-b", pc: b, via: "entrance" },
      ],
      sendJson: () => {},
      forward: true,
    });
    media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
    });
    await media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-b",
    });
    expect(b.transceivers[1]!.sender.replaceTrack).toHaveBeenCalledWith(cam);
    expect(a.transceivers[1]!.sender.replaceTrack).not.toHaveBeenCalled();
  });

  it("lets a watcher pull one occupant's live from the roster", async () => {
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [],
      sendJson: (m) => json.push(m),
    });
    media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "offer",
      from: "host",
    });
    media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "host",
    });
    expect((await media.watchLive("host")).ok).toBe(true);
    expect(json).toContainEqual({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    expect(json).toContainEqual({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    expect(media.getState().watching).toBe(true);
    expect(media.getState().listening).toBe(true);
  });

  it("asks a guest to drop the mic and camera from the Host menu", async () => {
    const json: unknown[] = [];
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [],
      sendJson: (m) => json.push(m),
    });
    media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
    });
    media.onControl({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
    });
    expect((await media.haltLive("g-a", "audio")).ok).toBe(true);
    expect((await media.haltLive("g-a", "video")).ok).toBe(true);
    expect(json).toContainEqual({
      type: "session_booth",
      v: 1,
      op: "mute",
      from: "host",
      to: "g-a",
    });
    expect(json).toContainEqual({
      type: "session_booth",
      v: 1,
      op: "camera_off",
      from: "host",
      to: "g-a",
    });
    expect(media.getState().remoteLives).toEqual([]);
  });

  it("turns off the local mic when the Host sends mute", async () => {
    const mic = track("audio", "mic");
    const media = createRoomMedia({
      localAgentId: "g-a",
      occupantCount: () => 2,
      peers: () => [],
      sendJson: () => {},
      getUserMedia: async () =>
        ({
          getVideoTracks: () => [],
          getAudioTracks: () => [mic],
        }) as unknown as MediaStream,
    });
    expect((await media.enableMic()).ok).toBe(true);
    await media.onControl({
      type: "session_booth",
      v: 1,
      op: "mute",
      from: "host",
      to: "g-a",
    });
    expect(media.getState().mic).toBe(false);
  });

  it("does not let a guest mute the Host over booth control", async () => {
    const mic = track("audio", "mic");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [],
      sendJson: () => {},
      forward: true,
      getUserMedia: async () =>
        ({
          getVideoTracks: () => [],
          getAudioTracks: () => [mic],
        }) as unknown as MediaStream,
    });
    expect((await media.enableMic()).ok).toBe(true);
    await media.onControl({
      type: "session_booth",
      v: 1,
      op: "mute",
      from: "g-a",
      to: "host",
    });
    expect(media.getState().mic).toBe(true);
  });

  it("forwards a single guest mic to the other guest without mixing", async () => {
    const a = mockPc();
    const b = mockPc();
    const micA = track("audio", "mic-a");
    a.transceivers[0]!.receiver.track = micA as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 3,
      peers: () => [
        { peerId: "g-a", pc: a, via: "entrance" },
        { peerId: "g-b", pc: b, via: "entrance" },
      ],
      sendJson: () => {},
      forward: true,
    });
    await media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
    });
    expect(b.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(micA);
    expect(a.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(null);
  });

  it("mixes host mic with a guest mic for the other guest", async () => {
    const mixed = track("audio", "mixed-out");
    const connects: string[] = [];
    class FakeStream {
      constructor(public tracks: MediaStreamTrack[]) {}
      getAudioTracks() {
        return this.tracks;
      }
    }
    vi.stubGlobal("MediaStream", FakeStream);
    vi.stubGlobal(
      "AudioContext",
      class {
        createMediaStreamSource(stream: MediaStream) {
          const t = stream.getAudioTracks()[0];
          if (t) connects.push(t.id);
          return { connect() {} };
        }
        createMediaStreamDestination() {
          return {
            stream: { getAudioTracks: () => [mixed] },
          };
        }
        resume = vi.fn(async () => {});
        close = vi.fn();
      }
    );

    const a = mockPc();
    const b = mockPc();
    const micA = track("audio", "mic-a");
    a.transceivers[0]!.receiver.track = micA as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    const hostMic = track("audio", "host-mic");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 3,
      peers: () => [
        { peerId: "g-a", pc: a, via: "entrance" },
        { peerId: "g-b", pc: b, via: "entrance" },
      ],
      sendJson: () => {},
      forward: true,
      getUserMedia: async () =>
        ({
          getVideoTracks: () => [],
          getAudioTracks: () => [hostMic],
        }) as unknown as MediaStream,
    });
    expect((await media.enableMic()).ok).toBe(true);
    await media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
    });
    // g-b hears host+A mixed; g-a hears only host (single → no mix graph needed for A)
    expect(b.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(mixed);
    expect(connects.sort()).toEqual(["host-mic", "mic-a"]);
    expect(a.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(hostMic);
  });

  it("re-mixes remaining mics when one guest unoffers", async () => {
    const a = mockPc();
    const b = mockPc();
    const micA = track("audio", "mic-a");
    const micB = track("audio", "mic-b");
    a.transceivers[0]!.receiver.track = micA as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    b.transceivers[0]!.receiver.track = micB as unknown as {
      kind: string;
      id: string;
      readyState: "live" | "ended";
    };
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 3,
      peers: () => [
        { peerId: "g-a", pc: a, via: "entrance" },
        { peerId: "g-b", pc: b, via: "entrance" },
      ],
      sendJson: () => {},
      forward: true,
    });
    await media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "g-a",
    });
    await media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "offer",
      from: "g-b",
    });
    expect(a.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(micB);
    expect(b.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(micA);

    a.transceivers[0]!.sender.replaceTrack.mockClear();
    b.transceivers[0]!.sender.replaceTrack.mockClear();
    await media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "unoffer",
      from: "g-a",
    });
    expect(b.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(a.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(micB);
  });
});
