/**
 * In-memory Platform field API key (DEC-047／DASH-SPEC §7.0).
 * Not SecretStore — cleared on document unload / refresh.
 */

type Listener = () => void;

let fieldApiKey: string | null = null;
let lifecycleInstalled = false;
const listeners = new Set<Listener>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function getPlatformFieldApiKey(): string | null {
  return fieldApiKey;
}

export function hasPlatformFieldApiKey(): boolean {
  return Boolean(fieldApiKey);
}

export function setPlatformFieldApiKey(key: string | null): void {
  const trimmed = typeof key === "string" ? key.trim() : "";
  const next = trimmed || null;
  if (next === fieldApiKey) return;
  fieldApiKey = next;
  notify();
}

export function clearPlatformFieldApiKey(): void {
  if (fieldApiKey === null) return;
  fieldApiKey = null;
  notify();
}

/** Subscribe to login／logout of the in-memory field pass. */
export function subscribePlatformFieldCredential(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Clear on bfcache / unload so a restored page does not keep a stale VIP pass. */
export function installPlatformFieldCredentialLifecycle(): void {
  if (lifecycleInstalled || typeof window === "undefined") return;
  lifecycleInstalled = true;
  const wipe = () => {
    clearPlatformFieldApiKey();
  };
  window.addEventListener("pagehide", wipe);
}

/** Test helper. */
export function resetPlatformFieldCredentialForTests(): void {
  clearPlatformFieldApiKey();
  listeners.clear();
}
