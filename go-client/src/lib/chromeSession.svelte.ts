/**
 * Layout chrome context: share target + `/s/` swap + canvas-first mode (DEC-050).
 */

import type { GoCatalogEntry, GoSamKind } from "./goCatalog";

export type ChromePlayMode = "solo" | "invite" | null;

class ChromeSession {
  catalogId = $state<string | null>(null);
  title = $state<string | null>(null);
  kind = $state<GoSamKind | null>(null);
  mode = $state<ChromePlayMode>(null);
  /** True when SAM canvas fills the viewport — chrome overlays, does not steal height. */
  canvasActive = $state(false);
  /** Pause the 3s auto-hide while a sheet／overlay is open (包廂). */
  holdAutoHide = $state(false);
  /** Overlay chrome (and 包廂劇院態 HUD) slid off-screen. */
  chromeHidden = $state(false);
  /**
   * Shrink the top-edge peek from the right so a hall side-rail (short
   * landscape tabs, desktop members) stays tappable.
   */
  peekInsetEndPx = $state(0);
  /** Bump to reveal overlay chrome (top-edge hit). */
  revealRequest = $state(0);
  /** Monotonic signal for remounting the active solo game after an update. */
  gameReloadRequest = $state(0);
  flash = $state("");
  /**
   * When set, layout Escape-to-home asks first. Return false to swallow
   * (包廂 in-page confirm).
   */
  escapeGuard: (() => boolean) | null = null;

  /** Solo `/s/` — share + same-kind swap. */
  setSolo(entry: GoCatalogEntry): void {
    this.catalogId = entry.id;
    this.title = entry.title;
    this.kind = entry.kind;
    this.mode = "solo";
  }

  /**
   * Invite `/i/` — share only when compose maps to a catalog id.
   * Never shows swap controls.
   */
  setInvite(entry: GoCatalogEntry | null): void {
    if (entry) {
      this.catalogId = entry.id;
      this.title = entry.title;
      this.kind = entry.kind;
    } else {
      this.catalogId = null;
      this.title = null;
      this.kind = null;
    }
    this.mode = "invite";
  }

  setCanvasActive(active: boolean): void {
    this.canvasActive = active;
  }

  requestChromeReveal(): void {
    this.revealRequest += 1;
  }

  requestGameReload(): void {
    this.gameReloadRequest += 1;
  }

  clear(): void {
    this.catalogId = null;
    this.title = null;
    this.kind = null;
    this.mode = null;
    this.canvasActive = false;
    this.holdAutoHide = false;
    this.chromeHidden = false;
    this.peekInsetEndPx = 0;
    this.flash = "";
  }

  setFlash(msg: string, ms = 2200): void {
    this.flash = msg;
    if (ms > 0) {
      const schedule =
        typeof globalThis.setTimeout === "function"
          ? globalThis.setTimeout.bind(globalThis)
          : null;
      schedule?.(() => {
        if (this.flash === msg) this.flash = "";
      }, ms);
    }
  }
}

export const chromeSession = new ChromeSession();
