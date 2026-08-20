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

type BoothTransceiver = {
  direction?: string;
  sender?: {
    replaceTrack: (track: MediaStreamTrack | null) => Promise<void>;
    track?: { kind?: string } | null;
  };
  receiver?: { track?: { kind?: string } | null };
  setCodecPreferences?: (codecs: unknown[]) => void;
};

export type BoothTransceiverPc = {
  getTransceivers: () => ReadonlyArray<BoothTransceiver>;
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

function transceiverKind(t: BoothTransceiver): BoothMediaKind | null {
  const k = t.receiver?.track?.kind ?? t.sender?.track?.kind;
  if (k === "audio" || k === "video") return k;
  return null;
}

export function boothTransceiverOf(
  pc: BoothTransceiverPc,
  layer: BoothMediaLayer,
  kind: BoothMediaKind
): BoothTransceiver | null {
  const list = pc.getTransceivers();
  const nth = layer === "presence" ? 0 : 1;
  const matches = list.filter((t) => transceiverKind(t) === kind);
  return matches[nth] ?? list[boothTransceiverIndex(layer, kind)] ?? null;
}

/** Prefer H264／VP8 so Chrome captureStream is decodable on Edge. */
export function boothVideoCodecPreferences<T extends { mimeType: string }>(
  codecs: readonly T[] | undefined
): T[] {
  if (!codecs?.length) return [];
  const rank = (mime: string) => {
    const m = mime.toLowerCase();
    if (m.includes("h264")) return 0;
    if (m.includes("vp8")) return 1;
    return 9;
  };
  return codecs.filter((c) => rank(c.mimeType) < 9).sort(
    (a, b) => rank(a.mimeType) - rank(b.mimeType)
  );
}

export function applyBoothVideoCodecPreferences(pc: BoothTransceiverPc): void {
  let caps: { codecs?: { mimeType: string }[] } | null = null;
  try {
    caps =
      typeof RTCRtpSender !== "undefined"
        ? RTCRtpSender.getCapabilities?.("video")
        : null;
  } catch {
    return;
  }
  const preferred = boothVideoCodecPreferences(caps?.codecs);
  if (!preferred.length) return;
  for (const t of pc.getTransceivers()) {
    if (transceiverKind(t) !== "video") continue;
    if (typeof t.setCodecPreferences !== "function") continue;
    try {
      t.setCodecPreferences(preferred);
    } catch {
      /* ignore */
    }
  }
}

export async function replaceBoothTrack(
  pc: BoothTransceiverPc,
  layer: BoothMediaLayer,
  kind: BoothMediaKind,
  track: MediaStreamTrack | null
): Promise<boolean> {
  const tr = boothTransceiverOf(pc, layer, kind);
  const sender = tr?.sender;
  if (!sender || typeof sender.replaceTrack !== "function") return false;
  try {
    await sender.replaceTrack(track);
    if (track && tr && tr.direction && tr.direction !== "sendrecv") {
      tr.direction = "sendrecv";
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Answerer must keep sendrecv in the SDP even with empty senders.
 * Otherwise Chrome settles host=recvonly / guest=sendonly and later
 * replaceTrack never produces outbound RTP (currentDirection stays recvonly).
 */
export function ensureBoothTransceiversSendrecv(
  pc: BoothTransceiverPc
): number {
  let changed = 0;
  for (const tr of pc.getTransceivers()) {
    if (tr.direction && tr.direction !== "sendrecv") {
      tr.direction = "sendrecv";
      changed += 1;
    }
  }
  return changed;
}
