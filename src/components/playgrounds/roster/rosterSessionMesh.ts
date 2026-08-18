/**
 * Guest↔Guest mesh signaling over the Host DataChannel (PG-GO-ROOM-PLAN §7.4).
 * Host only forwards JSON; SDP／candidates never go back to Platform.
 */

import { ROSTER_WIRE_MAX_CHARS_SIGNAL } from "./rosterWire";

export const SESSION_MESH_TYPE = "session_mesh" as const;
export const SESSION_MESH_VERSION = 1 as const;

export type SessionMeshOp =
  | "hello"
  | "bye"
  | "offer"
  | "answer"
  | "candidate"
  | "fail";

export type SessionMeshMessage = {
  type: typeof SESSION_MESH_TYPE;
  v: typeof SESSION_MESH_VERSION;
  op: SessionMeshOp;
  peerId?: string;
  from?: string;
  to?: string;
  sdp?: string;
  cand?: string;
};

const MESH_OPS = new Set<SessionMeshOp>([
  "hello",
  "bye",
  "offer",
  "answer",
  "candidate",
  "fail",
]);

const ID_MAX = 128;
const SDP_MAX = ROSTER_WIRE_MAX_CHARS_SIGNAL;
const CAND_MAX = 512;

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
}

function isSdp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= SDP_MAX;
}

export function shouldOfferMesh(localAgentId: string, remoteAgentId: string): boolean {
  return localAgentId < remoteAgentId;
}

export function isSessionMeshMessage(data: unknown): data is SessionMeshMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_MESH_TYPE) return false;
  if (m.v !== SESSION_MESH_VERSION) return false;
  if (typeof m.op !== "string" || !MESH_OPS.has(m.op as SessionMeshOp)) {
    return false;
  }
  if (m.peerId !== undefined && !isId(m.peerId)) return false;
  if (m.from !== undefined && !isId(m.from)) return false;
  if (m.to !== undefined && !isId(m.to)) return false;
  if (m.sdp !== undefined && !isSdp(m.sdp)) return false;
  if (m.cand !== undefined) {
    if (typeof m.cand !== "string" || !m.cand || m.cand.length > CAND_MAX) {
      return false;
    }
  }
  if (m.op === "hello" || m.op === "bye") return Boolean(m.peerId);
  if (m.op === "offer" || m.op === "answer") {
    return Boolean(m.from && m.to && m.sdp);
  }
  if (m.op === "candidate") return Boolean(m.from && m.to && m.cand);
  if (m.op === "fail") return Boolean(m.from && m.to);
  return false;
}

export function buildSessionMeshMessage(opts: {
  op: SessionMeshOp;
  peerId?: string;
  from?: string;
  to?: string;
  sdp?: string;
  cand?: string;
}): SessionMeshMessage {
  const msg: SessionMeshMessage = {
    type: SESSION_MESH_TYPE,
    v: SESSION_MESH_VERSION,
    op: opts.op,
  };
  if (opts.peerId) msg.peerId = opts.peerId;
  if (opts.from) msg.from = opts.from;
  if (opts.to) msg.to = opts.to;
  if (opts.sdp) msg.sdp = opts.sdp;
  if (opts.cand) msg.cand = opts.cand;
  return msg;
}
