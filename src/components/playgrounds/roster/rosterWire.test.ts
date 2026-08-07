import { describe, expect, it } from "vitest";
import { prepareFieldsForExchange } from "./rosterSdpCodec";
import {
  ROSTER_WIRE_MAX_CHARS,
  ROSTER_WIRE_MAX_CHARS_SIGNAL,
  decodeRosterWire,
  decodeRosterWireToSdp,
  encodeFieldsToRosterWire,
  encodeRosterWire,
  fieldsToWirePayload,
} from "./rosterWire";

const SAMPLE_OFFER = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:AbCd",
  "a=ice-pwd:abcdefghijklmnopqrstuvwx",
  "a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=candidate:1 1 udp 2122260223 192.168.1.10 54321 typ host generation 0",
  "a=candidate:2 1 udp 1686052607 203.0.113.5 54322 typ srflx raddr 192.168.1.10 rport 54321 generation 0",
  "",
].join("\r\n");

describe("rosterWire", () => {
  it("round-trips lan offer", () => {
    const fields = prepareFieldsForExchange(SAMPLE_OFFER, { lan: true });
    const wire = encodeFieldsToRosterWire(fields, {
      role: "offer",
      lan: true,
    });
    expect(wire.length).toBeLessThanOrEqual(ROSTER_WIRE_MAX_CHARS);
    const decoded = decodeRosterWireToSdp(wire);
    expect(decoded.role).toBe("offer");
    expect(decoded.lan).toBe(true);
    expect(decoded.sdp).toContain("192.168.1.10");
    expect(decoded.sdp).not.toContain("203.0.113.5");
    expect(decoded.sdp).toContain("a=ice-ufrag:AbCd");
  });

  it("rejects oversized payload under OOB QR cap", () => {
    const fields = prepareFieldsForExchange(SAMPLE_OFFER, {});
    const payload = fieldsToWirePayload(fields, { role: "offer" });
    // Blow up fingerprint field to force size.
    payload.f = "AA".repeat(8000);
    expect(() => encodeRosterWire(payload)).toThrow(/過長/);
  });

  it("Platform signal transport allows wires above OOB QR cap", () => {
    const fields = prepareFieldsForExchange(SAMPLE_OFFER, {});
    const payload = fieldsToWirePayload(fields, { role: "offer" });
    // ~1.3k–2k chars: over OOB QR cap, under signal cap (short-link path).
    payload.f = "AA".repeat(900);
    expect(() => encodeRosterWire(payload)).toThrow(/過長/);
    const wire = encodeRosterWire(payload, {
      maxChars: ROSTER_WIRE_MAX_CHARS_SIGNAL,
    });
    expect(wire.length).toBeGreaterThan(ROSTER_WIRE_MAX_CHARS);
    expect(wire.length).toBeLessThanOrEqual(ROSTER_WIRE_MAX_CHARS_SIGNAL);
  });

  it("rejects bad wire", () => {
    expect(() => decodeRosterWire("@@@")).toThrow();
  });
});
