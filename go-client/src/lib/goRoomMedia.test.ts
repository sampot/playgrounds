import { describe, expect, it, vi } from "vitest";
import { BOOTH_TRANSCEIVER_SLOTS } from "@pg/roster/rosterBoothMedia";
import { SESSION_CAST_TYPE } from "@pg/roster/rosterSessionCast";
import { SESSION_CAMERA_TYPE, SESSION_MIC_TYPE } from "@pg/roster/rosterSessionCamera";
import { createRoomMedia } from "./goRoomMedia";

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

  it("does not push mic RTP until a peer requests to listen", async () => {
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
    expect(pc.transceivers[0]!.sender.replaceTrack).not.toHaveBeenCalledWith(
      mic
    );

    await media.onControl({
      type: SESSION_MIC_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    expect(pc.transceivers[0]!.sender.replaceTrack).toHaveBeenCalledWith(mic);
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
});
