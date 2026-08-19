import { beforeEach, describe, expect, it } from "vitest";
import { chromeSession } from "./chromeSession.svelte";

describe("chromeSession game reload requests", () => {
  beforeEach(() => chromeSession.clear());

  it("publishes a new request for each updated running game", () => {
    const initial = chromeSession.gameReloadRequest;

    chromeSession.requestGameReload();
    chromeSession.requestGameReload();

    expect(chromeSession.gameReloadRequest).toBe(initial + 2);
  });
});

describe("chromeSession booth overlay chrome", () => {
  beforeEach(() => chromeSession.clear());

  it("bumps revealRequest so overlay chrome can come back", () => {
    const initial = chromeSession.revealRequest;
    chromeSession.requestChromeReveal();
    chromeSession.requestChromeReveal();
    expect(chromeSession.revealRequest).toBe(initial + 2);
  });

  it("clears holdAutoHide with the rest of the session", () => {
    chromeSession.holdAutoHide = true;
    chromeSession.peekInsetEndPx = 320;
    chromeSession.chromeHidden = true;
    chromeSession.setCanvasActive(true);
    chromeSession.clear();
    expect(chromeSession.holdAutoHide).toBe(false);
    expect(chromeSession.peekInsetEndPx).toBe(0);
    expect(chromeSession.chromeHidden).toBe(false);
    expect(chromeSession.canvasActive).toBe(false);
  });
});
