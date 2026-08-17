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
