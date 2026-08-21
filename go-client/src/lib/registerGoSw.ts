/** Register go SW early for installability + offline shell (DEC-050 §6.5). */

import { isGoCanvasSwUsable } from "./goCanvasSupport";

/** Bump with go-client/static/sw.js GO_SW_REV so phones pick up bridge fixes. */
export const GO_SW_URL = "/sw.js?v=43";

/**
 * Dev helper: drop controlling SW + go shell caches (manual／tests).
 * Production／DEV both register — `/room-file/` download needs a controller.
 */
export async function purgeGoServiceWorkerForDev(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const controlled = Boolean(navigator.serviceWorker.controller);
    if (regs.length === 0 && !controlled) return false;
    await Promise.all(regs.map((r) => r.unregister()));
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("go-shell-offline-"))
          .map((k) => caches.delete(k))
      );
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

export function registerGoServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!isGoCanvasSwUsable()) return;
  void navigator.serviceWorker.register(GO_SW_URL, { scope: "/" }).catch(() => {
    /* ignore — canvas／room-file paths surface errors when needed */
  });
}
