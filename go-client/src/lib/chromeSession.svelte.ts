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
  flash = $state("");

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

  clear(): void {
    this.catalogId = null;
    this.title = null;
    this.kind = null;
    this.mode = null;
    this.canvasActive = false;
    this.flash = "";
  }

  setFlash(msg: string, ms = 2200): void {
    this.flash = msg;
    if (ms > 0) {
      window.setTimeout(() => {
        if (this.flash === msg) this.flash = "";
      }, ms);
    }
  }
}

export const chromeSession = new ChromeSession();
