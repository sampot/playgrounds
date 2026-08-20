/**
 * go-client Service Worker (DEC-050).
 * (1) Canvas memory snapshot `/canvas/<sandboxId>/*` + `/api` → shell
 * (2) Shell offline: visit-then-offline（§6.5）— 有 Cache 先回、背景再驗證；
 *     `/_app/*` 雜湊資源 cache-first。Vite／dev 路徑不攔截（對齊 field public/sw.js）。
 *
 * GO_SW_REV＝橋／room-play 邏輯；GO_SHELL_CACHE_REV＝殼 Cache 名。
 * 只改 room-play／canvas 時只 bump GO_SW_REV，勿清掉已暖好的離線殼。
 */
const GO_SW_REV = 39;
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

const ROOM_FILE_PREFIX = "/room-file/";
const ROOM_PLAY_PREFIX = "/room-play/";
/** @type {Map<string, { mime: string, size: number, spans: { start: number, bytes: Uint8Array }[], appendAt: number, ended: boolean, aborted: boolean, waiters: Function[], lastNeed: number }>} */
const roomPlays = new Map();
/** @type {Map<string, File>} */
const roomLocalFiles = new Map();

function parseRoomPlayPath(pathname) {
  let prefix = null;
  if (pathname.startsWith(ROOM_FILE_PREFIX)) prefix = ROOM_FILE_PREFIX;
  else if (pathname.startsWith(ROOM_PLAY_PREFIX)) prefix = ROOM_PLAY_PREFIX;
  if (!prefix) return null;
  const raw = pathname.slice(prefix.length);
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
  if (start >= size) return null;
  const end = b === "" ? size - 1 : Number(b);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function playFetchRange(header, size) {
  return parseByteRange(header, size);
}

function isBytesRangeHeader(header) {
  return Boolean(header && /^bytes=/i.test(String(header).trim()));
}

const MEDIA_EXT_MIME = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

function extOfName(name) {
  const base = String(name || "").split("/").pop() || "";
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i + 1).toLowerCase();
}

function roomFileContentType(mime, name) {
  const t = String(mime || "").trim().toLowerCase();
  if (t && t !== "application/octet-stream") return t;
  return MEDIA_EXT_MIME[extOfName(name)] || t || "application/octet-stream";
}

function isMediaContentType(mime) {
  const t = String(mime || "").toLowerCase();
  return t.startsWith("video/") || t.startsWith("audio/");
}

function isWebKitMediaEngine(ua) {
  const s = String(ua || "");
  if (/Chrome|Chromium|Edg\/|Android/i.test(s)) return false;
  return /Safari/i.test(s) || /AppleWebKit/i.test(s);
}

const ROOM_PLAY_MEDIA_BLOB_MAX = 2 * 1024 * 1024;

function mediaRangeForBufferedBody(range, size, maxBytes) {
  const cap = Math.max(1, maxBytes || ROOM_PLAY_MEDIA_BLOB_MAX);
  if (range) {
    return {
      start: range.start,
      end: Math.min(range.end, range.start + cap - 1, Math.max(0, size - 1)),
    };
  }
  return { start: 0, end: Math.min(Math.max(0, size - 1), cap - 1) };
}

function roomFileHttpBodyKind(opts) {
  if (opts.local) return "blob-local";
  if (!isMediaContentType(opts.mime) || !isWebKitMediaEngine(opts.ua)) {
    return "stream";
  }
  const dest = String(opts.destination || "").toLowerCase();
  if (dest === "video" || dest === "audio" || dest === "track") {
    return "blob-media";
  }
  if (opts.hasRange) return "blob-media";
  return "stream";
}

function localFileSlice(file, start, endExclusive, name) {
  const type = roomFileContentType(file.type, name || file.name);
  const from = Math.max(0, start);
  const to = Math.max(from, endExclusive);
  return file.slice(from, to, type);
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

function playStoredBytes(spans) {
  return spans.reduce((n, sp) => n + sp.bytes.byteLength, 0);
}

function trimPlaySpans(s) {
  const maxBytes = s.maxBytes || ROOM_PLAY_MAX;
  if (maxBytes <= 0) {
    s.spans = [];
    return;
  }
  if (s.mode === "save") {
    const pinList =
      s.pins && s.pins.size > 0 ? Array.from(s.pins.values()) : [0];
    const minPin = Math.max(0, Math.min.apply(null, pinList));
    if (minPin > 0) {
      const clipped = [];
      for (const span of s.spans) {
        const end = span.start + span.bytes.byteLength;
        if (end <= minPin) continue;
        if (span.start < minPin) {
          clipped.push({
            start: minPin,
            bytes: span.bytes.subarray(minPin - span.start),
          });
        } else {
          clipped.push(span);
        }
      }
      s.spans = clipped.reduce(
        (acc, sp) => putPlaySpan(acc, sp.start, sp.bytes),
        []
      );
    }
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
  if (data.op === "register-local") {
    const file = data.file;
    if (file && typeof file.size === "number" && typeof file.slice === "function") {
      roomLocalFiles.set(id, file);
      const prev = roomPlays.get(id);
      if (prev) {
        prev.aborted = true;
        wakePlay(prev);
        roomPlays.delete(id);
      }
    }
    return;
  }
  if (data.op === "unregister-local") {
    roomLocalFiles.delete(id);
    return;
  }
  if (data.op === "open") {
    const prev = roomPlays.get(id);
    if (prev) {
      prev.aborted = true;
      wakePlay(prev);
    }
    roomPlays.set(id, {
      mime: data.mime || "application/octet-stream",
      size: Number(data.size) || 0,
      maxBytes: ROOM_PLAY_MAX,
      name: typeof data.name === "string" ? data.name : "",
      mode: data.mode === "save" ? "save" : "play",
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
    /**
     * Page mirror already gated on the pin window (append waits). Do not drop
     * here — silent drops caused large saves to end short (檔案不完整).
     */
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
    void flushPendingPlayPin(id);
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
  let settled = false;
  const streamKey = `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const s0 = roomPlays.get(id);
  const transferId = allocRoomTransferId();
  const purpose = s0 && s0.mode === "save" ? "save" : "play";
  const expectSize = s0 && s0.size > 0 ? s0.size : 0;
  const endExclusive = expectSize > 0 ? expectSize - 1 : undefined;
  void notifyOpenTransfer(id, transferId, 0, endExclusive, purpose);
  if (s0) {
    if (!s0.pins) s0.pins = new Map();
    s0.pins.set(streamKey, sent);
  }
  const settle = (ok, reason) => {
    if (settled) return;
    settled = true;
    void notifyTransferEnd(id, transferId, ok, sent, reason);
  };
  return new ReadableStream({
    async pull(controller) {
      const s = roomPlays.get(id);
      if (!s || s.aborted) {
        settle(false, "aborted");
        controller.close();
        return;
      }
      if (expectSize > 0 && sent >= expectSize) {
        settle(true);
        controller.close();
        return;
      }
      let avail = playContiguousEnd(s.spans, sent);
      while (
        avail <= sent &&
        !s.ended &&
        !s.aborted &&
        !(expectSize > 0 && sent >= expectSize)
      ) {
        await flushPendingPlayPin(id);
        await waitPlay(s);
        avail = playContiguousEnd(s.spans, sent);
      }
      const cur = roomPlays.get(id);
      if (!cur || cur.aborted) {
        settle(false, "aborted");
        controller.close();
        return;
      }
      if (expectSize > 0 && sent >= expectSize) {
        settle(true);
        controller.close();
        return;
      }
      avail = playContiguousEnd(cur.spans, sent);
      if (avail > sent) {
        const limit = expectSize > 0 ? Math.min(avail, expectSize) : avail;
        const piece = slicePlaySpans(cur.spans, sent, limit);
        sent += piece.byteLength;
        if (cur.pins) cur.pins.set(streamKey, sent);
        trimPlaySpans(cur);
        void notifyPlayPin(id, streamKey, sent);
        controller.enqueue(piece);
        if (expectSize > 0 && sent >= expectSize) {
          settle(true);
          controller.close();
        }
        return;
      }
      if (cur.ended && expectSize > 0 && sent < expectSize) {
        settle(false, "incomplete");
        controller.error(new Error("incomplete file body"));
        return;
      }
      settle(true);
      controller.close();
    },
    cancel() {
      const s = roomPlays.get(id);
      if (s && s.pins) {
        s.pins.delete(streamKey);
        trimPlaySpans(s);
        void notifyPlayPin(id, streamKey, -1);
      }
      const wasOk = settled;
      settle(false, "cancelled");
      /**
       * After a successful body, Safari／Chrome often cancel() the stream.
       * Do not treat that as save-cancel — UI would flicker／stick busy.
       */
      if (wasOk) return;
      const cur = roomPlays.get(id);
      if (!cur || !cur.pins || cur.pins.size === 0) {
        void notifyPlaySaveCancel(id);
      }
    },
  });
}

async function notifyPlaySaveCancel(id) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    try {
      client.postMessage({
        type: "go-room-play",
        op: "save-cancel",
        id,
      });
    } catch {
      /* ignore */
    }
  }
}

function allocRoomTransferId() {
  return `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** One HTTP response ↔ one transferId; page must session_file.request with this id. */
async function notifyOpenTransfer(id, transferId, offset, end, purpose) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    try {
      client.postMessage({
        type: "go-room-play",
        op: "open-transfer",
        id,
        transferId,
        offset,
        end,
        purpose,
      });
    } catch {
      /* ignore */
    }
  }
}

/** Completion authority: HTTP body delivered (or aborted) for this transferId. */
async function notifyTransferEnd(id, transferId, ok, delivered, reason) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    try {
      client.postMessage({
        type: "go-room-play",
        op: ok ? "transfer-complete" : "transfer-abort",
        id,
        transferId,
        delivered,
        reason,
      });
    } catch {
      /* ignore */
    }
  }
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
  await postPlayPin(id, streamKey, at);
}

async function flushPendingPlayPin(id) {
  const s = roomPlays.get(id);
  if (!s || !s.pendingPin) return;
  const { streamKey, at } = s.pendingPin;
  s.pendingPin = null;
  s.lastPinAt = at;
  await postPlayPin(id, streamKey, at);
}

async function postPlayPin(id, streamKey, at) {
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
  let settled = false;
  const streamKey = `range-${range.start}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const s0 = roomPlays.get(id);
  const transferId = allocRoomTransferId();
  const purpose = s0 && s0.mode === "save" ? "save" : "play";
  void notifyOpenTransfer(id, transferId, range.start, range.end, purpose);
  if (s0) {
    if (!s0.pins) s0.pins = new Map();
    s0.pins.set(streamKey, sent);
    trimPlaySpans(s0);
    void notifyPlayPin(id, streamKey, sent);
  }
  const settle = (ok, reason) => {
    if (settled) return;
    settled = true;
    void notifyTransferEnd(id, transferId, ok, sent - range.start, reason);
  };
  return new ReadableStream({
    async pull(controller) {
      if (sent >= limit) {
        settle(true);
        controller.close();
        return;
      }
      for (;;) {
        const s = roomPlays.get(id);
        if (!s || s.aborted) {
          settle(false, "aborted");
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
          if (sent >= limit) {
            settle(true);
            controller.close();
          }
          return;
        }
        if (s.ended) {
          if (sent < limit) {
            settle(false, "incomplete");
            controller.error(new Error("incomplete file body"));
            return;
          }
          settle(true);
          controller.close();
          return;
        }
        await waitPlay(s);
      }
    },
    cancel() {
      const s = roomPlays.get(id);
      if (s && s.pins) {
        s.pins.delete(streamKey);
        trimPlaySpans(s);
        void notifyPlayPin(id, streamKey, -1);
      }
      const wasOk = settled;
      settle(false, "cancelled");
      if (wasOk) return;
      const cur = roomPlays.get(id);
      if (!cur || !cur.pins || cur.pins.size === 0) {
        void notifyPlaySaveCancel(id);
      }
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

async function readPlayStreamToBytes(stream) {
  const reader = stream.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength) {
      parts.push(value);
      n += value.byteLength;
    }
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

function mediaRangeHeaders(mime, start, end, size) {
  const total = size > 0 ? size : "*";
  return {
    "Content-Type": mime,
    "Content-Range": `bytes ${start}-${end}/${total}`,
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  };
}

async function respondRoomPlay(id, request) {
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const ua =
    (self.navigator && self.navigator.userAgent) ||
    request.headers.get("User-Agent") ||
    "";

  const localFile = roomLocalFiles.get(id);
  if (localFile) {
    const mime = roomFileContentType(localFile.type, localFile.name);
    const size = localFile.size;
    const rangeHeader = request.headers.get("Range");
    const range = playFetchRange(rangeHeader, size);
    if (isBytesRangeHeader(rangeHeader) && !range) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${size > 0 ? size : "*"}`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (method === "HEAD" && !range) {
      const headers = {
        "Content-Type": mime,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };
      if (size > 0) headers["Content-Length"] = String(size);
      return new Response(null, { status: 200, headers });
    }
    if (range) {
      const len = range.end - range.start + 1;
      if (method === "HEAD") {
        return new Response(null, {
          status: 206,
          headers: mediaRangeHeaders(mime, range.start, range.end, size),
        });
      }
      return new Response(
        localFileSlice(localFile, range.start, range.end + 1),
        {
          status: 206,
          headers: mediaRangeHeaders(mime, range.start, range.end, size),
        }
      );
    }
    const headers = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };
    if (size > 0) headers["Content-Length"] = String(size);
    if (method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }
    return new Response(localFileSlice(localFile, 0, size), {
      status: 200,
      headers,
    });
  }

  let s = roomPlays.get(id);
  if (!s || s.aborted) {
    s = await waitForPlaySession(id, 8000);
  }
  if (!s || s.aborted) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
  const mime = roomFileContentType(s.mime, s.name);
  const size = s.size;
  const rangeHeader = request.headers.get("Range");
  const range = playFetchRange(rangeHeader, size);
  const bodyKind = roomFileHttpBodyKind({
    ua,
    mime,
    local: false,
    destination: request.destination,
    hasRange: Boolean(range),
  });
  if (isBytesRangeHeader(rangeHeader) && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size > 0 ? size : "*"}`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (method === "HEAD" && !range) {
    const headers = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };
    if (size > 0) headers["Content-Length"] = String(size);
    return new Response(null, { status: 200, headers });
  }
  if (range || bodyKind === "blob-media") {
    const servedRange =
      bodyKind === "blob-media"
        ? mediaRangeForBufferedBody(range, size > 0 ? size : (range ? range.end + 1 : 0))
        : range;
    if (!servedRange) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${size > 0 ? size : "*"}`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (method === "HEAD") {
      return new Response(null, {
        status: 206,
        headers: mediaRangeHeaders(
          mime,
          servedRange.start,
          servedRange.end,
          size
        ),
      });
    }
    if (bodyKind === "blob-media") {
      try {
        const served = servePlayRange(id, servedRange);
        if (served.end < served.start) {
          return new Response(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${size > 0 ? size : "*"}`,
              "Cache-Control": "no-store",
            },
          });
        }
        const bytes = await readPlayStreamToBytes(served.body);
        const end = servedRange.start + Math.max(0, bytes.byteLength) - 1;
        if (bytes.byteLength <= 0 || end < servedRange.start) {
          return new Response(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${size > 0 ? size : "*"}`,
              "Cache-Control": "no-store",
            },
          });
        }
        return new Response(bytes, {
          status: 206,
          headers: mediaRangeHeaders(mime, servedRange.start, end, size),
        });
      } catch {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${size > 0 ? size : "*"}`,
            "Cache-Control": "no-store",
          },
        });
      }
    }
    const served = servePlayRange(id, servedRange);
    if (served.end < served.start) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${size > 0 ? size : "*"}`,
          "Cache-Control": "no-store",
        },
      });
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
  if (size > 0) headers["Content-Length"] = String(size);
  return new Response(livePlayStream(id), { status: 200, headers });
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
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
