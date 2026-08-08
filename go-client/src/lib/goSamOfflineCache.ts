/**
 * Visit-then-offline FileMap cache for `/s/<id>` (DEC-050 §6.5).
 * Network-first loaders call {@link putGoSamOfflineCache} after a successful fetch.
 */

import type { FileMap } from "@pg/projectTypes";
import { isTextContent } from "@pg/projectTypes";

const CACHE_NAME = "go-sam-offline-v1";
const PATH_PREFIX = "/__go_offline_sam__/";

type WireFile =
  | { t: "s"; b: string }
  | { t: "b"; b: string }; /* base64 */

type WireBundle = {
  v: 1;
  id: string;
  source: string;
  files: Record<string, WireFile>;
};

function cacheUrl(catalogId: string): string {
  return `${PATH_PREFIX}${encodeURIComponent(catalogId)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function serialize(id: string, source: string, files: FileMap): WireBundle {
  const wire: Record<string, WireFile> = {};
  for (const [path, content] of Object.entries(files)) {
    if (isTextContent(content)) {
      wire[path] = { t: "s", b: content };
    } else {
      wire[path] = { t: "b", b: bytesToBase64(content) };
    }
  }
  return { v: 1, id, source, files: wire };
}

function deserialize(bundle: WireBundle): FileMap {
  const files: FileMap = {};
  for (const [path, f] of Object.entries(bundle.files)) {
    if (f.t === "s") files[path] = f.b;
    else files[path] = base64ToBytes(f.b);
  }
  return files;
}

export async function putGoSamOfflineCache(
  catalogId: string,
  source: string,
  files: FileMap
): Promise<void> {
  if (typeof caches === "undefined") return;
  const id = catalogId.trim();
  if (!id) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const body = JSON.stringify(serialize(id, source, files));
    await cache.put(
      cacheUrl(id),
      new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "max-age=31536000",
        },
      })
    );
  } catch {
    /* private mode／quota — ignore */
  }
}

export async function getGoSamOfflineCache(
  catalogId: string
): Promise<{ source: string; files: FileMap } | null> {
  if (typeof caches === "undefined") return null;
  const id = catalogId.trim();
  if (!id) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(cacheUrl(id));
    if (!res || !res.ok) return null;
    const bundle = (await res.json()) as WireBundle;
    if (!bundle || bundle.v !== 1 || !bundle.files) return null;
    return { source: bundle.source, files: deserialize(bundle) };
  } catch {
    return null;
  }
}

function pathnameFromCacheKey(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // Cache mocks／relative put keys may not be absolute.
    const path = url.split("?")[0] ?? "";
    return path.startsWith("/") ? path : "";
  }
}

function catalogIdFromCacheKey(url: string): string | null {
  const pathname = pathnameFromCacheKey(url);
  if (!pathname.startsWith(PATH_PREFIX)) return null;
  const raw = pathname.slice(PATH_PREFIX.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Catalog ids with a visit-then-offline FileMap cache (§6.6 已下載). */
export async function listGoSamOfflineCatalogIds(): Promise<string[]> {
  if (typeof caches === "undefined") return [];
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const ids: string[] = [];
    for (const req of keys) {
      const id = catalogIdFromCacheKey(req.url);
      if (id) ids.push(id);
    }
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  } catch {
    return [];
  }
}

export async function deleteGoSamOfflineCache(
  catalogId: string
): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const id = catalogId.trim();
  if (!id) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.delete(cacheUrl(id));
  } catch {
    return false;
  }
}

export async function clearAllGoSamOfflineCache(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    const ids = await listGoSamOfflineCatalogIds();
    let n = 0;
    for (const id of ids) {
      if (await deleteGoSamOfflineCache(id)) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
