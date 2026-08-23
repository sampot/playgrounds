import { describe, expect, it } from "vitest";
import {
  parseOperatorRtcCandidate,
  programTracksFromStream,
  serializeOperatorRtcCandidate,
} from "./boothOperatorRtc";

describe("boothOperatorRtc helpers", () => {
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
