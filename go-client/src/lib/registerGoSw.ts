/** Register go SW early for installability + offline shell (DEC-050 §6.5). */

import { isGoCanvasSwUsable } from "./goCanvasSupport";

const SW_URL = "/sw.js?v=3";

export function registerGoServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!isGoCanvasSwUsable()) return;
  void navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
    /* ignore — canvas path will surface errors when needed */
  });
}
