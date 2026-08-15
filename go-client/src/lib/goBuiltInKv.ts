/**
 * Shell-built-in `/api/kv/*` for the go pure-play shell (DEC-050).
 *
 * Games must NOT re-implement KV plumbing inside their `functions.js` — the
 * shell owns the `localStorage`→KV shim contract (PG-LOCALSTORAGE-SHIM-SPEC)
 * and serves `/api/kv/<key>` (GET/PUT/DELETE) + `/api/kv/list` directly from
 * the durable `goWebKv` namespace. This is the go mirror of the field shell's
 * host-installed default handler (`src/sam-runtime/functionsRouting.ts`) and
 * guarantees identical persistence semantics across play and go.
 *
 * Intercepted in `dispatchGoCanvasApi` *before* delegating to the SAM's
 * `functions.js`, so a SAM that ships its own KV proxy never shadows the
 * authoritative shell store (which also backs the localStorage shim's
 * high-score persistence).
 */

import { createGoWebKv } from "./goWebKv";
import type { SerializedRequest, SerializedResponse } from "@pg/canvasSwProtocol";

const KV_PATH_RE = /^\/api\/kv\/([^/]+)$/u;
const KV_LIST_PATH = "/api/kv/list";
const KEY_RE = /^[A-Za-z0-9._\-~%:/+@]{1,512}$/u;

function apiPath(pathname: string): string {
  let path: string;
  try {
    path = new URL(pathname, "https://go.local").pathname;
  } catch {
    path = pathname;
  }
  // The go service worker forwards the original canvas URL, e.g.
  // `/canvas/<sandboxId>/api/kv/high-score`. Normalize it to the same
  // built-in route shape used by memory canvases and direct unit calls.
  const canvasKv = path.match(/^\/canvas\/[^/]+(\/api\/kv(?:\/.*)?$)/u);
  return canvasKv?.[1] ?? path;
}

function textResponse(body: string, status: number): SerializedResponse {
  const bytes = new TextEncoder().encode(body);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return {
    status,
    statusText: "",
    headers: [["Content-Type", "text/plain; charset=utf-8"]],
    body: copy.buffer,
  };
}

function jsonResponse(data: unknown, status = 200): SerializedResponse {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return {
    status,
    statusText: "",
    headers: [["Content-Type", "application/json; charset=utf-8"]],
    body: copy.buffer,
  };
}

function notFound(): SerializedResponse {
  return jsonResponse({ code: "not_found", message: "key not found" }, 404);
}

async function readBody(request: SerializedRequest): Promise<string> {
  if (!request.body) return "";
  try {
    return new TextDecoder().decode(request.body);
  } catch {
    return "";
  }
}

/**
 * @returns the response if the request is a built-in KV route, else `null`
 * (caller should fall through to the SAM's `functions.js`).
 */
export async function handleGoBuiltInKv(
  namespace: string,
  request: SerializedRequest
): Promise<SerializedResponse | null> {
  const path = apiPath(request.url);
  const method = request.method.toUpperCase();
  if (path === KV_LIST_PATH && method === "POST") {
    const kv = createGoWebKv(namespace, { durable: true });
    if (typeof kv.list !== "function") {
      return jsonResponse(
        { code: "internal_error", message: "env.KV.list unsupported" },
        500
      );
    }
    let body: { prefix?: string; cursor?: string; limit?: number } | null = null;
    const raw = await readBody(request);
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
    }
    const result = await kv.list({
      prefix: body?.prefix,
      cursor: body?.cursor,
      limit: body?.limit,
    });
    return jsonResponse(result);
  }
  const kvMatch = path.match(KV_PATH_RE);
  if (kvMatch) {
    const key = decodeURIComponent(kvMatch[1]!);
    if (!key || !KEY_RE.test(key)) return notFound();
    const kv = createGoWebKv(namespace, { durable: true });
    if (method === "GET") {
      const v = await kv.get(key);
      if (v == null) return notFound();
      if (typeof v === "string") return textResponse(v, 200);
      const src =
        v instanceof ArrayBuffer ? new Uint8Array(v) : (v as Uint8Array);
      const copy = new Uint8Array(src.byteLength);
      copy.set(src);
      return {
        status: 200,
        statusText: "",
        headers: [["Content-Type", "application/octet-stream"]],
        body: copy.buffer,
      };
    }
    if (method === "PUT") {
      const body = await readBody(request);
      await kv.put(key, body);
      return { status: 204, statusText: "", headers: [], body: null };
    }
    if (method === "DELETE") {
      await kv.delete(key);
      return { status: 204, statusText: "", headers: [], body: null };
    }
    return jsonResponse({ code: "method_not_allowed", message: method }, 405);
  }
  return null;
}
