import { describe, expect, it } from "vitest";
import { sdpHasIceCandidates } from "./rosterPeer";

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
