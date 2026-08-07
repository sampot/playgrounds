/**
 * Base64 helpers and size limits for HOST binary FS (Phase 8).
 */

import { HostBridgeError } from "./hostBridge";

/**
 * Hard cap for a single HOST binary read/write (32 MiB).
 * Raised for `.git` packfiles via scoped HOST (DEC-051 §8.5); still use
 * append chunks for larger objects.
 */
export const HOST_BINARY_MAX_BYTES = 32 * 1024 * 1024;

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, "");
  if (!cleaned) {
    throw new HostBridgeError("bad_path", "base64 內容為空");
  }
  const normalized = cleaned.replace(/-/gu, "+").replace(/_/gu, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)) {
    throw new HostBridgeError("bad_path", "無效的 base64");
  }
  try {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(normalized, "base64"));
    }
    const binary = atob(normalized);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    throw new HostBridgeError("bad_path", "無效的 base64");
  }
}

export function assertBinarySize(byteLength: number, op: string): void {
  if (byteLength > HOST_BINARY_MAX_BYTES) {
    throw new HostBridgeError(
      "too_large",
      `${op} 超過 ${HOST_BINARY_MAX_BYTES} bytes 上限（${byteLength}）`
    );
  }
}
