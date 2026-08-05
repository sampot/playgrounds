/**
 * Roster wire format: compact base64url JSON for QR / text exchange (DEC-045).
 */

import {
  ROSTER_SDP_TPL,
  type RosterIceCandidate,
  type RosterSdpFields,
  type RosterSdpRole,
  RosterSdpError,
  prepareFieldsForExchange,
  rebuildSdpFromFields,
} from "./rosterSdpCodec";

export const ROSTER_WIRE_VERSION = 1 as const;

/** Soft cap so a single QR stays scannable. */
export const ROSTER_WIRE_MAX_CHARS = 1200;

export type RosterWirePayload = {
  v: typeof ROSTER_WIRE_VERSION;
  role: RosterSdpRole;
  tpl: typeof ROSTER_SDP_TPL;
  lan?: boolean;
  /** ice-ufrag */
  u: string;
  /** ice-pwd */
  p: string;
  /** fingerprint algo */
  fa: string;
  /** fingerprint hex (colons optional) */
  f: string;
  /** setup */
  s: string;
  mid?: string;
  sp?: number;
  mm?: number;
  /** candidates: [foundation, component, protocol, priority, ip, port, type, rest?] */
  c: Array<
    | [string, number, string, number, string, number, string]
    | [string, number, string, number, string, number, string, string]
  >;
};

export class RosterWireError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RosterWireError";
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function candidateToTuple(
  c: RosterIceCandidate
): RosterWirePayload["c"][number] {
  if (c.rest) {
    return [
      c.foundation,
      c.component,
      c.protocol,
      c.priority,
      c.ip,
      c.port,
      c.type,
      c.rest,
    ];
  }
  return [
    c.foundation,
    c.component,
    c.protocol,
    c.priority,
    c.ip,
    c.port,
    c.type,
  ];
}

function tupleToCandidate(
  t: RosterWirePayload["c"][number]
): RosterIceCandidate {
  return {
    foundation: String(t[0]),
    component: Number(t[1]),
    protocol: String(t[2]),
    priority: Number(t[3]),
    ip: String(t[4]),
    port: Number(t[5]),
    type: String(t[6]),
    rest: t.length > 7 ? String(t[7]) : undefined,
  };
}

export function fieldsToWirePayload(
  fields: RosterSdpFields,
  opts: { role: RosterSdpRole; lan?: boolean }
): RosterWirePayload {
  const payload: RosterWirePayload = {
    v: ROSTER_WIRE_VERSION,
    role: opts.role,
    tpl: ROSTER_SDP_TPL,
    u: fields.ufrag,
    p: fields.pwd,
    fa: fields.fingerprintAlgo,
    f: fields.fingerprint.replace(/:/g, ""),
    s: fields.setup,
    c: fields.candidates.map(candidateToTuple),
  };
  if (opts.lan) payload.lan = true;
  if (fields.mid !== "0") payload.mid = fields.mid;
  if (fields.sctpPort !== 5000) payload.sp = fields.sctpPort;
  if (fields.maxMessageSize !== 262144) payload.mm = fields.maxMessageSize;
  return payload;
}

export function wirePayloadToFields(payload: RosterWirePayload): RosterSdpFields {
  const fpRaw = payload.f.includes(":")
    ? payload.f
    : payload.f.replace(/(.{2})(?=.)/g, "$1:");
  return {
    ufrag: payload.u,
    pwd: payload.p,
    fingerprintAlgo: payload.fa || "sha-256",
    fingerprint: fpRaw.toUpperCase(),
    setup: payload.s,
    mid: payload.mid ?? "0",
    sctpPort: payload.sp ?? 5000,
    maxMessageSize: payload.mm ?? 262144,
    candidates: (payload.c ?? []).map(tupleToCandidate),
  };
}

export function encodeRosterWire(payload: RosterWirePayload): string {
  if (payload.v !== ROSTER_WIRE_VERSION) {
    throw new RosterWireError("bad_version", `不支援的 wire 版本：${payload.v}`);
  }
  if (payload.tpl !== ROSTER_SDP_TPL) {
    throw new RosterWireError("bad_tpl", `不支援的樣板：${payload.tpl}`);
  }
  const json = JSON.stringify(payload);
  const wire = toBase64Url(utf8Encode(json));
  if (wire.length > ROSTER_WIRE_MAX_CHARS) {
    throw new RosterWireError(
      "too_large",
      `交換字串過長（${wire.length}＞${ROSTER_WIRE_MAX_CHARS}）；請改用同區網模式或減少 candidates`
    );
  }
  return wire;
}

export function decodeRosterWire(wire: string): RosterWirePayload {
  const trimmed = wire.trim().replace(/\s+/g, "");
  if (!trimmed) {
    throw new RosterWireError("empty", "交換字串為空");
  }
  if (trimmed.length > ROSTER_WIRE_MAX_CHARS * 2) {
    throw new RosterWireError("too_large", "交換字串過長");
  }
  let json: string;
  try {
    json = utf8Decode(fromBase64Url(trimmed));
  } catch {
    throw new RosterWireError("bad_encoding", "無法解碼 base64url");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RosterWireError("bad_json", "交換字串不是有效 JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new RosterWireError("bad_shape", "交換 payload 格式錯誤");
  }
  const p = parsed as Partial<RosterWirePayload>;
  if (p.v !== ROSTER_WIRE_VERSION) {
    throw new RosterWireError("bad_version", `不支援的 wire 版本：${p.v}`);
  }
  if (p.tpl !== ROSTER_SDP_TPL) {
    throw new RosterWireError("bad_tpl", `不支援的樣板：${p.tpl}`);
  }
  if (p.role !== "offer" && p.role !== "answer") {
    throw new RosterWireError("bad_role", "role 必須為 offer 或 answer");
  }
  if (typeof p.u !== "string" || typeof p.p !== "string" || typeof p.f !== "string") {
    throw new RosterWireError("incomplete", "缺少 u／p／f");
  }
  if (!Array.isArray(p.c)) {
    throw new RosterWireError("incomplete", "缺少 candidates");
  }
  return p as RosterWirePayload;
}

export function encodeSdpToRosterWire(
  sdp: string,
  opts: { role: RosterSdpRole; lan?: boolean }
): string {
  const fields = prepareFieldsForExchange(sdp, { lan: opts.lan });
  return encodeRosterWire(fieldsToWirePayload(fields, opts));
}

/** Prefer this over encodeSdpToRosterWire when fields already prepared. */
export function encodeFieldsToRosterWire(
  fields: RosterSdpFields,
  opts: { role: RosterSdpRole; lan?: boolean }
): string {
  return encodeRosterWire(fieldsToWirePayload(fields, opts));
}

export function decodeRosterWireToSdp(wire: string): {
  role: RosterSdpRole;
  lan: boolean;
  sdp: string;
  payload: RosterWirePayload;
} {
  const payload = decodeRosterWire(wire);
  const fields = wirePayloadToFields(payload);
  if (fields.candidates.length === 0) {
    throw new RosterSdpError("no_candidates", "交換字串沒有 ICE candidates");
  }
  const sdp = rebuildSdpFromFields(fields, payload.role);
  return {
    role: payload.role,
    lan: Boolean(payload.lan),
    sdp,
    payload,
  };
}
