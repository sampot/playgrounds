import { describe, expect, it, vi } from "vitest";
import {
  BOOTH_TRANSCEIVER_SLOTS,
  boothSlotOfIndex,
  boothTransceiverIndex,
  boothVideoCodecPreferences,
  ensureBoothTransceiversSendrecv,
  replaceBoothTrack,
} from "./rosterBoothMedia";

function mockPc() {
  const transceivers = BOOTH_TRANSCEIVER_SLOTS.map((slot) => ({
    direction: "sendrecv" as string,
    sender: {
      track: null as { kind: string } | null,
      replaceTrack: vi.fn(async (t: { kind: string } | null) => {
        transceivers[boothTransceiverIndex(slot.layer, slot.kind)]!.sender.track =
          t;
      }),
    },
    receiver: {
      track: { kind: slot.kind },
    },
  }));
  return {
    getTransceivers: () => transceivers,
  };
}

describe("booth transceiver slots", () => {
  it("freezes presence then program, audio then video", () => {
    expect(BOOTH_TRANSCEIVER_SLOTS.map((s) => `${s.layer}:${s.kind}`)).toEqual([
      "presence:audio",
      "presence:video",
      "program:audio",
      "program:video",
    ]);
    expect(boothTransceiverIndex("program", "video")).toBe(3);
    expect(boothSlotOfIndex(1)).toEqual({ layer: "presence", kind: "video" });
    expect(boothSlotOfIndex(9)).toBeNull();
  });
});

describe("boothVideoCodecPreferences", () => {
  it("keeps H264 and VP8 so Edge can decode a Chrome file stream", () => {
    expect(
      boothVideoCodecPreferences([
        { mimeType: "video/AV1" },
        { mimeType: "video/VP9" },
        { mimeType: "video/VP8" },
        { mimeType: "video/H264" },
      ]).map((c) => c.mimeType)
    ).toEqual(["video/H264", "video/VP8"]);
  });
});

describe("replaceBoothTrack", () => {
  it("replaces the matching sender and ignores a missing slot", async () => {
    const pc = mockPc();
    const track = { kind: "video" };
    expect(
      await replaceBoothTrack(pc, "program", "video", track as MediaStreamTrack)
    ).toBe(true);
    expect(pc.getTransceivers()[3]!.sender.replaceTrack).toHaveBeenCalledWith(
      track
    );
    expect(
      await replaceBoothTrack(
        { getTransceivers: () => [] },
        "program",
        "video",
        null
      )
    ).toBe(false);
  });

  it("turns the sender back to sendrecv so the answerer can push later", async () => {
    const pc = mockPc();
    pc.getTransceivers()[3]!.direction = "recvonly";
    const track = { kind: "video" };
    await replaceBoothTrack(pc, "program", "video", track as MediaStreamTrack);
    expect(pc.getTransceivers()[3]!.direction).toBe("sendrecv");
  });
});

describe("ensureBoothTransceiversSendrecv", () => {
  it("forces every transceiver back to sendrecv before createAnswer", () => {
    const pc = mockPc();
    for (const tr of pc.getTransceivers()) tr.direction = "recvonly";
    expect(ensureBoothTransceiversSendrecv(pc)).toBe(4);
    expect(pc.getTransceivers().every((t) => t.direction === "sendrecv")).toBe(
      true
    );
    expect(ensureBoothTransceiversSendrecv(pc)).toBe(0);
  });
});
