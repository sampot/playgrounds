import { describe, expect, it } from "vitest";
import {
  readRemoteAnchorEnabled,
  writeRemoteAnchorEnabled,
  GO_ROOM_REMOTE_ANCHOR_KEY,
} from "./boothAnchorBridge";

describe("boothAnchorBridge prefs", () => {
  it("reads and writes remote anchor toggle", () => {
    const storage = {
      data: {} as Record<string, string>,
      getItem(k: string) {
        return this.data[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.data[k] = v;
      },
    };
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
    });
    try {
      expect(readRemoteAnchorEnabled()).toBe(false);
      writeRemoteAnchorEnabled(true);
      expect(storage.data[GO_ROOM_REMOTE_ANCHOR_KEY]).toBe("1");
      expect(readRemoteAnchorEnabled()).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        value: original,
        configurable: true,
      });
    }
  });
});
