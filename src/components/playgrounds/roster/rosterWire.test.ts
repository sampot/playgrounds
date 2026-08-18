import { describe, expect, it } from "vitest";
import { prepareFieldsForExchange, ROSTER_SDP_TPL_AV } from "./rosterSdpCodec";
import {
  ROSTER_WIRE_MAX_CHARS,
  ROSTER_WIRE_MAX_CHARS_SIGNAL,
  decodeRosterWire,
  decodeRosterWireToSdp,
  encodeFieldsToRosterWire,
  encodeRosterWire,
  encodeSessionSdpToRosterWire,
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

  it("dc1 rebuild drops audio／video m-lines (game path)", () => {
    const fields = prepareFieldsForExchange(SAMPLE_AV_OFFER, {});
    const wire = encodeFieldsToRosterWire(fields, {
      role: "offer",
      maxChars: ROSTER_WIRE_MAX_CHARS_SIGNAL,
    });
    const decoded = decodeRosterWireToSdp(wire);
    expect(decoded.payload.tpl).toBe("dc1");
    expect(decoded.sdp).not.toMatch(/^m=audio /m);
    expect(decoded.sdp).not.toMatch(/^m=video /m);
    expect(decoded.sdp).toContain("m=application");
  });

  it("signal session wire for DataChannel-only SDP stays on dc1", () => {
    const wire = encodeSessionSdpToRosterWire(SAMPLE_OFFER, {
      role: "offer",
    });
    expect(decodeRosterWireToSdp(wire).payload.tpl).toBe("dc1");
  });

  it("signal session wire keeps audio＋video＋datachannel m-lines for 包廂", () => {
    const wire = encodeSessionSdpToRosterWire(SAMPLE_AV_OFFER, {
      role: "offer",
      maxChars: ROSTER_WIRE_MAX_CHARS_SIGNAL,
    });
    expect(wire.length).toBeLessThanOrEqual(ROSTER_WIRE_MAX_CHARS_SIGNAL);
    const decoded = decodeRosterWireToSdp(wire);
    expect(decoded.payload.tpl).toBe(ROSTER_SDP_TPL_AV);
    expect(decoded.role).toBe("offer");
    expect(decoded.sdp).toMatch(/^m=audio /m);
    expect(decoded.sdp).toMatch(/^m=video /m);
    expect(decoded.sdp).toContain("m=application");
    expect(decoded.sdp).toContain("a=mid:2");
    expect(decoded.sdp).toContain("192.168.1.10");
    expect(decoded.sdp).not.toContain("typ relay");
  });
});

const SAMPLE_AV_OFFER = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0 1 2",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:AbCd",
  "a=ice-pwd:abcdefghijklmnopqrstuvwx",
  "a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
  "a=setup:actpass",
  "a=mid:0",
  "a=rtpmap:111 opus/48000/2",
  "a=candidate:1 1 udp 2122260223 192.168.1.10 54321 typ host generation 0",
  "a=candidate:3 1 udp 41819903 198.51.100.1 9 typ relay raddr 203.0.113.5 rport 54322 generation 0",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
  "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:AbCd",
  "a=ice-pwd:abcdefghijklmnopqrstuvwx",
  "a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
  "a=setup:actpass",
  "a=mid:1",
  "a=rtpmap:96 VP8/90000",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:AbCd",
  "a=ice-pwd:abcdefghijklmnopqrstuvwx",
  "a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
  "a=setup:actpass",
  "a=mid:2",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");
