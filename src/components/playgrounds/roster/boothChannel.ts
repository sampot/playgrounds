/**
 * Booth Control Channel + BoothAnchor wire types (PG-GO-ROOM-ENGINE-PLAN §7–10).
 * Shared by go-client Embedded Hub, Operator Shell, and Platform BoothAnchor DO.
 */

export const BOOTH_CHANNEL_VERSION = 1 as const;

export type BoothSubscribeScope =
  | "members"
  | "cast"
  | "inviteGate"
  | "shareFiles"
  | "privateFiles"
  | "chatTail"
  | "engineHealth"
  | "director";

export type BoothErrorCode =
  | "not_director"
  | "engine_busy"
  | "session_ended"
  | "invalid_intent"
  | "invite_gate"
  | "cast_rejected"
  | "not_owner"
  | "private_not_found"
  | "transfer_rejected";

export type BoothMemberKind = "host" | "guest" | "peer" | "operator";

/** Share or private library entry metadata (bytes via Owner file channel or local FS). */
export type BoothFileSummary = {
  id: string;
  name: string;
  size: number;
  mime?: string;
  status: "ready" | "receiving" | "error";
};

/** @deprecated Use BoothFileSummary */
export type BoothShareFileSummary = BoothFileSummary;

export type BoothStateSnapshot = {
  sessionId: string;
  ownerUserId: string;
  engineMode: "embedded" | "daemon";
  deviceLabel?: string;
  hostPeerId?: string;
  hostDisplayName?: string;
  members: Array<{
    peerId: string;
    displayName: string;
    kind: BoothMemberKind;
    isHost: boolean;
    live?: { camera: boolean; mic: boolean; display: boolean };
  }>;
  cast?: {
    kind: "idle" | "file" | "live" | "play";
  } & Record<string, unknown>;
  inviteGate: "none" | "live" | "expired";
  inviteShortUrl?: string;
  inviteExpiresAt?: number;
  shareFileCount: number;
  shareFiles?: BoothFileSummary[];
  privateFileCount?: number;
  privateFiles?: BoothFileSummary[];
  chatTail?: Array<Record<string, unknown>>;
  guestCount: number;
  anchor: "offline" | "registering" | "online" | "degraded";
  director?: { shellId: string; role: "host" | "operator" };
};

export type BoothEnvelope = {
  type: string;
  v: typeof BOOTH_CHANNEL_VERSION;
  id?: string;
  ts?: number;
  [key: string]: unknown;
};

export type BoothOwnerChunk = {
  type: "booth.owner.chunk";
  v: typeof BOOTH_CHANNEL_VERSION;
  transferId: string;
  seq: number;
  eof?: boolean;
};

export function isBoothOwnerChunk(raw: unknown): raw is BoothOwnerChunk {
  if (!isBoothEnvelope(raw)) return false;
  return (
    raw.type === "booth.owner.chunk" &&
    typeof raw.transferId === "string" &&
    typeof raw.seq === "number"
  );
}

export type AnchorSignalFrame = {
  type: "anchor.signal";
  v: typeof BOOTH_CHANNEL_VERSION;
  phase: "operator-webrtc";
  op: "offer" | "answer" | "candidate";
  sdp?: string;
  candidate?: string;
};

export type BoothJoinOfferFrame = {
  type: "booth.join.offer";
  v: typeof BOOTH_CHANNEL_VERSION;
  joinId: string;
  inviteId: string;
  offerWire: string;
};

export type BoothJoinAnswerFrame = {
  type: "booth.join.answer";
  v: typeof BOOTH_CHANNEL_VERSION;
  joinId: string;
  answerWire: string;
};

export function isBoothJoinOfferFrame(raw: unknown): raw is BoothJoinOfferFrame {
  if (!isBoothEnvelope(raw)) return false;
  return (
    raw.type === "booth.join.offer" &&
    typeof raw.joinId === "string" &&
    typeof raw.inviteId === "string" &&
    typeof raw.offerWire === "string"
  );
}

export function isBoothJoinAnswerFrame(raw: unknown): raw is BoothJoinAnswerFrame {
  if (!isBoothEnvelope(raw)) return false;
  return (
    raw.type === "booth.join.answer" &&
    typeof raw.joinId === "string" &&
    typeof raw.answerWire === "string"
  );
}

export function isBoothEnvelope(raw: unknown): raw is BoothEnvelope {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as BoothEnvelope;
  return typeof o.type === "string" && o.v === BOOTH_CHANNEL_VERSION;
}

export function isAnchorSignalFrame(raw: unknown): raw is AnchorSignalFrame {
  if (!isBoothEnvelope(raw)) return false;
  return raw.type === "anchor.signal" && raw.phase === "operator-webrtc";
}

export function parseBoothJson(text: string): BoothEnvelope | null {
  try {
    const raw = JSON.parse(text) as unknown;
    return isBoothEnvelope(raw) ? raw : null;
  } catch {
    return null;
  }
}
