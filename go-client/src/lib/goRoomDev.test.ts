// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GO_ROOM_DEV_DEFAULT_JOIN_NAME,
  isGoRoomDevEnabled,
  parseGoRoomDevQuery,
  goRoomDevJoinName,
  goRoomDevPeerCount,
  attachGoRoomDev,
  readGoRoomDevRememberedKey,
  writeGoRoomDevRememberedKey,
  type GoRoomDevSnapshot,
} from "./goRoomDev";

describe("isGoRoomDevEnabled", () => {
  it("requires DEV build and loopback page origin", () => {
    expect(
      isGoRoomDevEnabled({
        dev: true,
        pageOrigin: "http://localhost:5174",
      })
    ).toBe(true);
    expect(
      isGoRoomDevEnabled({
        dev: true,
        pageOrigin: "http://127.0.0.1:5174",
      })
    ).toBe(true);
    expect(
      isGoRoomDevEnabled({
        dev: false,
        pageOrigin: "http://localhost:5174",
      })
    ).toBe(false);
    expect(
      isGoRoomDevEnabled({
        dev: true,
        pageOrigin: "https://go.samkuo.me",
      })
    ).toBe(false);
  });
});

describe("parseGoRoomDevQuery", () => {
  it("parses mint／join／name／login flags", () => {
    expect(parseGoRoomDevQuery("?dev_mint=1&dev_join=1&name=G1&dev_login=1")).toEqual({
      mint: true,
      join: true,
      login: true,
      name: "G1",
    });
  });

  it("treats missing or non-1 values as false／null", () => {
    expect(parseGoRoomDevQuery("")).toEqual({
      mint: false,
      join: false,
      login: false,
      name: null,
    });
    expect(parseGoRoomDevQuery("?dev_mint=true&dev_join=yes&name=")).toEqual({
      mint: false,
      join: false,
      login: false,
      name: null,
    });
  });

  it("accepts URLSearchParams", () => {
    const sp = new URLSearchParams("dev_mint=1&name=%E8%A8%AA%E5%AE%A2");
    expect(parseGoRoomDevQuery(sp)).toEqual({
      mint: true,
      join: false,
      login: false,
      name: "訪客",
    });
  });
});

describe("goRoomDevJoinName", () => {
  it("uses query name or the stable Agent default", () => {
    expect(
      goRoomDevJoinName({ mint: false, join: true, login: false, name: "G1" })
    ).toBe("G1");
    expect(
      goRoomDevJoinName({ mint: false, join: true, login: false, name: null })
    ).toBe(GO_ROOM_DEV_DEFAULT_JOIN_NAME);
  });
});

describe("goRoomDevPeerCount", () => {
  it("counts host plus guests", () => {
    expect(goRoomDevPeerCount(0)).toBe(1);
    expect(goRoomDevPeerCount(1)).toBe(2);
    expect(goRoomDevPeerCount(2)).toBe(3);
  });
});

describe("goRoomDev remembered key", () => {
  afterEach(() => {
    localStorage.removeItem("go_dev_field_api_key");
  });

  it("refuses to read／write when harness is disabled", () => {
    writeGoRoomDevRememberedKey("pg_sk_x", { enabled: false });
    expect(localStorage.getItem("go_dev_field_api_key")).toBeNull();
    expect(readGoRoomDevRememberedKey({ enabled: false })).toBeNull();
  });

  it("stores and clears a key only when enabled", () => {
    writeGoRoomDevRememberedKey("  pg_sk_abc  ", { enabled: true });
    expect(readGoRoomDevRememberedKey({ enabled: true })).toBe("pg_sk_abc");
    writeGoRoomDevRememberedKey(null, { enabled: true });
    expect(readGoRoomDevRememberedKey({ enabled: true })).toBeNull();
  });
});

describe("attachGoRoomDev", () => {
  afterEach(() => {
    delete (window as unknown as { __goRoomDev?: unknown }).__goRoomDev;
  });

  it("is a no-op when harness is disabled", () => {
    const handle = attachGoRoomDev({
      enabled: false,
      role: "host",
      getSnapshot: () => ({
        phase: "open",
        doorUrl: null,
        guestCount: 0,
        loggedIn: true,
        inviteDoor: "none",
      }),
      mint: async () => ({ shortUrl: "http://localhost:5174/i/x" }),
      join: async () => {},
    });
    expect(handle).toBeNull();
    expect(
      (window as unknown as { __goRoomDev?: unknown }).__goRoomDev
    ).toBeUndefined();
  });

  it("exposes __goRoomDev and syncs snapshot fields", async () => {
    let snap: GoRoomDevSnapshot = {
      phase: "open",
      doorUrl: null,
      guestCount: 0,
      loggedIn: true,
      inviteDoor: "none",
    };
    const mint = vi.fn(async () => {
      snap = {
        ...snap,
        doorUrl: "http://localhost:5174/i/abc_12",
        inviteDoor: "live",
      };
      return { shortUrl: snap.doorUrl! };
    });
    const handle = attachGoRoomDev({
      enabled: true,
      role: "host",
      getSnapshot: () => snap,
      mint,
      join: async () => {},
    });
    expect(handle).not.toBeNull();
    const api = (window as unknown as { __goRoomDev: {
      role: string;
      phase: string;
      doorUrl: string | null;
      peerCount: number;
      loggedIn: boolean;
      inviteDoor: string;
      mint: () => Promise<{ shortUrl: string }>;
      waitReady: (opts?: { peerCount?: number; timeoutMs?: number }) => Promise<void>;
    } }).__goRoomDev;
    expect(api.role).toBe("host");
    expect(api.phase).toBe("open");
    expect(api.peerCount).toBe(1);
    expect(api.doorUrl).toBeNull();

    const out = await api.mint();
    handle!.sync();
    expect(out.shortUrl).toBe("http://localhost:5174/i/abc_12");
    expect(api.doorUrl).toBe("http://localhost:5174/i/abc_12");
    expect(api.inviteDoor).toBe("live");
    expect(mint).toHaveBeenCalledOnce();

    snap = { ...snap, guestCount: 1 };
    handle!.sync();
    expect(api.peerCount).toBe(2);

    await api.waitReady({ peerCount: 2, timeoutMs: 200 });

    handle!.dispose();
    expect(
      (window as unknown as { __goRoomDev?: unknown }).__goRoomDev
    ).toBeUndefined();
  });

  it("waitReady times out when peerCount never reaches the target", async () => {
    const handle = attachGoRoomDev({
      enabled: true,
      role: "guest",
      getSnapshot: () => ({
        phase: "consent",
        doorUrl: "http://localhost:5174/i/x",
        guestCount: 0,
        loggedIn: false,
        inviteDoor: "none",
      }),
      mint: async () => ({ shortUrl: "" }),
      join: async () => {},
    });
    const api = (window as unknown as {
      __goRoomDev: {
        waitReady: (opts?: { peerCount?: number; timeoutMs?: number }) => Promise<void>;
      };
    }).__goRoomDev;
    await expect(
      api.waitReady({ peerCount: 2, timeoutMs: 50 })
    ).rejects.toThrow(/timeout|逾時/i);
    handle!.dispose();
  });

  it("exposes getApiKey for the current memory field key", () => {
    let key: string | null = "pg_sk_live";
    const handle = attachGoRoomDev({
      enabled: true,
      role: "host",
      getSnapshot: () => ({
        phase: "open",
        doorUrl: null,
        guestCount: 0,
        loggedIn: true,
        inviteDoor: "none",
      }),
      mint: async () => ({ shortUrl: "" }),
      join: async () => {},
      getApiKey: () => key,
    });
    const api = (window as unknown as {
      __goRoomDev: { getApiKey: () => string | null };
    }).__goRoomDev;
    expect(api.getApiKey()).toBe("pg_sk_live");
    key = null;
    expect(api.getApiKey()).toBeNull();
    handle!.dispose();
  });

  it("getApiKey returns null when no getter is wired", () => {
    const handle = attachGoRoomDev({
      enabled: true,
      role: "guest",
      getSnapshot: () => ({
        phase: "consent",
        doorUrl: null,
        guestCount: 0,
        loggedIn: false,
        inviteDoor: "none",
      }),
      mint: async () => ({ shortUrl: "" }),
      join: async () => {},
    });
    const api = (window as unknown as {
      __goRoomDev: { getApiKey: () => string | null };
    }).__goRoomDev;
    expect(api.getApiKey()).toBeNull();
    handle!.dispose();
  });
});
