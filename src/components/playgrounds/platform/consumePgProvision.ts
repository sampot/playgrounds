/**
 * Consume `#pg_provision=` once: redeem → shell memory → clear hash.
 */

import { redeemFieldProvision } from "./platformClient";
import {
  installPlatformFieldCredentialLifecycle,
  setPlatformFieldApiKey,
} from "./platformFieldCredential";
import {
  clearPgProvisionHashFromLocation,
  parsePgProvisionFromLocation,
} from "./platformProvisionUrl";

export type ConsumeProvisionResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; skipped: true };

export async function consumePgProvisionFromLocation(): Promise<ConsumeProvisionResult> {
  if (typeof window === "undefined") return { ok: false, skipped: true };
  const parsed = parsePgProvisionFromLocation({
    hash: window.location.hash,
    search: window.location.search,
  });
  if (!parsed) return { ok: false, skipped: true };
  clearPgProvisionHashFromLocation();
  installPlatformFieldCredentialLifecycle();
  try {
    const { api_key } = await redeemFieldProvision(parsed.token);
    setPlatformFieldApiKey(api_key);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
