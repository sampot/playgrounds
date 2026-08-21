/**
 * Load a hostable catalog SAM for booth play (PG-GO-ROOM-PLAY-PLAN).
 */

import type { FileMap } from "@pg/projectTypes";
import {
  getGoCatalogEntry,
  hostableProtocolFor,
  GO_LISTED_CATALOG,
  type GoCatalogEntry,
  type HostableProtocol,
} from "./goCatalog";
import {
  resolveGoSamFiles,
  type GoSamResolveOrigin,
  type GoSamUpdatePolicy,
} from "./goSamResolve";
import {
  goLoadProgressFromFiles,
  type GoLoadProgress,
} from "./goLoadProgress";
import type { FileListProgress } from "@pg/transferProgress";
import { mountGoCanvas, type MountedGoCanvas } from "./mountGoCanvas";
import type { HostRuntime } from "./hostRuntime";
import { createHostRuntime } from "./hostRuntime";
import { handleGoFunctionsApi } from "./goFunctionsRuntime";
import { goAuth } from "./goAuth.svelte";
import { roomHostDisplayName } from "./goRoom";

/**
 * Booth play must tip-check via raw `sam-manifest.json` `rev`
 * （`fetchSamTipRev` → `fetchGithubSamTipRev`；**不**走 `api.github.com`／Trees）.
 * `local-first` can mount a stale offline pack missing newer modules
 * （e.g. shellSurface.js）and break `pg_surface=room`.
 */
export const ROOM_PLAY_SAM_UPDATE_POLICY: GoSamUpdatePolicy = "check-tip";

/** Indeterminate bar while tipRev is compared to the offline pack. */
export function roomPlaySamCheckProgress(): GoLoadProgress {
  return { ratio: null, detail: "檢查遊戲版本…" };
}

/** Determinate／indeterminate bar while a newer tip is downloaded. */
export function roomPlaySamUpdateProgress(
  p: FileListProgress
): GoLoadProgress {
  const base = goLoadProgressFromFiles(p);
  return {
    ratio: base.ratio,
    detail: base.detail
      ? `正在更新遊戲… ${base.detail}`
      : "正在更新遊戲…",
  };
}

export type RoomPlaySamBundle = {
  catalogId: string;
  entry: GoCatalogEntry;
  protocol: HostableProtocol;
  files: FileMap;
  origin: GoSamResolveOrigin;
};

export async function loadRoomPlaySam(opts: {
  catalogId: string;
  onProgress?: (p: GoLoadProgress) => void;
}): Promise<RoomPlaySamBundle> {
  const catalogId = opts.catalogId.trim();
  const entry = getGoCatalogEntry(catalogId);
  if (!entry) throw new Error(`找不到小品 ${catalogId}`);
  const protocol = hostableProtocolFor(entry);
  if (!protocol || protocol.roles.length === 0) {
    throw new Error("此小品尚不支援包廂開局");
  }
  const source = entry.source?.trim();
  if (!source) throw new Error("小品缺少來源");
  opts.onProgress?.(roomPlaySamCheckProgress());
  const resolved = await resolveGoSamFiles({
    source,
    catalogId,
    updatePolicy: ROOM_PLAY_SAM_UPDATE_POLICY,
    onProgress: (p) => {
      opts.onProgress?.(roomPlaySamUpdateProgress(p));
    },
  });
  return {
    catalogId,
    entry,
    protocol,
    files: resolved.files,
    origin: resolved.origin,
  };
}

export async function mountRoomPlayHostCanvas(opts: {
  bundle: RoomPlaySamBundle;
  generation: number;
  getHostRuntime: () => HostRuntime | null;
}): Promise<MountedGoCanvas> {
  return mountGoCanvas(opts.bundle.files, opts.generation, {
    catalogId: opts.bundle.catalogId,
    getHostRuntime: opts.getHostRuntime,
    surface: "room",
  });
}

export function createRoomPlayHostRuntime(opts: {
  bundle: RoomPlaySamBundle;
  getFiles: () => FileMap | null;
  getSandboxId: () => string | null;
  getHostRuntime: () => HostRuntime | null;
}): HostRuntime {
  const { bundle, getFiles, getSandboxId, getHostRuntime } = opts;
  return createHostRuntime({
    getFiles,
    getSandboxId,
    protocol: bundle.protocol,
    getHostDisplayName: () => roomHostDisplayName(goAuth.profile),
    async invokeHostSession(
      path: string,
      init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }
    ) {
      const sandboxId = getSandboxId();
      const files = getFiles();
      if (!sandboxId || !files) throw new Error("Host 沙盒尚未就緒");
      const same = await handleGoFunctionsApi(
        {
          getFiles,
          getSandboxId,
          getCatalogId: () => bundle.catalogId,
          getHostRuntime,
        },
        {
          method: init?.method || "GET",
          url: path,
          headers: Object.entries(init?.headers || {}),
          body:
            init?.body != null
              ? new TextEncoder().encode(init.body).buffer
              : null,
        }
      );
      const text = new TextDecoder().decode(same.body ?? new ArrayBuffer(0));
      const data = text ? (JSON.parse(text) as unknown) : null;
      if (same.status >= 400) {
        let message = `Host session API ${same.status}`;
        let code = "act_rejected";
        if (data && typeof data === "object") {
          const o = data as { error?: string; code?: string };
          if (typeof o.error === "string") message = o.error;
          if (typeof o.code === "string") code = o.code;
        }
        throw Object.assign(new Error(message), { code });
      }
      return data;
    },
  });
}

/** First-knife playable set: hostable `kind: game` with explicit roles. */
export function listRoomPlayableCatalogIds(): string[] {
  return GO_LISTED_CATALOG.filter((e) => {
    if (e.kind !== "game") return false;
    const p = hostableProtocolFor(e);
    return Boolean(p && p.roles.length >= 2);
  }).map((e) => e.id);
}

export type RoomPlayableGame = {
  catalogId: string;
  title: string;
  blurb: string;
  /** Seats required (roles × limits; default 1 per role). */
  seatCount: number;
  cover?: string;
};

/**
 * Player-facing picker copy: drop parenthetical wire protocol ids
 * （e.g. `（gomoku.v1）` / `(redpick.v1)`）.
 */
export function roomPlayPickerBlurb(blurb: string): string {
  return blurb
    .replace(/[（(]\s*[\w.-]+\.v\d+\s*[）)]/gi, "")
    .replace(/\s+([。．.])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Seat slots for a hostable protocol (default 1 per role). */
export function roomPlaySeatCount(protocol: HostableProtocol): number {
  let n = 0;
  const seen = new Set<string>();
  for (const role of protocol.roles) {
    const r = role.trim();
    if (!r || seen.has(r)) continue;
    seen.add(r);
    const lim = protocol.roleLimits?.[r];
    n +=
      typeof lim === "number" && Number.isFinite(lim) && lim > 0
        ? Math.floor(lim)
        : 1;
  }
  return n;
}

/** Catalog-driven booth play picker rows. */
export function listRoomPlayableGames(): RoomPlayableGame[] {
  const out: RoomPlayableGame[] = [];
  for (const id of listRoomPlayableCatalogIds()) {
    const entry = getGoCatalogEntry(id);
    const protocol = hostableProtocolFor(entry ?? null);
    if (!entry || !protocol) continue;
    out.push({
      catalogId: id,
      title: entry.title,
      blurb: roomPlayPickerBlurb(entry.blurb),
      seatCount: roomPlaySeatCount(protocol),
      ...(entry.cover ? { cover: entry.cover } : {}),
    });
  }
  return out;
}
