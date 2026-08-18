import { describe, expect, it, vi } from "vitest";
import {
  buildRosterRtcConfiguration,
  iceServersIncludeTurn,
  reserveBoothMediaTransceivers,
  reserveRosterMediaTransceivers,
  sdpHasAvMediaLines,
  sdpHasBoothMediaLines,
  sdpHasIceCandidates,
} from "./rosterPeer";

describe("sdpHasIceCandidates", () => {
  it("detects a=candidate lines", () => {
    const sdp = [
      "v=0",
      "a=ice-ufrag:x",
      "a=candidate:1 1 UDP 2122252543 192.168.1.2 54321 typ host",
      "a=end-of-candidates",
    ].join("\r\n");
    expect(sdpHasIceCandidates(sdp)).toBe(true);
  });

  it("is false without candidates", () => {
    expect(sdpHasIceCandidates("v=0\r\na=ice-ufrag:x\r\n")).toBe(false);
    expect(sdpHasIceCandidates(null)).toBe(false);
    expect(sdpHasIceCandidates("")).toBe(false);
  });
});

describe("iceServersIncludeTurn", () => {
  it("is false for empty／STUN-only", () => {
    expect(iceServersIncludeTurn(undefined)).toBe(false);
    expect(iceServersIncludeTurn([])).toBe(false);
    expect(
      iceServersIncludeTurn([{ urls: "stun:stun.l.google.com:19302" }])
    ).toBe(false);
  });

  it("detects turn／turns urls", () => {
    expect(
      iceServersIncludeTurn([{ urls: "turn:relay.example.test:3478" }])
    ).toBe(true);
    expect(
      iceServersIncludeTurn([
        { urls: ["stun:stun.example", "turns:relay.example:5349"] },
      ])
    ).toBe(true);
  });
});

describe("buildRosterRtcConfiguration", () => {
  it("uses default STUN without iceTransportPolicy when no servers given", () => {
    const cfg = buildRosterRtcConfiguration(false, undefined);
    expect(cfg.iceServers?.length).toBeGreaterThan(0);
    expect(cfg.iceTransportPolicy).toBeUndefined();
  });

  it("keeps lan empty and never forces relay", () => {
    expect(
      buildRosterRtcConfiguration(true, [
        { urls: "turn:relay.example.test" },
      ])
    ).toEqual({ iceServers: [] });
  });

  it("forces relay-only when official TURN servers are present", () => {
    const servers = [{ urls: "turn:relay.example.test:3478" }];
    expect(buildRosterRtcConfiguration(false, servers)).toEqual({
      iceServers: servers,
      iceTransportPolicy: "relay",
    });
  });

  it("does not force relay for STUN-only custom servers", () => {
    const servers = [{ urls: "stun:stun.example.test" }];
    expect(buildRosterRtcConfiguration(false, servers)).toEqual({
      iceServers: servers,
    });
  });
});

describe("reserveRosterMediaTransceivers", () => {
  it("adds sendrecv audio and video transceivers", () => {
    const addTransceiver = vi.fn();
    reserveRosterMediaTransceivers({ addTransceiver });
    expect(addTransceiver).toHaveBeenCalledTimes(2);
    expect(addTransceiver).toHaveBeenCalledWith("audio", {
      direction: "sendrecv",
    });
    expect(addTransceiver).toHaveBeenCalledWith("video", {
      direction: "sendrecv",
    });
  });
});

describe("reserveBoothMediaTransceivers", () => {
  it("adds presence then program sendrecv pairs in frozen order", () => {
    const addTransceiver = vi.fn();
    reserveBoothMediaTransceivers({ addTransceiver });
    expect(addTransceiver.mock.calls).toEqual([
      ["audio", { direction: "sendrecv" }],
      ["video", { direction: "sendrecv" }],
      ["audio", { direction: "sendrecv" }],
      ["video", { direction: "sendrecv" }],
    ]);
  });
});

describe("sdpHasAvMediaLines", () => {
  it("requires both audio and video m-lines", () => {
    expect(sdpHasAvMediaLines("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n")).toBe(
      false
    );
    expect(
      sdpHasAvMediaLines(
        "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n"
      )
    ).toBe(true);
    expect(sdpHasAvMediaLines(null)).toBe(false);
  });
});

describe("sdpHasBoothMediaLines", () => {
  it("requires two audio and two video m-lines", () => {
    expect(
      sdpHasBoothMediaLines(
        "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n"
      )
    ).toBe(false);
    expect(
      sdpHasBoothMediaLines(
        [
          "v=0",
          "m=audio 9 UDP/TLS/RTP/SAVPF 111",
          "m=video 9 UDP/TLS/RTP/SAVPF 96",
          "m=audio 9 UDP/TLS/RTP/SAVPF 111",
          "m=video 9 UDP/TLS/RTP/SAVPF 96",
        ].join("\r\n")
      )
    ).toBe(true);
    expect(sdpHasBoothMediaLines(null)).toBe(false);
  });
});
