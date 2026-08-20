/**
 * go-client Service Worker (DEC-050).
 * (1) Canvas memory snapshot `/canvas/<sandboxId>/*` + `/api` → shell
 * (2) Shell offline: visit-then-offline（§6.5）— 有 Cache 先回、背景再驗證；
 *     `/_app/*` 雜湊資源 cache-first。Vite／dev 路徑不攔截（對齊 field public/sw.js）。
 *
 * GO_SW_REV＝橋／room-play 邏輯；GO_SHELL_CACHE_REV＝殼 Cache 名。
 * 只改 room-play／canvas 時只 bump GO_SW_REV，勿清掉已暖好的離線殼。
 */
const GO_SW_REV = 27;
/** Bump only when shell cache policy or cacheable path set changes. */
const GO_SHELL_CACHE_REV = 26;
const CANVAS_PREFIX = "/canvas/";
const SYNC_TYPE = "playgrounds-canvas-sync";
const SYNC_ACK = "playgrounds-canvas-sync-ack";
const API_TYPE = "playgrounds-canvas-api";
const API_RESULT = "playgrounds-canvas-api-result";
const SHELL_CACHE = `go-shell-offline-v${GO_SHELL_CACHE_REV}`;

/** @type {Map<string, { generation: number, files: Record<string, {type:string, body:string|ArrayBuffer}> }>} */
const snapshots = new Map();

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k.startsWith("go-shell-offline-") && k !== SHELL_CACHE)
          .map(k => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", event => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "go-room-play") {
    applyRoomPlayMessage(data);
    return;
  }
  if (data.type === API_RESULT && typeof data.requestId === "string") {
    if (data.error) {
      settleApi(
        data.requestId,
        new Response(JSON.stringify({ error: data.error }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
      return;
    }
    const r = data.response || {};
    settleApi(
      data.requestId,
      new Response(r.body ?? null, {
        status: r.status || 200,
        statusText: r.statusText || "",
        headers: r.headers || [
          ["Content-Type", "application/json; charset=utf-8"],
        ],
      })
    );
    return;
  }
  if (data.type === SYNC_TYPE && typeof data.sandboxId === "string") {
    snapshots.set(data.sandboxId, {
      generation: Number(data.generation) || 0,
      files: data.files || {},
    });
    const port = event.ports && event.ports[0];
    if (port) {
      port.postMessage({
        type: SYNC_ACK,
        sandboxId: data.sandboxId,
        generation: Number(data.generation) || 0,
      });
    }
  }
});

function mimeFor(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".html") || lower.endsWith(".htm"))
    return "text/html; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs"))
    return "text/javascript";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".webmanifest")) return "application/manifest+json";
  if (lower.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function parseCanvas(pathname) {
  if (!pathname.startsWith(CANVAS_PREFIX)) return null;
  const rest = pathname.slice(CANVAS_PREFIX.length);
  const slash = rest.indexOf("/");
  const rawId = slash === -1 ? rest : rest.slice(0, slash);
  const rawFile = slash === -1 ? "" : rest.slice(slash + 1);
  if (!rawId) return null;
  let sandboxId;
  try {
    sandboxId = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  const filePath = rawFile
    ? rawFile
        .split("/")
        .map(p => {
          try {
            return decodeURIComponent(p);
          } catch {
            return p;
          }
        })
        .join("/")
    : "index.html";
  return { sandboxId, filePath };
}

/** Shell = go SPA pages; never the /canvas/ iframe client. */
function isGoShellClientPath(pathname) {
  return !pathname.startsWith(CANVAS_PREFIX);
}

/** Pages that install installGoCanvasApiListener (solo／invite). */
function isGoCanvasHostPath(pathname) {
  return (
    pathname.startsWith("/s/") ||
    pathname === "/i" ||
    pathname.startsWith("/i/")
  );
}

/**
 * Prefer focused／visible /s/／/i/ hosts. Posting only to `/` leaves /api hanging
 * until api_timeout because home never installs the canvas API listener.
 * @returns {Promise<Client[]>}
 */
async function findShellApiClients() {
  const all = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const hosts = [];
  const otherShell = [];
  for (const client of all) {
    try {
      const pathname = new URL(client.url).pathname;
      if (!isGoShellClientPath(pathname)) continue;
      if (isGoCanvasHostPath(pathname)) hosts.push(client);
      else otherShell.push(client);
    } catch {
      /* ignore */
    }
  }
  const rank = c => {
    if (c.focused) return 0;
    if (c.visibilityState === "visible") return 1;
    return 2;
  };
  hosts.sort((a, b) => rank(a) - rank(b));
  otherShell.sort((a, b) => rank(a) - rank(b));
  return hosts.concat(otherShell);
}

/** @type {Map<string, { resolve: (r: Response) => void, timer: number }>} */
const pendingApi = new Map();

function settleApi(requestId, response) {
  const pending = pendingApi.get(requestId);
  if (!pending) return;
  pendingApi.delete(requestId);
  clearTimeout(pending.timer);
  pending.resolve(response);
}

/** fetch("/api/…") → /canvas/<id>/api/… (same as field canvas bridge). */
const BRIDGE = `<script data-playgrounds-bridge>
(function () {
  /* go-canvas-bridge-rev:${GO_SW_REV} */
  const _fetch = window.fetch.bind(window);
  function rewriteApiInput(input) {
    try {
      if (typeof input === "string") {
        if (input === "/api" || input.startsWith("/api/") || input.startsWith("/api?")) {
          return new URL(input.replace(/^\\//, ""), new URL(".", location.href)).href;
        }
        return input;
      }
      if (input && typeof input === "object" && "url" in input) {
        const u = String(input.url);
        if (u.startsWith(location.origin + "/api")) {
          const path = u.slice(location.origin.length);
          if (path === "/api" || path.startsWith("/api/") || path.startsWith("/api?")) {
            const next = new URL(path.replace(/^\\//, ""), new URL(".", location.href)).href;
            return new Request(next, input);
          }
        }
      }
    } catch (_) { /* keep original */ }
    return input;
  }
  window.fetch = function (input, init) {
    return _fetch(rewriteApiInput(input), init);
  };
})();
</script>`;

function injectBridge(html) {
  if (html.includes("data-playgrounds-bridge")) return html;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${BRIDGE}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${BRIDGE}</head>`);
  }
  return `${BRIDGE}${html}`;
}

async function forwardApi(sandboxId, request) {
  const clients = await findShellApiClients();
  if (!clients.length) {
    return new Response(
      JSON.stringify({
        ready: false,
        code: "session_inactive",
        error: "找不到純玩分頁；請保持邀請頁開啟。",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }
  const bodyBuf =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : await request.arrayBuffer();
  const headers = [];
  request.headers.forEach((v, k) => headers.push([k, v]));
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = {
    type: API_TYPE,
    requestId,
    sandboxId,
    request: {
      method: request.method,
      url: request.url,
      headers,
      body: bodyBuf,
    },
  };
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      settleApi(
        requestId,
        new Response(JSON.stringify({ error: "api_timeout" }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        })
      );
    }, 30000);
    pendingApi.set(requestId, { resolve, timer });
    // Fan-out without MessageChannel transfer: pages reply via
    // controller.postMessage({ type: API_RESULT, requestId, ... }).
    // First matching host wins; avoids silent drops when ports are stripped
    // or the first matchAll client is `/` (no API listener).
    for (const client of clients) {
      try {
        client.postMessage(payload);
      } catch {
        /* ignore */
      }
    }
  });
}

function isSwEntry(pathname) {
  return pathname === "/sw.js";
}

/** Vite / SvelteKit-dev modules — never intercept (field public/sw.js parity). */
function isDevOnlyPath(pathname) {
  return (
    pathname.startsWith("/node_modules/") ||
    pathname.startsWith("/@id/") ||
    pathname.startsWith("/@vite/") ||
    pathname.startsWith("/@fs/") ||
    pathname.startsWith("/src/") ||
    pathname.includes("/.vite/")
  );
}

/** Invite short links — never offline-shell (temporary／needs network). */
function isInvitePath(pathname) {
  return pathname === "/i" || pathname.startsWith("/i/");
}

function isShellCacheablePath(pathname) {
  if (isSwEntry(pathname)) return false;
  if (isDevOnlyPath(pathname)) return false;
  if (pathname.startsWith(CANVAS_PREFIX)) return false;
  if (pathname.startsWith("/__go_offline_sam__/")) return false;
  if (isInvitePath(pathname)) return false;
  // PG-LIBS-SPEC G6: host UI libs lazy-load only — never SW-cache / precache.
  if (
    pathname === "/playgrounds/libs" ||
    pathname.startsWith("/playgrounds/libs/")
  ) {
    return false;
  }
  if (pathname.startsWith("/_app/")) return true;
  if (
    pathname === "/" ||
    pathname === "/help" ||
    pathname.startsWith("/help/") ||
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/room" ||
    pathname.startsWith("/room/") ||
    pathname.startsWith("/s/")
  ) {
    return true;
  }
  if (
    pathname === "/manifest.webmanifest" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon-32x32.png" ||
    pathname === "/og.png" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/icons/apple-touch-icon.png" ||
    pathname === "/icon-192.png" ||
    pathname === "/icon-512.png" ||
    pathname === "/icon-512-maskable.png" ||
    pathname.startsWith("/icons/")
  ) {
    return true;
  }
  // Host infra (sql.js WASM／glue) — network-first; cached after first successful fetch.
  if (pathname.startsWith("/vendor/")) {
    return true;
  }
  return /\.(?:js|css|woff2?|ttf|otf|png|svg|webp|ico|json|wasm)$/i.test(
    pathname
  );
}

function extractShellAssetUrls(html, origin) {
  const urls = new Set();
  const add = path => {
    const clean = String(path).split("?")[0] || "";
    if (!clean.startsWith("/")) return;
    try {
      urls.add(new URL(clean, origin).href);
    } catch {
      /* ignore */
    }
  };
  for (const m of html.matchAll(
    /(?:src|href)=["'](\/_app\/[^"']+)["']/gi
  )) {
    add(m[1]);
  }
  add("/manifest.webmanifest");
  add("/robots.txt");
  add("/sitemap.xml");
  add("/favicon.svg");
  add("/favicon.ico");
  add("/favicon-32x32.png");
  add("/og.png");
  add("/apple-touch-icon.png");
  add("/icons/apple-touch-icon.png");
  add("/icon-192.png");
  add("/icon-512.png");
  add("/icon-512-maskable.png");
  return [...urls];
}

function warmShellAssetsFromHtml(cache, html, origin) {
  const assets = extractShellAssetUrls(html, origin);
  return Promise.all(
    assets.map(async href => {
      try {
        const r = await fetch(href, { cache: "no-cache" });
        if (r.ok) await cache.put(href, r);
      } catch {
        /* ignore */
      }
    })
  );
}

/**
 * Hashed `/_app/*`: cache-first (content-addressed).
 * Documents／other shell: stale-while-revalidate — warm Cache 立刻回，背景更新。
 */
async function respondShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const url = new URL(request.url);

  if (url.pathname.startsWith("/_app/")) {
    const cachedApp = await cache.match(request);
    if (cachedApp) return cachedApp;
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok && request.method === "GET") {
        void cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      return (
        cachedApp ||
        new Response("", { status: 504, statusText: "Service Unavailable" })
      );
    }
  }

  const cached = await cache.match(request);

  const revalidate = async () => {
    try {
      const fresh = await fetch(request, { cache: "no-cache" });
      if (fresh && fresh.ok) {
        if (request.method === "GET" && isShellCacheablePath(url.pathname)) {
          void cache.put(request, fresh.clone());
          if (
            (request.mode === "navigate" ||
              (fresh.headers.get("content-type") || "").includes(
                "text/html"
              )) &&
            (url.pathname === "/" ||
              url.pathname === "/help" ||
              url.pathname.startsWith("/help/") ||
              url.pathname === "/chat" ||
              url.pathname.startsWith("/chat/") ||
              url.pathname === "/room" ||
              url.pathname.startsWith("/room/") ||
              url.pathname.startsWith("/s/"))
          ) {
            void (async () => {
              try {
                const html = await fresh.clone().text();
                await warmShellAssetsFromHtml(cache, html, url.origin);
              } catch {
                /* ignore */
              }
            })();
          }
        }
        return fresh;
      }
    } catch {
      /* fall through */
    }
    return null;
  };

  if (cached) {
    void revalidate();
    return cached;
  }

  const fresh = await revalidate();
  if (fresh) return fresh;
  if (request.mode === "navigate") {
    const home = await cache.match("/");
    if (home) return home;
  }
  return new Response(
    "現在沒有網路，而且這一頁還沒存到這台裝置。請連線後再開一次。",
    {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }
  );
}

async function respondCanvas(request, parsed) {
  if (parsed.filePath === "api" || parsed.filePath.startsWith("api/")) {
    return forwardApi(parsed.sandboxId, request);
  }
  const snap = snapshots.get(parsed.sandboxId);
  if (!snap) {
    return new Response("Canvas snapshot not ready", { status: 404 });
  }
  let path = parsed.filePath || "index.html";
  if (path.endsWith("/")) path += "index.html";
  const entry = snap.files[path];
  if (!entry) {
    return new Response(`Not found: ${path}`, { status: 404 });
  }
  if (entry.type === "text") {
    let body = String(entry.body);
    const mime = mimeFor(path);
    if (mime.startsWith("text/html")) {
      body = injectBridge(body);
    }
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(entry.body, {
    status: 200,
    headers: {
      "Content-Type": mimeFor(path),
      "Cache-Control": "no-store",
    },
  });
}

const ROOM_PLAY_PREFIX = "/room-play/";
/** @type {Map<string, { mime: string, size: number, spans: { start: number, bytes: Uint8Array }[], appendAt: number, ended: boolean, aborted: boolean, waiters: Function[], lastNeed: number }>} */
const roomPlays = new Map();

function parseRoomPlayPath(pathname) {
  if (!pathname.startsWith(ROOM_PLAY_PREFIX)) return null;
  const raw = pathname.slice(ROOM_PLAY_PREFIX.length);
  if (!raw || raw.includes("/")) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function parseByteRange(header, size) {
  if (!header || size <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(String(header).trim());
  if (!m) return null;
  const a = m[1];
  const b = m[2];
  if (a === "" && b === "") return null;
  if (a === "") {
    const suffix = Number(b);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isFinite(start) || start < 0) return null;
  const end = b === "" ? size - 1 : Number(b);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function playFetchRange(header, size) {
  const parsed = parseByteRange(header, size);
  if (parsed) return parsed;
  if (size > 0) return { start: 0, end: size - 1 };
  return null;
}

function wakePlay(s) {
  const waiters = s.waiters.splice(0);
  for (const w of waiters) w();
}

function waitPlay(s) {
  return new Promise(resolve => {
    s.waiters.push(resolve);
  });
}

function putPlaySpan(spans, start, chunk) {
  if (!chunk.byteLength) return spans;
  const incoming = { start, bytes: chunk };
  const all = spans.concat(incoming).sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of all) {
    const last = out[out.length - 1];
    if (!last) {
      out.push(s);
      continue;
    }
    const lastEnd = last.start + last.bytes.byteLength;
    const sEnd = s.start + s.bytes.byteLength;
    if (s.start > lastEnd) {
      out.push(s);
      continue;
    }
    const newEnd = Math.max(lastEnd, sEnd);
    const merged = new Uint8Array(newEnd - last.start);
    merged.set(last.bytes, 0);
    merged.set(s.bytes, s.start - last.start);
    out[out.length - 1] = { start: last.start, bytes: merged };
  }
  return out;
}

const ROOM_PLAY_MAX = 32 * 1024 * 1024;
const ROOM_PLAY_HEAD = 2 * 1024 * 1024;
const ROOM_PLAY_RANGE_SLICE = 512 * 1024;

function playStoredBytes(spans) {
  return spans.reduce((n, sp) => n + sp.bytes.byteLength, 0);
}

function trimPlaySpans(s) {
  const maxBytes = ROOM_PLAY_MAX;
  if (maxBytes <= 0) {
    s.spans = [];
    return;
  }
  const pinList =
    s.pins && s.pins.size > 0
      ? Array.from(s.pins.values()).sort((a, b) => a - b)
      : [0];
  const share = Math.max(1, Math.floor(maxBytes / pinList.length));
  const clipped = [];
  for (const pin of pinList) {
    const from = Math.max(0, pin);
    const to = from + share;
    for (const span of s.spans) {
      const end = span.start + span.bytes.byteLength;
      const a = Math.max(span.start, from);
      const b = Math.min(end, to);
      if (b <= a) continue;
      clipped.push({
        start: a,
        bytes: span.bytes.subarray(a - span.start, b - span.start),
      });
    }
  }
  s.spans = clipped.reduce(
    (acc, sp) => putPlaySpan(acc, sp.start, sp.bytes),
    []
  );
  while (playStoredBytes(s.spans) > maxBytes && s.spans.length > 0) {
    const last = s.spans[s.spans.length - 1];
    const overflow = playStoredBytes(s.spans) - maxBytes;
    if (overflow >= last.bytes.byteLength) {
      s.spans.pop();
      continue;
    }
    s.spans[s.spans.length - 1] = {
      start: last.start,
      bytes: last.bytes.subarray(0, last.bytes.byteLength - overflow),
    };
  }
}

function playSpansCover(spans, start, end) {
  if (end <= start) return true;
  let need = start;
  for (const s of spans) {
    const sEnd = s.start + s.bytes.byteLength;
    if (sEnd <= need) continue;
    if (s.start > need) return false;
    need = sEnd;
    if (need >= end) return true;
  }
  return need >= end;
}

function playContiguousEnd(spans, start) {
  let need = start;
  for (const s of spans) {
    const sEnd = s.start + s.bytes.byteLength;
    if (sEnd <= need) continue;
    if (s.start > need) break;
    need = sEnd;
  }
  return need;
}

function slicePlaySpans(spans, start, end) {
  const len = Math.max(0, end - start);
  const out = new Uint8Array(len);
  for (const s of spans) {
    const sEnd = s.start + s.bytes.byteLength;
    if (sEnd <= start || s.start >= end) continue;
    const from = Math.max(start, s.start);
    const to = Math.min(end, sEnd);
    out.set(s.bytes.subarray(from - s.start, to - s.start), from - start);
  }
  return out;
}

function applyRoomPlayMessage(data) {
  const id = typeof data.id === "string" ? data.id : "";
  if (!id) return;
  if (data.op === "open") {
    const prev = roomPlays.get(id);
    if (prev) {
      prev.aborted = true;
      wakePlay(prev);
    }
    roomPlays.set(id, {
      mime: data.mime || "application/octet-stream",
      size: Number(data.size) || 0,
      spans: [],
      appendAt: 0,
      pins: new Map(),
      ended: false,
      aborted: false,
      waiters: [],
      lastNeed: -1,
    });
    return;
  }
  const s = roomPlays.get(id);
  if (!s) return;
  if (data.op === "chunk") {
    const raw = data.bytes;
    if (!(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw)) return;
    const copy =
      raw instanceof ArrayBuffer
        ? new Uint8Array(raw.slice(0))
        : new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const at =
      typeof data.at === "number" && Number.isFinite(data.at) ? data.at : s.appendAt;
    if (!s.pins) s.pins = new Map();
    const pinList =
      s.pins.size > 0
        ? Array.from(s.pins.values()).sort((a, b) => a - b)
        : [0];
    const share = Math.max(1, Math.floor(ROOM_PLAY_MAX / pinList.length));
    const end = at + copy.byteLength;
    let useful = false;
    for (const pin of pinList) {
      const from = Math.max(0, pin);
      const to = from + share;
      if (at < to && end > from) {
        useful = true;
        break;
      }
    }
    if (!useful) return;
    s.spans = putPlaySpan(s.spans, at, copy);
    s.appendAt = at + copy.byteLength;
    trimPlaySpans(s);
    if (
      s.lastNeed >= 0 &&
      at <= s.lastNeed &&
      at + copy.byteLength > s.lastNeed
    ) {
      s.lastNeed = -1;
    }
    wakePlay(s);
    return;
  }
  if (data.op === "end") {
    s.ended = true;
    wakePlay(s);
    return;
  }
  if (data.op === "abort") {
    s.aborted = true;
    s.spans = [];
    wakePlay(s);
    roomPlays.delete(id);
  }
}

function livePlayStream(id) {
  let sent = 0;
  const streamKey = `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const s0 = roomPlays.get(id);
  if (s0) {
    if (!s0.pins) s0.pins = new Map();
    s0.pins.set(streamKey, sent);
  }
  return new ReadableStream({
    async pull(controller) {
      const s = roomPlays.get(id);
      if (!s || s.aborted) {
        controller.close();
        return;
      }
      let avail = playContiguousEnd(s.spans, sent);
      while (avail <= sent && !s.ended && !s.aborted) {
        await notifyPlayNeed(id, sent, sent + ROOM_PLAY_RANGE_SLICE - 1);
        await waitPlay(s);
        avail = playContiguousEnd(s.spans, sent);
      }
      const cur = roomPlays.get(id);
      if (!cur || cur.aborted) {
        controller.close();
        return;
      }
      avail = playContiguousEnd(cur.spans, sent);
      if (avail > sent) {
        const piece = slicePlaySpans(cur.spans, sent, avail);
        sent += piece.byteLength;
        if (cur.pins) cur.pins.set(streamKey, sent);
        trimPlaySpans(cur);
        void notifyPlayPin(id, streamKey, sent);
        controller.enqueue(piece);
        return;
      }
      controller.close();
    },
    cancel() {
      const s = roomPlays.get(id);
      if (!s || !s.pins) return;
      s.pins.delete(streamKey);
      trimPlaySpans(s);
      void notifyPlayPin(id, streamKey, -1);
    },
  });
}

async function notifyPlayPin(id, streamKey, at) {
  const s = roomPlays.get(id);
  if (s && at >= 0) {
    const prev = s.lastPinAt || 0;
    if (at > 0 && at - prev < 256 * 1024 && at !== prev) {
      /* coalesce small advances */
      s.pendingPin = { streamKey, at };
      return;
    }
    s.lastPinAt = at;
    s.pendingPin = null;
  }
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    try {
      client.postMessage({
        type: "go-room-play",
        op: at < 0 ? "unpin" : "pin",
        id,
        streamKey,
        at,
      });
    } catch {
      /* ignore */
    }
  }
}

async function notifyPlayNeed(id, start, end) {
  const s = roomPlays.get(id);
  if (!s) return;
  const now = Date.now();
  if (s.lastNeed === start && now - (s.lastNeedAt || 0) < 400) return;
  s.lastNeed = start;
  s.lastNeedAt = now;
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    try {
      client.postMessage({
        type: "go-room-play",
        op: "need",
        id,
        start,
        end,
      });
    } catch {
      /* ignore */
    }
  }
}

function emptyPlayStream() {
  return new ReadableStream({
    start(c) {
      c.close();
    },
  });
}

function rangePlayStream(id, range) {
  const limit = range.end + 1;
  let sent = range.start;
  const streamKey = `range-${range.start}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const s0 = roomPlays.get(id);
  if (s0) {
    if (!s0.pins) s0.pins = new Map();
    s0.pins.set(streamKey, sent);
    trimPlaySpans(s0);
    void notifyPlayPin(id, streamKey, sent);
  }
  return new ReadableStream({
    async pull(controller) {
      if (sent >= limit) {
        controller.close();
        return;
      }
      for (;;) {
        const s = roomPlays.get(id);
        if (!s || s.aborted) {
          controller.close();
          return;
        }
        const avail = Math.min(limit, playContiguousEnd(s.spans, sent));
        if (avail > sent) {
          const piece = slicePlaySpans(s.spans, sent, avail);
          sent += piece.byteLength;
          if (s.pins) s.pins.set(streamKey, sent);
          trimPlaySpans(s);
          void notifyPlayPin(id, streamKey, sent);
          controller.enqueue(piece);
          return;
        }
        if (s.ended) {
          controller.close();
          return;
        }
        const needEnd = Math.min(range.end, sent + ROOM_PLAY_RANGE_SLICE - 1);
        await notifyPlayNeed(id, sent, needEnd);
        await waitPlay(s);
      }
    },
    cancel() {
      const s = roomPlays.get(id);
      if (!s || !s.pins) return;
      s.pins.delete(streamKey);
      trimPlaySpans(s);
      void notifyPlayPin(id, streamKey, -1);
    },
  });
}

function servePlayRange(id, range) {
  const s = roomPlays.get(id);
  if (!s || s.aborted) {
    return { start: range.start, end: range.start - 1, body: emptyPlayStream() };
  }
  return {
    start: range.start,
    end: range.end,
    body: rangePlayStream(id, range),
  };
}

function waitForPlaySession(id, ms) {
  const ready = roomPlays.get(id);
  if (ready && !ready.aborted) return Promise.resolve(ready);
  return new Promise(resolve => {
    const t0 = Date.now();
    const tick = () => {
      const cur = roomPlays.get(id);
      if (cur && !cur.aborted) {
        resolve(cur);
        return;
      }
      if (Date.now() - t0 >= ms) {
        resolve(null);
        return;
      }
      setTimeout(tick, 15);
    };
    tick();
  });
}

async function respondRoomPlay(id, request) {
  let s = roomPlays.get(id);
  if (!s || s.aborted) {
    s = await waitForPlaySession(id, 8000);
  }
  if (!s || s.aborted) {
    return new Response(null, { status: 404 });
  }
  const mime = s.mime || "video/mp4";
  const size = s.size;
  const range = playFetchRange(
    request.headers.get("Range"),
    size
  );
  if (request.method === "HEAD" && !request.headers.get("Range")) {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(size || ""),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }
  if (range) {
    if (request.method === "HEAD") {
      const end = range.end;
      const total = size || "*";
      return new Response(null, {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Range": `bytes ${range.start}-${end}/${total}`,
          "Content-Length": String(end - range.start + 1),
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }
    const served = servePlayRange(id, range);
    if (served.end < served.start) {
      return new Response(null, { status: 416 });
    }
    const total = size || "*";
    return new Response(served.body, {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Range": `bytes ${served.start}-${served.end}/${total}`,
        "Content-Length": String(served.end - served.start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  }
  const headers = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
  return new Response(livePlayStream(id), { status: 200, headers });
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const playId = parseRoomPlayPath(url.pathname);
  if (playId) {
    event.respondWith(respondRoomPlay(playId, event.request));
    return;
  }

  const parsed = parseCanvas(url.pathname);
  if (parsed) {
    event.respondWith(respondCanvas(event.request, parsed));
    return;
  }

  if (event.request.method !== "GET" && event.request.method !== "HEAD") {
    return;
  }
  if (isSwEntry(url.pathname)) return;
  if (isInvitePath(url.pathname)) return;
  if (isDevOnlyPath(url.pathname)) return;
  if (!isShellCacheablePath(url.pathname) && event.request.mode !== "navigate") {
    return;
  }
  // Navigations to / and /s/* + cacheable assets: visit-then-offline shell.
  if (
    event.request.mode === "navigate" ||
    isShellCacheablePath(url.pathname)
  ) {
    if (event.request.mode === "navigate" && isInvitePath(url.pathname)) {
      return;
    }
    event.respondWith(respondShell(event.request));
  }
});

void GO_SW_REV;
void GO_SHELL_CACHE_REV;
void mimeFor;
