import { describe, expect, it } from "vitest";
import {
  extractSdpFields,
  filterCandidatesForLan,
  filterSdpCandidateLines,
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

  it("filterSdpCandidateLines drops relay while keeping media sections", () => {
    const fields = prepareFieldsForExchange(SAMPLE_OFFER, {});
    const filtered = filterSdpCandidateLines(SAMPLE_OFFER, fields.candidates);
    expect(filtered).toContain("m=application");
    expect(filtered).toContain("typ host");
    expect(filtered).not.toContain("typ relay");
  });

  it("prepareFieldsForExchange unique-dedups BUNDLE copies, drops TCP, keeps srflx", () => {
    const bulky = boothSdpWithCopiedCandidates();
    const fields = prepareFieldsForExchange(bulky, {});
    const hosts = fields.candidates.filter(c => c.type === "host");
    const srflx = fields.candidates.filter(c => c.type === "srflx");
    expect(hosts).toHaveLength(1);
    expect(srflx).toHaveLength(1);
    expect(fields.candidates.every(c => c.protocol.toLowerCase() === "udp")).toBe(
      true
    );
  });

  it("prepareFieldsForExchange caps host flood but keeps a srflx", () => {
    const lines = Array.from({ length: 20 }, (_, i) => {
      return `a=candidate:h${i} 1 udp ${2122260223 - i} 10.0.0.${i + 1} ${50000 + i} typ host generation 0`;
    });
    lines.push(
      "a=candidate:s1 1 udp 1686052607 203.0.113.5 54322 typ srflx raddr 10.0.0.1 rport 50000 generation 0"
    );
    const sdp = [
      "v=0",
      "o=- 1 2 IN IP4 127.0.0.1",
      "s=-",
      "t=0 0",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
      "c=IN IP4 0.0.0.0",
      "a=ice-ufrag:AbCd",
      "a=ice-pwd:abcdefghijklmnopqrstuvwx",
      "a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
      "a=setup:actpass",
      "a=mid:0",
      ...lines,
      "",
    ].join("\r\n");
    const fields = prepareFieldsForExchange(sdp, {});
    expect(fields.candidates.some(c => c.type === "srflx")).toBe(true);
    expect(fields.candidates.filter(c => c.type === "host").length).toBeLessThanOrEqual(
      6
    );
    expect(fields.candidates.length).toBeLessThanOrEqual(10);
  });

  it("BUNDLE SDP keeps ICE candidates only on the first m-section", () => {
    const bulky = boothSdpWithCopiedCandidates();
    const fields = prepareFieldsForExchange(bulky, {});
    const filtered = filterSdpCandidateLines(bulky, fields.candidates);
    const chunks = filtered.split(/^m=/m).slice(1);
    expect(chunks.length).toBe(5);
    expect(chunks[0]).toMatch(/a=candidate:/);
    expect(chunks[0]).toContain("typ srflx");
    expect(chunks[0]).toContain("a=ice-ufrag:");
    for (const later of chunks.slice(1)) {
      expect(later).not.toMatch(/a=candidate:/);
    }
  });
});

function boothSdpWithCopiedCandidates(): string {
  const ice = [
    "a=ice-ufrag:AbCd",
    "a=ice-pwd:abcdefghijklmnopqrstuvwx",
    "a=fingerprint:sha-256 11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
    "a=setup:actpass",
    "a=candidate:1 1 udp 2122260223 192.168.1.10 54321 typ host generation 0",
    "a=candidate:2 1 tcp 1518280447 192.168.1.10 9 typ host tcptype active generation 0",
    "a=candidate:3 1 udp 1686052607 203.0.113.5 54322 typ srflx raddr 192.168.1.10 rport 54321 generation 0",
  ];
  const section = (kind: string, proto: string, mid: string, extra: string) =>
    [
      `m=${kind} 9 ${proto}`,
      "c=IN IP4 0.0.0.0",
      ...ice,
      `a=mid:${mid}`,
      extra,
    ].join("\r\n");
  return [
    "v=0",
    "o=- 1 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0 1 2 3 4",
    section("audio", "UDP/TLS/RTP/SAVPF 111", "0", "a=rtpmap:111 opus/48000/2"),
    section("video", "UDP/TLS/RTP/SAVPF 96", "1", "a=rtpmap:96 VP8/90000"),
    section("audio", "UDP/TLS/RTP/SAVPF 111", "2", "a=rtpmap:111 opus/48000/2"),
    section("video", "UDP/TLS/RTP/SAVPF 96", "3", "a=rtpmap:96 VP8/90000"),
    section(
      "application",
      "UDP/DTLS/SCTP webrtc-datachannel",
      "4",
      "a=sctp-port:5000"
    ),
    "",
  ].join("\r\n");
}
