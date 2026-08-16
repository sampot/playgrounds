import { describe, expect, it } from "vitest";
import {
  buildRosterRtcConfiguration,
  iceServersIncludeTurn,
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
