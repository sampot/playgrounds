/**
 * go canvas `/api` → functions.js with env.KV／env.DB (IndexedDB／localStorage).
 */

import {
  deserializeRequest,
  functionsUnavailableBody,
  serializeResponse,
  type SerializedRequest,
  type SerializedResponse,
} from "@pg/canvasSwProtocol";
import {
  functionsSourceFingerprint,
  invokeFunctionsFetch,
  loadFunctionsModule,
  type LoadedFunctionsModule,
} from "@pg/functionsRuntime";
import type { FileMap } from "@pg/projectTypes";
import { createGoWebDb } from "./goWebDb";
import {
  createGoWebKv,
  goStorageKeyEphemeral,
  goStorageKeyForCatalog,
} from "./goWebKv";

export type GoFunctionsApiContext = {
  getFiles: () => FileMap | null;
  /** Durable catalog id for `/s/`; null → ephemeral memory bindings. */
  getCatalogId?: () => string | null;
  getSandboxId: () => string | null;
};

type CacheEntry = {
  fingerprint: string;
  mod: LoadedFunctionsModule;
};

const moduleCache = new Map<string, CacheEntry>();

function jsonBytesResponse(body: string, status: number): SerializedResponse {
  const bytes = new TextEncoder().encode(body);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return {
    status,
    statusText: "",
    headers: [["Content-Type", "application/json; charset=utf-8"]],
    body: copy.buffer,
  };
}

function storageFor(ctx: GoFunctionsApiContext): {
  key: string;
  durable: boolean;
} {
  const catalogId = ctx.getCatalogId?.()?.trim() || null;
  if (catalogId) {
    return { key: goStorageKeyForCatalog(catalogId), durable: true };
  }
  const sandboxId = ctx.getSandboxId()?.trim() || "anonymous";
  return { key: goStorageKeyEphemeral(sandboxId), durable: false };
}

async function getModule(
  cacheKey: string,
  files: FileMap
): Promise<LoadedFunctionsModule | null> {
  const fp = functionsSourceFingerprint(files);
  const hit = moduleCache.get(cacheKey);
  if (hit && hit.fingerprint === fp) return hit.mod;
  if (hit) {
    try {
      await hit.mod.dispose();
    } catch {
      /* ignore */
    }
    moduleCache.delete(cacheKey);
  }
  const mod = await loadFunctionsModule(files);
  if (!mod) return null;
  moduleCache.set(cacheKey, { fingerprint: fp, mod });
  return mod;
}

export async function handleGoFunctionsApi(
  ctx: GoFunctionsApiContext,
  request: SerializedRequest
): Promise<SerializedResponse> {
  const files = ctx.getFiles();
  if (!files) {
    return jsonBytesResponse(functionsUnavailableBody(), 503);
  }
  const sandboxId = ctx.getSandboxId() || "go";
  const mod = await getModule(sandboxId, files);
  if (!mod) {
    return jsonBytesResponse(functionsUnavailableBody(), 503);
  }
  const { key, durable } = storageFor(ctx);
  const env = {
    KV: createGoWebKv(key, { durable }),
    DB: createGoWebDb(key, { durable }),
  };
  try {
    const req = deserializeRequest(request);
    const response = await invokeFunctionsFetch(mod, req, env);
    return await serializeResponse(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonBytesResponse(
      JSON.stringify({
        error: "playgrounds_functions_error",
        message,
      }),
      500
    );
  }
}

/** Drop cached modules (tests／hot reload). */
export async function resetGoFunctionsModulesForTests(): Promise<void> {
  for (const entry of moduleCache.values()) {
    try {
      await entry.mod.dispose();
    } catch {
      /* ignore */
    }
  }
  moduleCache.clear();
}
