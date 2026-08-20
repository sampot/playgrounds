/** Register go SW early for installability + offline shell (DEC-050 §6.5). */

import { isGoCanvasSwUsable } from "./goCanvasSupport";

const SW_URL = "/sw.js?v=27";
const DEV_SW_PURGE_KEY = "go_dev_sw_purged";

/**
 * Vite DEV must not keep a controlling SW: room-play grew `sw.js` a lot, and
 * Soft refresh under Slow 4G was re-fetching shell／deps through the worker
 * instead of entering `/room` from memory. Production still registers as usual.
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

  if (import.meta.env.DEV) {
    void (async () => {
      const had = await purgeGoServiceWorkerForDev();
      if (!had) return;
      try {
        if (sessionStorage.getItem(DEV_SW_PURGE_KEY) === "1") return;
        sessionStorage.setItem(DEV_SW_PURGE_KEY, "1");
      } catch {
        /* ignore */
      }
      // Active worker survives unregister until the next load.
      window.location.reload();
    })();
    return;
  }

  if (!isGoCanvasSwUsable()) return;
  void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
    /* ignore — canvas path will surface errors when needed */
  });
}
