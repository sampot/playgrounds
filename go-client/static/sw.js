/**
 * go-client Service Worker (DEC-050).
 * (1) Canvas memory snapshot `/canvas/<sandboxId>/*` + `/api` → shell
 * (2) Shell offline: network-first for documents／assets (visit-then-offline §6.5)
 *
 * Must stay aligned with field public/sw.js for canvas-bridge + API forward.
 */
const GO_SW_REV = 8;
const CANVAS_PREFIX = "/canvas/";
const SYNC_TYPE = "playgrounds-canvas-sync";
const SYNC_ACK = "playgrounds-canvas-sync-ack";
const API_TYPE = "playgrounds-canvas-api";
const API_RESULT = "playgrounds-canvas-api-result";
const SHELL_CACHE = `go-shell-offline-v${GO_SW_REV}`;

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

/** Invite short links — never offline-shell (temporary／needs network). */
function isInvitePath(pathname) {
  return pathname === "/i" || pathname.startsWith("/i/");
}

function isShellCacheablePath(pathname) {
  if (isSwEntry(pathname)) return false;
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

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request, { cache: "no-cache" });
    if (fresh && fresh.ok) {
      const url = new URL(request.url);
      if (request.method === "GET" && isShellCacheablePath(url.pathname)) {
        void cache.put(request, fresh.clone());
        if (
          (request.mode === "navigate" ||
            (fresh.headers.get("content-type") || "").includes("text/html")) &&
          (url.pathname === "/" ||
            url.pathname === "/help" ||
            url.pathname.startsWith("/help/") ||
            url.pathname.startsWith("/s/"))
        ) {
          try {
            const html = await fresh.clone().text();
            const assets = extractShellAssetUrls(html, url.origin);
            await Promise.all(
              assets.map(async href => {
                try {
                  const r = await fetch(href, { cache: "no-cache" });
                  if (r.ok) await cache.put(href, r);
                } catch {
                  /* ignore */
                }
              })
            );
          } catch {
            /* ignore */
          }
        }
      }
      return fresh;
    }
  } catch {
    /* fall through */
  }
  const cached = await cache.match(request);
  if (cached) return cached;
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

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

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
  if (!isShellCacheablePath(url.pathname) && event.request.mode !== "navigate") {
    return;
  }
  // Navigations to / and /s/* + cacheable assets: network-first offline shell.
  if (
    event.request.mode === "navigate" ||
    isShellCacheablePath(url.pathname)
  ) {
    if (event.request.mode === "navigate" && isInvitePath(url.pathname)) {
      return;
    }
    event.respondWith(networkFirstShell(event.request));
  }
});

void GO_SW_REV;
void mimeFor;
