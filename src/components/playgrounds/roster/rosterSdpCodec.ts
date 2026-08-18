/**
 * Roster SDP template codec (DEC-045): extract / rebuild DataChannel-only SDP.
 * Template id: dc1
 */

export const ROSTER_SDP_TPL = "dc1" as const;
/** Signal-path 包廂：保留 audio／video／datachannel m-line（dc1 只重建 DC）. */
export const ROSTER_SDP_TPL_AV = "av1" as const;

export type RosterSdpTpl = typeof ROSTER_SDP_TPL | typeof ROSTER_SDP_TPL_AV;

export type RosterSdpRole = "offer" | "answer";

export type RosterIceCandidate = {
  foundation: string;
  component: number;
  protocol: string;
  priority: number;
  ip: string;
  port: number;
  type: string;
  /** Trailing attrs after typ (e.g. raddr / rport / generation / ufrag). */
  rest?: string;
};

export type RosterSdpFields = {
  ufrag: string;
  pwd: string;
  fingerprintAlgo: string;
  fingerprint: string;
  setup: string;
  mid: string;
  sctpPort: number;
  maxMessageSize: number;
  candidates: RosterIceCandidate[];
};

export class RosterSdpError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RosterSdpError";
  }
}

const PRIV_V4 =
  /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

/** Private / link-local IP, or Chrome mDNS host obfuscation (`*.local`). */
export function isLanCandidateAddress(addr: string): boolean {
  const t = addr.trim().toLowerCase();
  if (!t) return false;
  // Chromium mDNS ICE: host candidates use UUID.local instead of real LAN IP.
  if (t.endsWith(".local")) return true;
  if (t === "::1" || t.startsWith("fe80:") || t.startsWith("fc") || t.startsWith("fd")) {
    return true;
  }
  if (PRIV_V4.test(t)) return true;
  return false;
}

/** @deprecated use isLanCandidateAddress */
export function isLanCandidateIp(ip: string): boolean {
  return isLanCandidateAddress(ip);
}

export function filterCandidatesForLan(
  candidates: RosterIceCandidate[]
): RosterIceCandidate[] {
  const udpHost = candidates.filter(
    c => c.type === "host" && c.protocol.toLowerCase() === "udp"
  );
  // Prefer private / .local addresses; if browser only emitted other host forms, keep all UDP host.
  const preferred = udpHost.filter(c => isLanCandidateAddress(c.ip));
  return preferred.length > 0 ? preferred : udpHost;
}

export function sdpHasAvMediaLines(sdp: string | undefined | null): boolean {
  if (!sdp) return false;
  return /(?:^|\r?\n)m=audio /m.test(sdp) && /(?:^|\r?\n)m=video /m.test(sdp);
}

/** 包廂 2+2：在場音／視＋節目音／視（見 PG-GO-ROOM-PLAN §7.1）。 */
export function sdpHasBoothMediaLines(sdp: string | undefined | null): boolean {
  if (!sdp) return false;
  const audio = sdp.match(/(?:^|\r?\n)m=audio /gm);
  const video = sdp.match(/(?:^|\r?\n)m=video /gm);
  return (audio?.length ?? 0) >= 2 && (video?.length ?? 0) >= 2;
}

export function candidateIdentity(c: RosterIceCandidate): string {
  return `${c.foundation}|${c.component}|${c.protocol.toLowerCase()}|${c.ip}|${c.port}|${c.type}`;
}

/** Drop a=candidate lines that are not in `keep` (relay／LAN filters).
 *  BUNDLE shares one ICE transport — keep candidates only on the first m-section. */
export function filterSdpCandidateLines(
  sdp: string,
  keep: RosterIceCandidate[]
): string {
  const allowed = new Set(keep.map(candidateIdentity));
  const nl = sdp.includes("\r\n") ? "\r\n" : "\n";
  const normalized = sdp.replace(/\r\n/g, "\n");
  const bundleOnce = /(?:^|\n)a=group:BUNDLE /m.test(normalized);
  const lines = normalized.split("\n");
  let mSection = 0;
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("m=")) {
      mSection += 1;
      out.push(raw);
      continue;
    }
    if (line.startsWith("a=candidate:")) {
      if (bundleOnce && mSection > 1) continue;
      const c = parseCandidateLine(line);
      if (!c) continue;
      if (!allowed.has(candidateIdentity(c))) continue;
      out.push(raw);
      continue;
    }
    out.push(raw);
  }
  return out.join(nl);
}

function parseCandidateLine(line: string): RosterIceCandidate | null {
  // a=candidate:<foundation> <comp> <proto> <prio> <ip> <port> typ <type> ...
  const body = line.startsWith("a=candidate:")
    ? line.slice("a=candidate:".length)
    : line.startsWith("candidate:")
      ? line.slice("candidate:".length)
      : null;
  if (!body) return null;
  const parts = body.trim().split(/\s+/);
  if (parts.length < 8) return null;
  const typIdx = parts.indexOf("typ");
  if (typIdx < 0 || typIdx + 1 >= parts.length) return null;
  const type = parts[typIdx + 1]!;
  const restParts = parts.slice(typIdx + 2);
  return {
    foundation: parts[0]!,
    component: Number(parts[1]),
    protocol: parts[2]!,
    priority: Number(parts[3]),
    ip: parts[4]!,
    port: Number(parts[5]),
    type,
    rest: restParts.length ? restParts.join(" ") : undefined,
  };
}

export function extractSdpFields(sdp: string): RosterSdpFields {
  const lines = sdp.replace(/\r\n/g, "\n").split("\n");
  let ufrag = "";
  let pwd = "";
  let fingerprintAlgo = "sha-256";
  let fingerprint = "";
  let setup = "actpass";
  let mid = "0";
  let sctpPort = 5000;
  let maxMessageSize = 262144;
  const candidates: RosterIceCandidate[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("a=ice-ufrag:")) ufrag = line.slice("a=ice-ufrag:".length);
    else if (line.startsWith("a=ice-pwd:")) pwd = line.slice("a=ice-pwd:".length);
    else if (line.startsWith("a=fingerprint:")) {
      const rest = line.slice("a=fingerprint:".length);
      const sp = rest.indexOf(" ");
      if (sp > 0) {
        fingerprintAlgo = rest.slice(0, sp);
        fingerprint = rest.slice(sp + 1).trim();
      }
    } else if (line.startsWith("a=setup:")) setup = line.slice("a=setup:".length);
    else if (line.startsWith("a=mid:")) mid = line.slice("a=mid:".length);
    else if (line.startsWith("a=sctp-port:")) {
      sctpPort = Number(line.slice("a=sctp-port:".length)) || 5000;
    } else if (line.startsWith("a=max-message-size:")) {
      maxMessageSize =
        Number(line.slice("a=max-message-size:".length)) || 262144;
    } else if (line.startsWith("a=candidate:")) {
      const c = parseCandidateLine(line);
      if (c && Number.isFinite(c.component) && Number.isFinite(c.port)) {
        candidates.push(c);
      }
    }
  }

  if (!ufrag || !pwd || !fingerprint) {
    throw new RosterSdpError(
      "incomplete_sdp",
      "SDP 缺少 ice-ufrag／ice-pwd／fingerprint"
    );
  }

  return {
    ufrag,
    pwd,
    fingerprintAlgo,
    fingerprint,
    setup,
    mid,
    sctpPort,
    maxMessageSize,
    candidates,
  };
}

export function rebuildSdpFromFields(
  fields: RosterSdpFields,
  role: RosterSdpRole
): string {
  const setup =
    role === "answer" && fields.setup === "actpass"
      ? "active"
      : fields.setup;
  const candLines = fields.candidates.map(c => {
    const base = `a=candidate:${c.foundation} ${c.component} ${c.protocol} ${c.priority} ${c.ip} ${c.port} typ ${c.type}`;
    return c.rest ? `${base} ${c.rest}` : base;
  });

  // Minimal BUNDLE DataChannel SDP (dc1). Browsers tolerate fixed o= line.
  const lines = [
    "v=0",
    "o=- 0 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    `a=group:BUNDLE ${fields.mid}`,
    "a=extmap-allow-mixed",
    "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    `a=ice-ufrag:${fields.ufrag}`,
    `a=ice-pwd:${fields.pwd}`,
    `a=fingerprint:${fields.fingerprintAlgo} ${fields.fingerprint}`,
    `a=setup:${setup}`,
    `a=mid:${fields.mid}`,
    `a=sctp-port:${fields.sctpPort}`,
    `a=max-message-size:${fields.maxMessageSize}`,
    ...candLines,
    "a=end-of-candidates",
  ];
  return lines.join("\r\n") + "\r\n";
}

const MAX_HOST_CANDIDATES = 6;
const MAX_SRFLX_CANDIDATES = 4;
const MAX_RELAY_CANDIDATES = 4;

function uniqueCandidates(
  candidates: RosterIceCandidate[]
): RosterIceCandidate[] {
  const seen = new Set<string>();
  const out: RosterIceCandidate[] = [];
  for (const c of candidates) {
    const id = candidateIdentity(c);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

/** Non-trickle wire: UDP only, unique ICE, cap host flood, always keep some srflx. */
function boundCandidatesForExchange(
  candidates: RosterIceCandidate[],
  opts: { keepRelay?: boolean }
): RosterIceCandidate[] {
  const unique = uniqueCandidates(candidates);
  const udp = unique.filter(c => c.protocol.toLowerCase() === "udp");
  const pool = udp.length > 0 ? udp : unique;
  const byPrio = (a: RosterIceCandidate, b: RosterIceCandidate) =>
    b.priority - a.priority;
  const hosts = pool
    .filter(c => c.type === "host")
    .sort(byPrio)
    .slice(0, MAX_HOST_CANDIDATES);
  const srflx = pool
    .filter(c => c.type === "srflx")
    .sort(byPrio)
    .slice(0, MAX_SRFLX_CANDIDATES);
  const relays = opts.keepRelay
    ? pool
        .filter(c => c.type === "relay")
        .sort(byPrio)
        .slice(0, MAX_RELAY_CANDIDATES)
    : [];
  const prflx = pool
    .filter(c => c.type === "prflx")
    .sort(byPrio)
    .slice(0, 2);
  return uniqueCandidates([...hosts, ...srflx, ...relays, ...prflx]);
}

export function prepareFieldsForExchange(
  sdp: string,
  opts: { lan?: boolean; keepRelay?: boolean } = {}
): RosterSdpFields {
  const fields = extractSdpFields(sdp);
  let candidates = opts.keepRelay
    ? fields.candidates
    : fields.candidates.filter(c => c.type !== "relay");
  if (opts.lan) {
    candidates = filterCandidatesForLan(candidates);
    if (candidates.length === 0) {
      throw new RosterSdpError(
        "no_lan_candidates",
        "同區網模式找不到可用的 host candidate"
      );
    }
  }
  candidates = boundCandidatesForExchange(candidates, {
    keepRelay: opts.keepRelay,
  });
  return { ...fields, candidates };
}
