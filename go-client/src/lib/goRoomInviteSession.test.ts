import { describe, expect, it } from "vitest";
import {
  GO_ROOM_INVITE_SESSION_KEY,
  clearRoomInviteSession,
  readRoomInviteSession,
  writeRoomInviteSession,
} from "./goRoomInviteSession";

function memoryStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe("goRoomInviteSession", () => {
  it("round-trips a live door snapshot", () => {
    const store = memoryStore();
    const snap = {
      inviteId: "inv-1",
      shortUrl: "https://go.samkuo.me/i/abc",
      expiresAt: Date.now() + 60_000,
    };
    writeRoomInviteSession(store, snap);
    expect(store.getItem(GO_ROOM_INVITE_SESSION_KEY)).toBeTruthy();
    expect(readRoomInviteSession(store)).toEqual(snap);
  });

  it("returns null for missing, corrupt, or expired snapshots", () => {
    const store = memoryStore();
    expect(readRoomInviteSession(store)).toBeNull();
    store.setItem(GO_ROOM_INVITE_SESSION_KEY, "{");
    expect(readRoomInviteSession(store)).toBeNull();
    writeRoomInviteSession(store, {
      inviteId: "inv-old",
      shortUrl: "https://go.samkuo.me/i/old",
      expiresAt: Date.now() - 1,
    });
    expect(readRoomInviteSession(store)).toBeNull();
    expect(store.getItem(GO_ROOM_INVITE_SESSION_KEY)).toBeNull();
  });

  it("clears the key", () => {
    const store = memoryStore();
    writeRoomInviteSession(store, {
      inviteId: "inv-1",
      shortUrl: "https://go.samkuo.me/i/abc",
      expiresAt: Date.now() + 60_000,
    });
    clearRoomInviteSession(store);
    expect(store.getItem(GO_ROOM_INVITE_SESSION_KEY)).toBeNull();
  });
});
