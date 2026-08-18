import { describe, expect, it, vi } from "vitest";
import { BOOTH_TRANSCEIVER_SLOTS } from "@pg/roster/rosterBoothMedia";
import { SESSION_CAST_TYPE } from "@pg/roster/rosterSessionCast";
import { SESSION_CAMERA_TYPE } from "@pg/roster/rosterSessionCamera";
import { GO_ROOM_CAMERA_PAIR_ONLY } from "./goRoom";
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
  it("refuses the camera unless exactly two people are in", async () => {
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 1,
      peers: () => [],
      sendJson: () => {},
      getUserMedia: vi.fn(),
    });
    const out = await media.enableCamera();
    expect(out.ok).toBe(false);
    expect(out.error).toBe(GO_ROOM_CAMERA_PAIR_ONLY);
    expect(media.getState().cameraBlocked).toBe(true);
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

  it("places camera on presence video after a watch request and clears it when a third person joins", async () => {
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
      null
    );
    expect(cam.stop).toHaveBeenCalled();
    expect(media.getState().camera).toBe(false);
  });

  it("does not attach a remote camera until local watch is requested", async () => {
    const pc = mockPc();
    const remote = track("video", "their-cam");
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
    media.onRemoteTrack({ track: remote }, pc);
    expect(media.getState().presenceStream).toBeNull();

    expect((await media.watchCamera()).ok).toBe(true);
    expect(json).toContainEqual({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "request",
      from: "g-a",
    });
    media.onRemoteTrack({ track: remote }, pc);
    expect(media.getState().watching).toBe(true);
  });

  it("sends session_cast.start and puts capture tracks on program senders", async () => {
    const json: unknown[] = [];
    const pc = mockPc();
    const video = track("video", "prog-v");
    const audio = track("audio", "prog-a");
    const media = createRoomMedia({
      localAgentId: "host",
      occupantCount: () => 2,
      peers: () => [{ peerId: "g-a", pc, via: "entrance" }],
      sendJson: (m) => json.push(m),
      captureProgram: async () => ({
        audio,
        video,
        stop: vi.fn(),
      }),
    });
    const file = new File([new Uint8Array(4)], "clip.mp4", {
      type: "video/mp4",
    });
    expect((await media.startProgram(file)).ok).toBe(true);
    expect(json[0]).toMatchObject({
      type: SESSION_CAST_TYPE,
      op: "start",
      from: "host",
      kind: "video",
      name: "clip.mp4",
    });
    expect(pc.transceivers[2]!.sender.replaceTrack).toHaveBeenCalledWith(audio);
    expect(pc.transceivers[3]!.sender.replaceTrack).toHaveBeenCalledWith(video);
    expect(media.getState().programName).toBe("clip.mp4");
  });

  it("forwards a guest program track onto other entrance senders", async () => {
    const a = mockPc();
    const b = mockPc();
    const prog = track("video", "from-a");
    a.transceivers[3]!.receiver.track = prog as unknown as {
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
    await media.forwardFrom("g-a");
    expect(b.transceivers[3]!.sender.replaceTrack).toHaveBeenCalledWith(prog);
    expect(a.transceivers[3]!.sender.replaceTrack).not.toHaveBeenCalled();
  });
});
