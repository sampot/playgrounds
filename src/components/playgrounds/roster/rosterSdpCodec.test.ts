import { describe, expect, it } from "vitest";
import {
  extractSdpFields,
  filterCandidatesForLan,
  isLanCandidateIp,
  prepareFieldsForExchange,
  rebuildSdpFromFields,
} from "./rosterSdpCodec";

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
  "a=max-message-size:262144",
  "a=candidate:1 1 udp 2122260223 192.168.1.10 54321 typ host generation 0",
  "a=candidate:2 1 udp 1686052607 203.0.113.5 54322 typ srflx raddr 192.168.1.10 rport 54321 generation 0",
  "a=candidate:3 1 udp 41819903 198.51.100.1 9 typ relay raddr 203.0.113.5 rport 54322 generation 0",
  "",
].join("\r\n");

describe("rosterSdpCodec", () => {
  it("extracts fields and rebuilds offer", () => {
    const fields = extractSdpFields(SAMPLE_OFFER);
    expect(fields.ufrag).toBe("AbCd");
    expect(fields.candidates).toHaveLength(3);
    const sdp = rebuildSdpFromFields(fields, "offer");
    expect(sdp).toContain("a=ice-ufrag:AbCd");
    expect(sdp).toContain("typ host");
    expect(sdp).toContain("a=end-of-candidates");
  });

  it("filters lan candidates including Chrome mDNS .local hosts", () => {
    expect(isLanCandidateIp("192.168.1.10")).toBe(true);
    expect(isLanCandidateIp("203.0.113.5")).toBe(false);
    expect(isLanCandidateIp("abcd-ef12-3456.local")).toBe(true);
    const fields = extractSdpFields(SAMPLE_OFFER);
    const lan = filterCandidatesForLan(fields.candidates);
    expect(lan).toHaveLength(1);
    expect(lan[0]!.ip).toBe("192.168.1.10");

    const mdnsOffer = SAMPLE_OFFER.replace(
      "192.168.1.10 54321 typ host",
      "a1b2c3d4-e5f6-7890.local 54321 typ host"
    );
    const mdns = prepareFieldsForExchange(mdnsOffer, { lan: true });
    expect(mdns.candidates).toHaveLength(1);
    expect(mdns.candidates[0]!.ip).toContain(".local");
  });

  it("prepareFieldsForExchange drops relay and optionally lan-filters", () => {
    const normal = prepareFieldsForExchange(SAMPLE_OFFER, {});
    expect(normal.candidates.every(c => c.type !== "relay")).toBe(true);
    expect(normal.candidates.some(c => c.type === "srflx")).toBe(true);

    const lan = prepareFieldsForExchange(SAMPLE_OFFER, { lan: true });
    expect(lan.candidates).toHaveLength(1);
    expect(lan.candidates[0]!.type).toBe("host");
  });

  it("keepRelay retains relay candidates for Platform TURN path", () => {
    const kept = prepareFieldsForExchange(SAMPLE_OFFER, { keepRelay: true });
    expect(kept.candidates.some(c => c.type === "relay")).toBe(true);
  });
});
