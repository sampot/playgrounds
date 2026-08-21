/**
 * Localhost／Agent 包廂 harness（PG-GO-ROOM-DEV-HARNESS-PLAN）.
 * Gate: import.meta.env.DEV + loopback origin. No-op elsewhere.
 */

import { isLoopbackPageOrigin } from "./goOrigin";
import { roomOccupantCount, type RoomInviteDoor } from "./goRoom";

export const GO_ROOM_DEV_DEFAULT_JOIN_NAME = "Agent";
export const GO_ROOM_DEV_WINDOW_KEY = "__goRoomDev";
/** Loopback-only remembered field API key (not used on production go). */
export const GO_ROOM_DEV_KEY_STORAGE = "go_dev_field_api_key";

export type GoRoomDevQuery = {
  mint: boolean;
  join: boolean;
  login: boolean;
  name: string | null;
};

export type GoRoomDevSnapshot = {
  phase: string;
  doorUrl: string | null;
  guestCount: number;
  loggedIn: boolean;
  inviteDoor: RoomInviteDoor;
};

export type GoRoomDevApi = {
  role: "host" | "guest";
  phase: string;
  doorUrl: string | null;
  peerCount: number;
  loggedIn: boolean;
  inviteDoor: RoomInviteDoor;
  mint(): Promise<{ shortUrl: string }>;
  join(displayName?: string): Promise<void>;
  waitReady(opts?: { peerCount?: number; timeoutMs?: number }): Promise<void>;
  /** Apply a field API key (Host). Optionally remember on this browser. */
  setApiKey(key: string, opts?: { remember?: boolean }): Promise<void>;
  /** Current memory field API key（Host／logged-in tab）；null if none. */
  getApiKey(): string | null;
};

export type GoRoomDevAttachOpts = {
  enabled: boolean;
  role: "host" | "guest";
  getSnapshot: () => GoRoomDevSnapshot;
  mint: () => Promise<{ shortUrl: string }>;
  join: (displayName?: string) => Promise<void>;
  setApiKey?: (key: string, opts?: { remember?: boolean }) => Promise<void>;
  getApiKey?: () => string | null;
};

export type GoRoomDevHandle = {
  sync: () => void;
  dispose: () => void;
  api: GoRoomDevApi;
};

export function isGoRoomDevEnabled(opts: {
  dev: boolean;
  pageOrigin: string;
}): boolean {
  return Boolean(opts.dev) && isLoopbackPageOrigin(opts.pageOrigin);
}

function truthyOne(raw: string | null): boolean {
  return raw === "1";
}

function readName(raw: string | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t ? t : null;
}

export function parseGoRoomDevQuery(
  search: string | URLSearchParams
): GoRoomDevQuery {
  const sp =
    typeof search === "string"
      ? new URLSearchParams(
          search.startsWith("?") || search.startsWith("#")
            ? search.slice(1)
            : search
        )
      : search;
  return {
    mint: truthyOne(sp.get("dev_mint")),
    join: truthyOne(sp.get("dev_join")),
    login: truthyOne(sp.get("dev_login")),
    name: readName(sp.get("name")),
  };
}

export function goRoomDevJoinName(query: GoRoomDevQuery): string {
  return query.name ?? GO_ROOM_DEV_DEFAULT_JOIN_NAME;
}

export function goRoomDevPeerCount(guestCount: number): number {
  return roomOccupantCount(guestCount);
}

/** Runtime page gate — pass import.meta.env.DEV from the caller. */
export function goRoomDevPageEnabled(dev = import.meta.env.DEV): boolean {
  if (typeof location === "undefined") return false;
  return isGoRoomDevEnabled({ dev: Boolean(dev), pageOrigin: location.origin });
}

export function readGoRoomDevRememberedKey(opts: {
  enabled: boolean;
}): string | null {
  if (!opts.enabled || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(GO_ROOM_DEV_KEY_STORAGE);
    if (!raw) return null;
    const t = raw.trim();
    return t || null;
  } catch {
    return null;
  }
}

export function writeGoRoomDevRememberedKey(
  key: string | null,
  opts: { enabled: boolean }
): void {
  if (!opts.enabled || typeof localStorage === "undefined") return;
  try {
    const t = key?.trim() || "";
    if (t) localStorage.setItem(GO_ROOM_DEV_KEY_STORAGE, t);
    else localStorage.removeItem(GO_ROOM_DEV_KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

function applySnapshot(api: GoRoomDevApi, snap: GoRoomDevSnapshot): void {
  api.phase = snap.phase;
  api.doorUrl = snap.doorUrl;
  api.peerCount = goRoomDevPeerCount(snap.guestCount);
  api.loggedIn = snap.loggedIn;
  api.inviteDoor = snap.inviteDoor;
}

export function attachGoRoomDev(
  opts: GoRoomDevAttachOpts
): GoRoomDevHandle | null {
  if (!opts.enabled) return null;
  if (typeof window === "undefined") return null;

  const api: GoRoomDevApi = {
    role: opts.role,
    phase: "idle",
    doorUrl: null,
    peerCount: 1,
    loggedIn: false,
    inviteDoor: "none",
    async mint() {
      const out = await opts.mint();
      applySnapshot(api, opts.getSnapshot());
      return out;
    },
    async join(displayName?: string) {
      await opts.join(displayName);
      applySnapshot(api, opts.getSnapshot());
    },
    async waitReady(waitOpts) {
      const need = waitOpts?.peerCount ?? 1;
      const timeoutMs = waitOpts?.timeoutMs ?? 30_000;
      const start = Date.now();
      for (;;) {
        applySnapshot(api, opts.getSnapshot());
        if (api.peerCount >= need) return;
        if (Date.now() - start >= timeoutMs) {
          throw new Error(
            `goRoomDev waitReady timeout (${api.peerCount}/${need})`
          );
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    async setApiKey(key: string, setOpts) {
      if (!opts.setApiKey) {
        throw new Error("setApiKey not available for this role");
      }
      await opts.setApiKey(key, setOpts);
      applySnapshot(api, opts.getSnapshot());
    },
    getApiKey() {
      return opts.getApiKey?.() ?? null;
    },
  };

  applySnapshot(api, opts.getSnapshot());
  (window as unknown as { [GO_ROOM_DEV_WINDOW_KEY]: GoRoomDevApi })[
    GO_ROOM_DEV_WINDOW_KEY
  ] = api;

  return {
    api,
    sync() {
      applySnapshot(api, opts.getSnapshot());
    },
    dispose() {
      const w = window as unknown as {
        [GO_ROOM_DEV_WINDOW_KEY]?: GoRoomDevApi;
      };
      if (w[GO_ROOM_DEV_WINDOW_KEY] === api) {
        delete w[GO_ROOM_DEV_WINDOW_KEY];
      }
    },
  };
}
