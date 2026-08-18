/**
 * 包廂 2+2 transceiver layout (PG-GO-ROOM-PLAN §7.1).
 * Presence then program; audio then video. replaceTrack, no renegotiation.
 */

export type BoothMediaLayer = "presence" | "program";
export type BoothMediaKind = "audio" | "video";

export const BOOTH_TRANSCEIVER_SLOTS = [
  { layer: "presence", kind: "audio" },
  { layer: "presence", kind: "video" },
  { layer: "program", kind: "audio" },
  { layer: "program", kind: "video" },
] as const satisfies readonly {
  layer: BoothMediaLayer;
  kind: BoothMediaKind;
}[];

export type BoothTransceiverPc = {
  getTransceivers: () => ReadonlyArray<{
    sender?: { replaceTrack: (track: MediaStreamTrack | null) => Promise<void> };
  }>;
};

export function boothTransceiverIndex(
  layer: BoothMediaLayer,
  kind: BoothMediaKind
): number {
  return BOOTH_TRANSCEIVER_SLOTS.findIndex(
    (s) => s.layer === layer && s.kind === kind
  );
}

export function boothSlotOfIndex(index: number): {
  layer: BoothMediaLayer;
  kind: BoothMediaKind;
} | null {
  return BOOTH_TRANSCEIVER_SLOTS[index] ?? null;
}

export async function replaceBoothTrack(
  pc: BoothTransceiverPc,
  layer: BoothMediaLayer,
  kind: BoothMediaKind,
  track: MediaStreamTrack | null
): Promise<boolean> {
  const index = boothTransceiverIndex(layer, kind);
  const sender = pc.getTransceivers()[index]?.sender;
  if (!sender || typeof sender.replaceTrack !== "function") return false;
  try {
    await sender.replaceTrack(track);
    return true;
  } catch {
    return false;
  }
}
