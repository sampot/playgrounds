import { describe, expect, it } from "vitest";
import {
  CONSOLE_CHANNEL_ESM_HOST,
  buildConsoleMirrorBridgeInlineScript,
  forEachMirrorConsoleWindow,
  registerMirrorConsoleWindow,
  unregisterMirrorConsoleWindow,
} from "./consoleMirrorBridge";
import {
  CONSOLE_MIRROR_HELLO_TYPE,
  CONSOLE_MIRROR_MESSAGE_TYPE,
  PLAYGROUNDS_PREFS_KEY,
} from "./playgroundsPrefs";

describe("consoleMirrorBridge", () => {
  it("builds an install script with mirror gate and esm-host channel", () => {
    const script = buildConsoleMirrorBridgeInlineScript();
    expect(script).toContain("data-playgrounds-console-mirror");
    expect(script).toContain(PLAYGROUNDS_PREFS_KEY);
    expect(script).toContain(CONSOLE_MIRROR_MESSAGE_TYPE);
    expect(script).toContain(CONSOLE_MIRROR_HELLO_TYPE);
    expect(script).toContain(CONSOLE_CHANNEL_ESM_HOST);
    expect(script).toContain("mirrorToBrowser");
    expect(script).toContain("preventDefault");
    expect(script).toContain("console.table");
    expect(script).toContain("console.group");
    expect(script).toContain("groupEnd");
  });

  it("tracks host windows for mirror sync", () => {
    const seen: Window[] = [];
    const fake = { closed: false } as unknown as Window;
    registerMirrorConsoleWindow(fake);
    forEachMirrorConsoleWindow(w => {
      seen.push(w);
    });
    expect(seen).toContain(fake);
    unregisterMirrorConsoleWindow(fake);
    seen.length = 0;
    forEachMirrorConsoleWindow(w => {
      seen.push(w);
    });
    expect(seen).not.toContain(fake);
  });
});
