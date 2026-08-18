import { describe, expect, it, vi } from "vitest";
import {
  BOOTH_TRANSCEIVER_SLOTS,
  boothSlotOfIndex,
  boothTransceiverIndex,
  replaceBoothTrack,
} from "./rosterBoothMedia";

function mockPc() {
  const transceivers = BOOTH_TRANSCEIVER_SLOTS.map((slot) => ({
    sender: {
      track: null as { kind: string } | null,
      replaceTrack: vi.fn(async (t: { kind: string } | null) => {
        transceivers[boothTransceiverIndex(slot.layer, slot.kind)]!.sender.track =
          t;
      }),
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
});
