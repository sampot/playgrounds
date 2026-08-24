import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseOperatorRtcCandidate,
  programTracksFromStream,
  serializeOperatorRtcCandidate,
  acceptBoothOperatorOffer,
} from "./boothOperatorRtc";

const rtcMocks = vi.hoisted(() => ({
  attachRosterDataChannel: vi.fn(),
  waitIceComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@pg/roster/rosterPeer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pg/roster/rosterPeer")>();
  return {
    ...actual,
    attachRosterDataChannel: rtcMocks.attachRosterDataChannel,
    waitIceComplete: rtcMocks.waitIceComplete,
    buildRosterRtcConfiguration: vi.fn(() => ({})),
  };
});

vi.mock("@pg/roster/rosterBoothMedia", () => ({
  applyBoothVideoCodecPreferences: vi.fn(),
  ensureBoothTransceiversSendrecv: vi.fn(),
  replaceBoothTrack: vi.fn(),
  boothSlotOfIndex: vi.fn(),
  reserveBoothMediaTransceivers: vi.fn(),
}));

describe("boothOperatorRtc helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rtcMocks.waitIceComplete.mockResolvedValue(undefined);
  });
  it("round-trips ICE candidate JSON", () => {
    const init = {
      candidate:
        "candidate:1 1 UDP 2122252543 192.0.2.1 54321 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    };
    const raw = serializeOperatorRtcCandidate({
      toJSON: () => init,
    } as RTCIceCandidate);
    expect(parseOperatorRtcCandidate(raw)).toEqual(init);
  });

  it("accepts bare candidate strings", () => {
    const c = "candidate:1 1 UDP 2122252543 192.0.2.1 54321 typ host";
    expect(parseOperatorRtcCandidate(c)?.candidate).toBe(c);
  });

  it("extracts program tracks from a stream", () => {
    const audio = { kind: "audio" } as MediaStreamTrack;
    const video = { kind: "video" } as MediaStreamTrack;
    const stream = {
      getAudioTracks: () => [audio],
      getVideoTracks: () => [video],
    } as MediaStream;
    expect(programTracksFromStream(stream)).toEqual({ audio, video });
    expect(programTracksFromStream(null)).toEqual({ audio: null, video: null });
  });
});

describe("acceptBoothOperatorOffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rtcMocks.waitIceComplete.mockResolvedValue(undefined);
  });

  it("answers operator offer and wires roster handlers", async () => {
    const rosterHandlers = { onMessage: vi.fn() };
    const onOwnerChannel = vi.fn();
    let rosterChannel: {
      label: string;
      readyState: string;
      addEventListener: ReturnType<typeof vi.fn>;
    } | null = null;

    class MockDataChannel {
      label = "roster";
      readyState = "open";
      binaryType = "arraybuffer";
      send = vi.fn();
      close = vi.fn();
      addEventListener = vi.fn();
    }

    class MockOwnerChannel extends MockDataChannel {
      label = "booth.owner";
    }

    class MockRTCPeerConnection {
      private listeners = new Map<string, Set<(ev: unknown) => void>>();
      localDescription = { sdp: "answer-sdp" };
      addEventListener(type: string, fn: (ev: unknown) => void) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(fn);
      }
      setRemoteDescription = vi.fn().mockImplementation(async () => {
        const roster = new MockDataChannel();
        rosterChannel = roster;
        for (const fn of this.listeners.get("datachannel") ?? []) {
          fn({ channel: roster });
        }
        const owner = new MockOwnerChannel();
        for (const fn of this.listeners.get("datachannel") ?? []) {
          fn({ channel: owner });
        }
      });
      createAnswer = vi
        .fn()
        .mockResolvedValue({ type: "answer", sdp: "answer-sdp" });
      setLocalDescription = vi.fn().mockResolvedValue(undefined);
      close = vi.fn();
    }

    globalThis.RTCPeerConnection =
      MockRTCPeerConnection as unknown as typeof RTCPeerConnection;

    const result = await acceptBoothOperatorOffer({
      sdp: "offer-sdp",
      localPresence: { agentId: "host-1", name: "主持" },
      rosterHandlers,
      onOwnerChannel,
    });

    expect(result.answerSdp).toBe("answer-sdp");
    expect(rtcMocks.attachRosterDataChannel).toHaveBeenCalledWith(
      rosterChannel,
      rosterHandlers,
      { agentId: "host-1", name: "主持" }
    );
    expect(onOwnerChannel).toHaveBeenCalledWith(
      expect.objectContaining({ label: "booth.owner" })
    );
    expect(result.session.send).toBeTypeOf("function");
    result.session.close();
  });
});
