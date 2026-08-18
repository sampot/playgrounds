/**
 * Roster wire format: compact base64url JSON for QR / text exchange (DEC-045).
 */

import { gzipSync, gunzipSync } from "fflate";
import {
  ROSTER_SDP_TPL,
  ROSTER_SDP_TPL_AV,
  type RosterIceCandidate,
  type RosterSdpFields,
  type RosterSdpRole,
  RosterSdpError,
  filterSdpCandidateLines,
  prepareFieldsForExchange,
  rebuildSdpFromFields,
  sdpHasAvMediaLines,
} from "./rosterSdpCodec";

export const ROSTER_WIRE_VERSION = 1 as const;

/**
 * OOB／文字／`#roster=`／直掃 wire QR：單張 QR 易掃上限（DEC-045）。
 * Platform 短網址 QR **不**承載此字串——見 `ROSTER_WIRE_MAX_CHARS_SIGNAL`。
 */
export const ROSTER_WIRE_MAX_CHARS = 1200;

/**
 * Platform Invite signaling（offer／answer 經 API JSON）：短網址才進 QR，
 * wire 本身不受 OOB QR 1200 限制。包廂 `av1` 是 2+2+DC 原始 SDP，
 * Chrome codec 列表就接近舊 16KiB；候選只留 BUNDLE 第一段，av1 JSON 再 gzip。
 */
export const ROSTER_WIRE_MAX_CHARS_SIGNAL = 32_768;

/** av1 JSON gzip 後加此前綴；舊客戶端未壓縮 base64 以 `{`→`e` 開頭。 */
const ROSTER_WIRE_GZIP_PREFIX = "z";
const ROSTER_WIRE_GUNZIP_MAX = ROSTER_WIRE_MAX_CHARS_SIGNAL * 4;

export type RosterWirePayloadDc = {
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

/** Signal-path 包廂：承載原始 SDP（含空 A/V m-line）. */
export type RosterWirePayloadAv = {
  v: typeof ROSTER_WIRE_VERSION;
  role: RosterSdpRole;
  tpl: typeof ROSTER_SDP_TPL_AV;
  lan?: boolean;
  sdp: string;
};

export type RosterWirePayload = RosterWirePayloadDc | RosterWirePayloadAv;

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

function gzipUtf8Json(json: string): string {
  const gz = gzipSync(utf8Encode(json), { level: 9 });
  return ROSTER_WIRE_GZIP_PREFIX + toBase64Url(gz);
}

function decodeWireBytes(trimmed: string): Uint8Array {
  if (trimmed.startsWith(ROSTER_WIRE_GZIP_PREFIX) && trimmed.length > 1) {
    const gz = fromBase64Url(trimmed.slice(1));
    const raw = gunzipSync(gz);
    if (raw.byteLength > ROSTER_WIRE_GUNZIP_MAX) {
      throw new RosterWireError("too_large", "交換字串過長");
    }
    return raw;
  }
  return fromBase64Url(trimmed);
}

function candidateToTuple(
  c: RosterIceCandidate
): RosterWirePayloadDc["c"][number] {
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
  t: RosterWirePayloadDc["c"][number]
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
): RosterWirePayloadDc {
  const payload: RosterWirePayloadDc = {
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

export function wirePayloadToFields(payload: RosterWirePayloadDc): RosterSdpFields {
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

export function encodeRosterWire(
  payload: RosterWirePayload,
  opts?: { maxChars?: number }
): string {
  if (payload.v !== ROSTER_WIRE_VERSION) {
    throw new RosterWireError("bad_version", `不支援的 wire 版本：${payload.v}`);
  }
  if (payload.tpl !== ROSTER_SDP_TPL && payload.tpl !== ROSTER_SDP_TPL_AV) {
    throw new RosterWireError("bad_tpl", `不支援的樣板：${payload.tpl}`);
  }
  const maxChars = opts?.maxChars ?? ROSTER_WIRE_MAX_CHARS;
  const json = JSON.stringify(payload);
  const wire =
    payload.tpl === ROSTER_SDP_TPL_AV ? gzipUtf8Json(json) : toBase64Url(utf8Encode(json));
  if (wire.length > maxChars) {
    const hint =
      maxChars <= ROSTER_WIRE_MAX_CHARS
        ? "；請改用同區網模式、Platform 短連結，或減少 candidates"
        : "；candidates 過多，請重試或改同區網模式";
    throw new RosterWireError(
      "too_large",
      `交換字串過長（${wire.length}＞${maxChars}）${hint}`
    );
  }
  return wire;
}

export function decodeRosterWire(wire: string): RosterWirePayload {
  const trimmed = wire.trim().replace(/\s+/g, "");
  if (!trimmed) {
    throw new RosterWireError("empty", "交換字串為空");
  }
  // Accept Platform-sized wires (short-link path); OOB stays small by encode cap.
  if (trimmed.length > ROSTER_WIRE_MAX_CHARS_SIGNAL * 2) {
    throw new RosterWireError("too_large", "交換字串過長");
  }
  let json: string;
  try {
    json = utf8Decode(decodeWireBytes(trimmed));
  } catch (err) {
    if (err instanceof RosterWireError) throw err;
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
  const p = parsed as Partial<RosterWirePayload> & { sdp?: unknown };
  if (p.v !== ROSTER_WIRE_VERSION) {
    throw new RosterWireError("bad_version", `不支援的 wire 版本：${p.v}`);
  }
  if (p.tpl !== ROSTER_SDP_TPL && p.tpl !== ROSTER_SDP_TPL_AV) {
    throw new RosterWireError("bad_tpl", `不支援的樣板：${p.tpl}`);
  }
  if (p.role !== "offer" && p.role !== "answer") {
    throw new RosterWireError("bad_role", "role 必須為 offer 或 answer");
  }
  if (p.tpl === ROSTER_SDP_TPL_AV) {
    if (typeof p.sdp !== "string" || !p.sdp.trim()) {
      throw new RosterWireError("incomplete", "缺少 sdp");
    }
    return {
      v: ROSTER_WIRE_VERSION,
      role: p.role,
      tpl: ROSTER_SDP_TPL_AV,
      sdp: p.sdp,
      ...(p.lan ? { lan: true } : {}),
    };
  }
  const dc = p as Partial<RosterWirePayloadDc>;
  if (typeof dc.u !== "string" || typeof dc.p !== "string" || typeof dc.f !== "string") {
    throw new RosterWireError("incomplete", "缺少 u／p／f");
  }
  if (!Array.isArray(dc.c)) {
    throw new RosterWireError("incomplete", "缺少 candidates");
  }
  return p as RosterWirePayloadDc;
}

export function encodeSdpToRosterWire(
  sdp: string,
  opts: { role: RosterSdpRole; lan?: boolean; maxChars?: number }
): string {
  const fields = prepareFieldsForExchange(sdp, { lan: opts.lan });
  return encodeRosterWire(fieldsToWirePayload(fields, opts), {
    maxChars: opts.maxChars,
  });
}

/** Prefer this over encodeSdpToRosterWire when fields already prepared. */
export function encodeFieldsToRosterWire(
  fields: RosterSdpFields,
  opts: { role: RosterSdpRole; lan?: boolean; maxChars?: number }
): string {
  return encodeRosterWire(fieldsToWirePayload(fields, opts), {
    maxChars: opts.maxChars,
  });
}

/**
 * Encode a localDescription SDP for OOB（dc1）or 包廂 signal（av1 passthrough）.
 * dc1 rebuilds DataChannel-only SDP; av1 keeps audio／video m-lines so
 * setRemoteDescription matches the peer that called setLocalDescription.
 */
export function encodeSessionSdpToRosterWire(
  sdp: string,
  opts: {
    role: RosterSdpRole;
    lan?: boolean;
    keepRelay?: boolean;
    maxChars?: number;
  }
): string {
  const fields = prepareFieldsForExchange(sdp, {
    lan: opts.lan,
    keepRelay: opts.keepRelay,
  });
  if (!sdpHasAvMediaLines(sdp)) {
    return encodeFieldsToRosterWire(fields, opts);
  }
  const filtered = filterSdpCandidateLines(sdp, fields.candidates);
  const payload: RosterWirePayloadAv = {
    v: ROSTER_WIRE_VERSION,
    role: opts.role,
    tpl: ROSTER_SDP_TPL_AV,
    sdp: filtered.replace(/\r\n/g, "\n"),
  };
  if (opts.lan) payload.lan = true;
  return encodeRosterWire(payload, { maxChars: opts.maxChars });
}

export function decodeRosterWireToSdp(wire: string): {
  role: RosterSdpRole;
  lan: boolean;
  sdp: string;
  payload: RosterWirePayload;
} {
  const payload = decodeRosterWire(wire);
  if (payload.tpl === ROSTER_SDP_TPL_AV) {
    const sdp = payload.sdp.includes("\r\n")
      ? payload.sdp
      : payload.sdp.replace(/\n/g, "\r\n");
    if (!/(?:^|\r?\n)a=candidate:/m.test(sdp)) {
      throw new RosterSdpError("no_candidates", "交換字串沒有 ICE candidates");
    }
    return {
      role: payload.role,
      lan: Boolean(payload.lan),
      sdp,
      payload,
    };
  }
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
