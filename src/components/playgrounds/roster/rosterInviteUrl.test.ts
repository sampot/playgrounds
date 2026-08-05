import { describe, expect, it } from "vitest";
import { prepareFieldsForExchange } from "./rosterSdpCodec";
import { encodeFieldsToRosterWire } from "./rosterWire";
import {
  buildRosterInviteUrl,
  extractRosterWireFromText,
  hasRosterInviteInLocation,
  parseRosterInviteFromLocation,
} from "./rosterInviteUrl";

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
  "",
].join("\r\n");

function sampleOfferWire(lan = false): string {
  const fields = prepareFieldsForExchange(SAMPLE_OFFER, { lan });
  return encodeFieldsToRosterWire(fields, { role: "offer", lan });
}

describe("rosterInviteUrl", () => {
  it("builds hash invite URL", () => {
    const wire = sampleOfferWire();
    const url = buildRosterInviteUrl({
      origin: "https://play.samkuo.me",
      pathname: "/",
      wire,
    });
    expect(url).toBe(`https://play.samkuo.me/#roster=${wire}`);
  });

  it("parses offer from location hash", () => {
    const wire = sampleOfferWire(true);
    const parsed = parseRosterInviteFromLocation({
      hash: `#roster=${wire}`,
    });
    expect(parsed).toMatchObject({ wire, role: "offer", lan: true });
    expect(hasRosterInviteInLocation({ hash: `#roster=${wire}` })).toBe(true);
  });

  it("extracts wire from pasted URL or bare wire", () => {
    const wire = sampleOfferWire();
    const url = buildRosterInviteUrl({
      origin: "https://play.samkuo.me",
      wire,
    });
    expect(extractRosterWireFromText(url)).toBe(wire);
    expect(extractRosterWireFromText(`  ${wire}  `)).toBe(wire);
    expect(extractRosterWireFromText("not-a-wire!!!")).toBeNull();
  });
});
