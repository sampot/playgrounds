/** Invite default TTL: session already started; not a reservation. */
export const INVITE_TTL_MS = 5 * 60 * 1000;

/** Long-poll wait for offer/answer within one Worker request. */
export const HANDSHAKE_WAIT_MS = 25_000;

export const DEFAULT_TARGET_FIELD = "play.samkuo.me";

const B64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** High-entropy URL-safe id (no padding). */
export function randomId(byteLength = 18): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += B64URL[bytes[i]! % 64]!;
  }
  return out;
}

export function apiKeyPlaintext(): string {
  return `pg_sk_${randomId(24)}`;
}

export function joinCapPlaintext(): string {
  return `pg_jc_${randomId(20)}`;
}

export function shortId(): string {
  return randomId(10);
}

export function inviteSecret(): string {
  return randomId(24);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const dig = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(dig)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function keyPrefix(plaintext: string): string {
  // pg_sk_ + first 8 of body for display / lookup hint
  const body = plaintext.startsWith("pg_sk_")
    ? plaintext.slice(6)
    : plaintext;
  return `pg_sk_${body.slice(0, 8)}`;
}

export function fieldDeepLink(
  targetField: string,
  secret: string
): string {
  const host = targetField.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}/#pg=${encodeURIComponent(secret)}`;
}

export function shortUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, "")}/i/${id}`;
}
