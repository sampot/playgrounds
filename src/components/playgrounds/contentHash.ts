/** SHA-256 hex digest of UTF-8 text (for HOST writeFile expectedHash). */

export async function hashUtf8(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  return hashBytes(data);
}

export async function hashBytes(data: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    // Copy into a plain ArrayBuffer — some runtimes reject SharedArrayBuffer views.
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
    return bytesToHex(new Uint8Array(digest));
  }
  return simpleHashHex(new TextDecoder().decode(data));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Non-crypto fallback for environments without SubtleCrypto. */
function simpleHashHex(content: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < content.length; i += 1) {
    const c = content.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  ).padEnd(64, "0");
}
