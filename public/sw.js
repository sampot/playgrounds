/**
 * Site Service Worker (DEC-009 + DEC-016 + DEC-041): single registration, scope `/`.
 * - Playgrounds canvas virtual origin (memory snapshots + /api → shell)
 * - Offline runtime cache for Playgrounds shell (blog `/playgrounds/` or standalone `/`)
 * - Other navigations offline → /offline/ (Header + offline copy)
 * Keep canvas algorithms aligned with src/components/playgrounds/canvasSwProtocol.ts
 * and path rules with src/components/playgrounds/playgroundsPaths.ts.
 */
/* eslint-disable no-restricted-globals */

// Bump when offline strategy or canvas bridge changes (clears sticky Cache API entries).
const CACHE_NAME = "samkuo-offline-v13";
/** Embedded in BRIDGE string — change when console mirror behaviour changes. */
const CANVAS_BRIDGE_REV = 9;
const OFFLINE_URL = "/offline/";
/** Prefer network over HTTP disk cache while online (DEC-009). */
const REVALIDATE = { cache: "no-cache" };
// Strategy rules: keep aligned with src/utils/swOfflineStrategy.ts

/** Blog + standalone canvas prefixes (DEC-041). */
const CANVAS_PREFIXES = ["/playgrounds/canvas/", "/canvas/"];
const SYNC_TYPE = "playgrounds-canvas-sync";
const SYNC_ACK = "playgrounds-canvas-sync-ack";
const API_TYPE = "playgrounds-canvas-api";
/** Default shell↔functions round-trip (body is fully buffered before reply). */
const API_TIMEOUT_MS = 30000;
/**
 * LLM routes buffer the full upstream SSE/JSON before the SW can reply, so the
 * wall clock includes model generation — keep this well above typical turns.
 */
const API_LLM_TIMEOUT_MS = 300000;
const API_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

/** @type {Map<string, { sandboxId: string, generation: number, files: Record<string, { type: string, body: string|ArrayBuffer }> }>} */
const snapshots = new Map();

/**
 * Root-mount shell hosts: field net, self-host (Workers/Pages/Vercel/Netlify),
 * and local preview. Only the legacy blog apex keeps the `/playgrounds/` mount.
 */
function isStandaloneHost() {
  try {
    const h = self.location.hostname.toLowerCase().replace(/\.$/, "");
    if (h === "samkuo.me" || h === "www.samkuo.me") return false;
    return true;
  } catch {
    return true;
  }
}

function isCanvasVirtualPath(pathname) {
  for (const prefix of CANVAS_PREFIXES) {
    if (pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/** Only the SW entry itself — never intercept (lets the browser update algorithm run). */
function isSwEntryScript(pathname) {
  return pathname === "/sw.js";
}

function isPlaygroundsShellClientPath(pathname) {
  if (isCanvasVirtualPath(pathname)) return false;
  if (
    pathname === "/playgrounds" ||
    pathname === "/playgrounds/" ||
    pathname.startsWith("/playgrounds/")
  ) {
    return true;
  }
  if (isStandaloneHost() && (pathname === "/" || pathname === "/index.html")) {
    return true;
  }
  return false;
}

function isPlaygroundsOfflinePath(pathname) {
  if (isCanvasVirtualPath(pathname)) return false;
  if (isSwEntryScript(pathname)) return false;
  if (pathname === OFFLINE_URL) return true;
  if (
    pathname === "/playgrounds" ||
    pathname === "/playgrounds/" ||
    pathname.startsWith("/playgrounds/")
  ) {
    return true;
  }
  // Standalone deploy: root document is the shell (DEC-041).
  if (isStandaloneHost() && (pathname === "/" || pathname === "/index.html")) {
    return true;
  }
  return false;
}

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

function isHashedAstroAsset(pathname) {
  return pathname.startsWith("/_astro/");
}

function shouldNetworkFirstAsset(url) {
  const { pathname } = url;
  if (isDevOnlyPath(pathname)) return false;
  if (isCanvasVirtualPath(pathname)) return false;
  if (isSwEntryScript(pathname)) return false;
  // /_astro/* included: network-first online; Cache API only offline fallback.
  if (pathname.startsWith("/icons/")) return true;
  if (pathname === "/favicon.svg") return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/register-sw.js") return true;
  if (pathname === "/toggle-theme.js" || pathname === "/toggle-font-size.js") {
    return true;
  }
  if (isHashedAstroAsset(pathname)) return true;
  return /\.(?:js|css|woff2?|ttf|otf|png|svg|webp|ico|wasm)$/i.test(pathname);
}

/** Stable Cache API key: drop query (e.g. ?astro-retry=, ?v=) for hashed / shell assets. */
function cacheRequestFor(request) {
  try {
    const url = new URL(request.url);
    if (
      isHashedAstroAsset(url.pathname) ||
      url.pathname === "/register-sw.js" ||
      url.pathname === "/toggle-theme.js" ||
      url.pathname === "/toggle-font-size.js"
    ) {
      url.search = "";
      return new Request(url.href, { method: "GET" });
    }
  } catch {
    /* fall through */
  }
  return request;
}

async function matchFromCache(cache, request) {
  const key = cacheRequestFor(request);
  const exact = await cache.match(key);
  if (exact) return exact;
  // Ignore search for /_astro retries that used a different key historically.
  if (isHashedAstroAsset(new URL(request.url).pathname)) {
    return cache.match(request, { ignoreSearch: true });
  }
  return undefined;
}

/**
 * Pull /_astro + shell asset URLs out of HTML so offline has modules even when
 * the first paint raced ahead of SW control.
 * @param {string} html
 * @param {string} origin
 * @returns {string[]}
 */
function extractShellAssetUrls(html, origin) {
  const urls = new Set();
  const add = path => {
    const clean = String(path).split("?")[0];
    if (!clean.startsWith("/")) return;
    try {
      urls.add(new URL(clean, origin).href);
    } catch {
      /* ignore */
    }
  };
  // Astro islands use component-url / renderer-url, not only src/href.
  const astroRe = /\/_astro\/[A-Za-z0-9_.-]+/g;
  let m;
  while ((m = astroRe.exec(html))) {
    add(m[0]);
  }
  const attrRe =
    /(?:src|href)=["'](\/(?:register-sw|toggle-theme|toggle-font-size)\.js[^"']*|\/icons\/[^"']+|\/favicon\.svg)["']/gi;
  while ((m = attrRe.exec(html))) {
    add(m[1]);
  }
  return [...urls];
}

async function precacheUrls(urls) {
  if (!urls.length) return;
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    urls.map(async href => {
      try {
        const key = cacheRequestFor(new Request(href));
        if (await cache.match(key)) return;
        const response = await fetch(key, REVALIDATE);
        if (response.ok) await cache.put(key, response.clone());
      } catch {
        /* ignore precache failures */
      }
    })
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = cacheRequestFor(request);
  try {
    const response = await fetch(request, REVALIDATE);
    if (response.ok) {
      await cache.put(key, response.clone());
    }
    return response;
  } catch {
    const cached = await matchFromCache(cache, request);
    if (cached) return cached;
    try {
      const url = new URL(request.url);
      const alt = url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : `${url.pathname}/`;
      if (alt && alt !== url.pathname) {
        const altCached = await cache.match(
          new Request(new URL(alt, url.origin).href)
        );
        if (altCached) return altCached;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

async function networkFirstDocument(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = cacheRequestFor(request);
  try {
    const response = await fetch(request, REVALIDATE);
    if (response.ok) {
      await cache.put(key, response.clone());
      const ctype = response.headers.get("content-type") || "";
      if (ctype.includes("text/html")) {
        const html = await response.clone().text();
        // Do not block navigation on precache; shell modules for offline.
        void precacheUrls(extractShellAssetUrls(html, self.location.origin));
      }
    }
    return response;
  } catch {
    const cached = await matchFromCache(cache, request);
    if (cached) return cached;
    try {
      const url = new URL(request.url);
      const alt = url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : `${url.pathname}/`;
      if (alt && alt !== url.pathname) {
        const altCached = await cache.match(
          new Request(new URL(alt, url.origin).href)
        );
        if (altCached) return altCached;
      }
    } catch {
      /* ignore */
    }
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function networkFirstAsset(request) {
  const hit = await networkFirst(request);
  if (hit) return hit;
  return new Response("", {
    status: 503,
    statusText: "Service Unavailable",
  });
}

async function networkOnlyWithOfflineFallback(request) {
  try {
    return await fetch(request, REVALIDATE);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/** @param {FetchEvent} event @returns {boolean} */
function respondWithOfflineCache(event) {
  const { request } = event;
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (isSwEntryScript(url.pathname)) return false;
  // Vite / Astro-dev modules: never intercept (avoids 504 Outdated Optimize Dep).
  if (isDevOnlyPath(url.pathname)) return false;

  // No cache-first paths: while online, network (+ no-cache) always wins.
  if (isPlaygroundsOfflinePath(url.pathname)) {
    event.respondWith(networkFirstDocument(request));
    return true;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkOnlyWithOfflineFallback(request));
    return true;
  }
  if (shouldNetworkFirstAsset(url)) {
    event.respondWith(networkFirstAsset(request));
    return true;
  }
  return false;
}

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.add(OFFLINE_URL);
      } catch {
        /* optional at install */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key.startsWith("samkuo-offline") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", event => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "playgrounds-canvas-claim") {
    event.waitUntil(self.clients.claim());
    return;
  }
  if (data.type !== SYNC_TYPE) return;
  // sandboxId preferred; projectId accepted during Phase 0b migration
  const syncSandboxId =
    typeof data.sandboxId === "string" && data.sandboxId
      ? data.sandboxId
      : typeof data.projectId === "string"
        ? data.projectId
        : "";
  if (!syncSandboxId) return;
  if (typeof data.files !== "object" || !data.files) return;
  const snap = {
    sandboxId: syncSandboxId,
    generation: Number(data.generation) || 0,
    files: data.files,
  };
  snapshots.set(snap.sandboxId, snap);
  const port = event.ports && event.ports[0];
  if (port) {
    port.postMessage({
      type: SYNC_ACK,
      sandboxId: snap.sandboxId,
      generation: snap.generation,
    });
  }
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  if (isCanvasVirtualPath(url.pathname)) {
    const parsed = parseCanvasUrlPath(url.pathname);
    if (!parsed) return;
    const filePath = parsed.filePath || "index.html";
    if (isCanvasApiPath(filePath)) {
      if (!API_METHODS.has(request.method)) {
        event.respondWith(
          new Response("Method Not Allowed", {
            status: 405,
            headers: {
              "Cache-Control": "no-store",
              Allow: [...API_METHODS].join(", "),
            },
          })
        );
        return;
      }
      event.respondWith(handleApiRequest(event, parsed.sandboxId));
      return;
    }
    if (request.method !== "GET") return;
    event.respondWith(handleCanvasRequest(url));
    return;
  }

  // Offline cache on all hosts (incl. localhost preview). Vite paths passthrough
  // inside respondWithOfflineCache via isDevOnlyPath.
  respondWithOfflineCache(event);
});

/**
 * @param {string} path
 * @returns {string}
 */
function normalizeProjectPath(path) {
  const trimmed = String(path).trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  const noLead = trimmed.replace(/^(\.\/)+/g, "").replace(/^\/+/g, "");
  const parts = [];
  for (const part of noLead.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) {
        throw new Error("路徑不可超出專案根目錄");
      }
      parts.pop();
      continue;
    }
    if (part.includes("\0")) {
      throw new Error("路徑含非法字元");
    }
    parts.push(part);
  }
  return parts.join("/");
}

/**
 * @param {string} pathname
 * @returns {{ sandboxId: string, filePath: string } | null}
 */
function parseCanvasUrlPath(pathname) {
  let rest = null;
  for (const prefix of CANVAS_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      rest = pathname.slice(prefix.length);
      break;
    }
  }
  if (rest == null || !rest) return null;
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
  if (!sandboxId || sandboxId.includes("/") || sandboxId.includes("\0")) {
    return null;
  }
  if (!rawFile || rawFile.endsWith("/")) {
    return { sandboxId, filePath: "" };
  }
  try {
    const filePath = normalizeProjectPath(decodeURIComponent(rawFile));
    return { sandboxId, filePath };
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath
 */
function isCanvasApiPath(filePath) {
  return filePath === "api" || filePath.startsWith("api/");
}

/**
 * @param {string} path
 */
function mimeForCanvasPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".html") || lower.endsWith(".htm"))
    return "text/html; charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs"))
    return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx"))
    return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

const BRIDGE = `<script data-playgrounds-bridge>
(function () {
  /* canvas-bridge-rev:${CANVAS_BRIDGE_REV} */
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
  function resolveUrl(input) {
    try {
      if (typeof input === "string") return new URL(input, location.href).href;
      if (input && typeof input === "object" && "url" in input) return String(input.url);
    } catch (_) {}
    return String(input);
  }
  function resolveMethod(input, init) {
    if (init && init.method) return String(init.method).toUpperCase();
    if (input && typeof input === "object" && input.method) return String(input.method).toUpperCase();
    return "GET";
  }
  function isSameOrigin(url) {
    try { return new URL(url, location.href).origin === location.origin; } catch (_) { return false; }
  }
  window.fetch = function (input, init) {
    const rewritten = rewriteApiInput(input);
    const method = resolveMethod(rewritten, init);
    const url = resolveUrl(rewritten);
    const started = Date.now();
    const log = isSameOrigin(url);
    return _fetch(rewritten, init).then(function (res) {
      if (log) {
        parent.postMessage({
          type: "playgrounds-preview-network",
          method: method,
          url: url,
          status: res.status,
          ok: res.ok,
          durationMs: Date.now() - started,
          contentType: res.headers.get("content-type") || undefined
        }, "*");
      }
      return res;
    }, function (err) {
      if (log) {
        parent.postMessage({
          type: "playgrounds-preview-network",
          method: method,
          url: url,
          status: 0,
          ok: false,
          durationMs: Date.now() - started,
          error: String(err && err.message ? err.message : err)
        }, "*");
      }
      throw err;
    });
  };

  function walkDom(node, depth) {
    if (!node || depth > 14) return "";
    if (node.nodeType === 3) {
      var t = String(node.textContent || "").replace(/\\s+/g, " ").trim();
      return t ? t.slice(0, 80) : "";
    }
    if (node.nodeType !== 1) return "";
    var el = node;
    var tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript" || tag === "svg") return "";
    var role = el.getAttribute("role") || "";
    var id = el.id ? ("#" + el.id) : "";
    var label = el.getAttribute("aria-label") || el.getAttribute("name") || "";
    var typeAttr = el.getAttribute("type") || "";
    var extras = "";
    if (tag === "input" || tag === "textarea" || tag === "select") {
      extras = (typeAttr ? (" type=" + typeAttr) : "") + " [control]";
    }
    var open = tag + id + (role ? ("[role=" + role + "]") : "") + (label ? ("(" + String(label).slice(0, 40) + ")") : "") + extras;
    var kids = [];
    var children = el.childNodes || [];
    for (var i = 0; i < children.length; i++) {
      var part = walkDom(children[i], depth + 1);
      if (part) kids.push(part);
    }
    if (!kids.length) return "<" + open + "/>";
    return "<" + open + ">" + kids.join(" ") + "</" + tag + ">";
  }

  var mirrorToBrowser = false;
  try {
    var prefsRaw = localStorage.getItem("playgrounds-prefs-v1");
    if (prefsRaw) {
      var prefsObj = JSON.parse(prefsRaw);
      mirrorToBrowser = !!prefsObj.mirrorConsoleToBrowser;
    }
  } catch (_) { /* ignore */ }
  function serializeArg(a) {
    if (a === null) return "null";
    if (a === undefined) return "undefined";
    var t = typeof a;
    if (t === "string") return a;
    if (t === "number" || t === "boolean" || t === "bigint") return String(a);
    if (t === "symbol") return a.toString();
    if (t === "function") {
      return "[Function" + (a.name ? (" " + a.name) : "") + "]";
    }
    if (a instanceof Error) {
      return a.stack || (a.name + ": " + a.message) || String(a);
    }
    try {
      return JSON.stringify(a);
    } catch (_) {
      try { return String(a); } catch (__) { return "[unserializable]"; }
    }
  }
  function postConsole(level, args) {
    parent.postMessage({
      type: "playgrounds-preview-console",
      level: level,
      args: Array.prototype.map.call(args, serializeArg)
    }, "*");
  }
  function wantMirror() {
    if (typeof window.__pgConsoleMirror === "boolean") return window.__pgConsoleMirror;
    return mirrorToBrowser;
  }
  function patchConsole(level, nativeFn) {
    return function () {
      postConsole(level, arguments);
      if (wantMirror()) {
        try { nativeFn.apply(console, arguments); } catch (_) { /* ignore */ }
      }
    };
  }

  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "playgrounds-console-mirror") {
      mirrorToBrowser = !!data.enabled;
      return;
    }
    if (data.type !== "playgrounds-dom-snapshot-request") return;
    var maxChars = typeof data.maxChars === "number" ? data.maxChars : 8000;
    if (maxChars < 256) maxChars = 256;
    if (maxChars > 50000) maxChars = 50000;
    var text = "";
    try {
      text = walkDom(document.body, 0) || "(empty body)";
    } catch (e) {
      parent.postMessage({
        type: "playgrounds-dom-snapshot-response",
        id: data.id,
        error: String(e && e.message ? e.message : e)
      }, "*");
      return;
    }
    var truncated = false;
    if (text.length > maxChars) {
      text = text.slice(0, maxChars) + "…[truncated]";
      truncated = true;
    }
    parent.postMessage({
      type: "playgrounds-dom-snapshot-response",
      id: data.id,
      text: text,
      truncated: truncated
    }, "*");
  });

  window.addEventListener("error", function (e) {
    parent.postMessage({ type: "playgrounds-preview-error", message: String(e.message || e.error || "error") }, "*");
    try { e.preventDefault(); } catch (_) { /* ignore */ }
  });
  window.addEventListener("unhandledrejection", function (e) {
    parent.postMessage({ type: "playgrounds-preview-error", message: String(e.reason) }, "*");
    try { e.preventDefault(); } catch (_) { /* ignore */ }
  });
  var _log = console.log.bind(console);
  var _err = console.error.bind(console);
  var _warn = console.warn.bind(console);
  var _info = console.info.bind(console);
  var _debug = console.debug.bind(console);
  var _table = console.table ? console.table.bind(console) : _log;
  var _dir = console.dir ? console.dir.bind(console) : _log;
  var _trace = console.trace ? console.trace.bind(console) : _log;
  var _group = console.group ? console.group.bind(console) : _log;
  var _groupCollapsed = console.groupCollapsed ? console.groupCollapsed.bind(console) : _group;
  var _groupEnd = console.groupEnd ? console.groupEnd.bind(console) : function () {};
  var _time = console.time ? console.time.bind(console) : function () {};
  var _timeEnd = console.timeEnd ? console.timeEnd.bind(console) : function () {};
  var _count = console.count ? console.count.bind(console) : function () {};
  var _clear = console.clear ? console.clear.bind(console) : function () {};
  function patchSilent(nativeFn) {
    return function () {
      if (wantMirror()) {
        try { nativeFn.apply(console, arguments); } catch (_) { /* ignore */ }
      }
    };
  }
  function patchGroup(kind, nativeFn) {
    return function () {
      var label = arguments.length ? Array.prototype.map.call(arguments, serializeArg).join(" ") : "";
      postConsole("info", [kind + (label ? (" " + label) : "")]);
      if (wantMirror()) {
        try { nativeFn.apply(console, arguments); } catch (_) { /* ignore */ }
      }
    };
  }
  // console.log → info (panel has no separate LOG filter)
  console.log = patchConsole("info", _log);
  console.info = patchConsole("info", _info);
  console.debug = patchConsole("debug", _debug);
  console.error = patchConsole("error", _err);
  console.warn = patchConsole("warn", _warn);
  console.table = patchConsole("info", _table);
  console.dir = patchConsole("info", _dir);
  console.trace = patchConsole("debug", _trace);
  console.group = patchGroup("▶", _group);
  console.groupCollapsed = patchGroup("▷", _groupCollapsed);
  console.groupEnd = patchSilent(_groupEnd);
  console.time = patchSilent(_time);
  console.timeEnd = patchConsole("info", _timeEnd);
  console.count = patchConsole("info", _count);
  console.clear = patchSilent(_clear);
  try {
    parent.postMessage({ type: "playgrounds-console-mirror-hello" }, "*");
  } catch (_) { /* ignore */ }
})();
</script>`;

/**
 * @param {string} html
 */
function injectBridge(html) {
  if (html.includes("data-playgrounds-bridge")) return html;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${BRIDGE}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${BRIDGE}</head>`);
  }
  return `${BRIDGE}${html}`;
}

/**
 * @returns {Promise<Client|null>}
 */
async function findShellClient() {
  const all = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of all) {
    try {
      const u = new URL(client.url);
      if (isPlaygroundsShellClientPath(u.pathname)) {
        return client;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * @param {Request} request
 */
async function serializeRequest(request) {
  /** @type {[string, string][]} */
  const headers = [];
  request.headers.forEach((value, key) => {
    headers.push([key, value]);
  });
  let body = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }
  return {
    method: request.method,
    url: request.url,
    headers,
    body,
  };
}

/**
 * @param {FetchEvent} event
 * @param {string} sandboxId
 */
async function handleApiRequest(event, sandboxId) {
  const noStore = { "Cache-Control": "no-store" };
  // /api does not require a canvas file snapshot: the shell resolves files by
  // sandboxId (work + agent dual pane). Do not gate on snapshots.get(sandboxId).

  const shell = await findShellClient();
  if (!shell) {
    // Quiet 200 (not 503): Agent openingContext can probe /api before the shell
    // client is visible to matchAll; DevTools "503" spam is worse than soft fail.
    return new Response(
      JSON.stringify({
        ready: false,
        code: "playgrounds_functions_no_shell",
        error: "playgrounds_functions_no_shell",
        message: "找不到遊樂場分頁；請保持遊樂場分頁開啟。",
      }),
      {
        status: 200,
        headers: {
          ...noStore,
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const serialized = await serializeRequest(event.request);
  const transfer = serialized.body ? [serialized.body] : [];
  const reqPath = (() => {
    try {
      return new URL(event.request.url).pathname;
    } catch {
      return "";
    }
  })();
  const isLlmApi = /\/api\/llm(?:\/|$)/u.test(reqPath);
  const timeoutMs = isLlmApi ? API_LLM_TIMEOUT_MS : API_TIMEOUT_MS;

  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(
        new Response(
          JSON.stringify({
            error: "playgrounds_functions_timeout",
            message: isLlmApi
              ? "LLM 請求逾時（functions 須等完整回應；請縮短回合或稍後再試）"
              : "functions 請求逾時",
          }),
          {
            status: 504,
            headers: {
              ...noStore,
              "Content-Type": "application/json; charset=utf-8",
            },
          }
        )
      );
    }, timeoutMs);

    channel.port1.onmessage = ev => {
      clearTimeout(timer);
      channel.port1.close();
      const data = ev.data;
      if (!data || typeof data !== "object") {
        resolve(
          new Response("Invalid functions result", {
            status: 500,
            headers: {
              ...noStore,
              "Content-Type": "text/plain; charset=utf-8",
            },
          })
        );
        return;
      }
      if (data.error && !data.response) {
        resolve(
          new Response(
            JSON.stringify({
              error: "playgrounds_functions_error",
              message: String(data.error),
            }),
            {
              status: 500,
              headers: {
                ...noStore,
                "Content-Type": "application/json; charset=utf-8",
              },
            }
          )
        );
        return;
      }
      const response = data.response;
      if (!response) {
        resolve(
          new Response("Empty functions response", {
            status: 500,
            headers: {
              ...noStore,
              "Content-Type": "text/plain; charset=utf-8",
            },
          })
        );
        return;
      }
      resolve(
        new Response(response.body, {
          status: response.status,
          statusText: response.statusText || "",
          headers: response.headers || [],
        })
      );
    };

    shell.postMessage(
      {
        type: API_TYPE,
        requestId,
        sandboxId,
        request: serialized,
      },
      [channel.port2, ...transfer]
    );
  });
}

/**
 * @param {URL} url
 */
async function handleCanvasRequest(url) {
  const noStore = { "Cache-Control": "no-store" };
  const parsed = parseCanvasUrlPath(url.pathname);
  if (!parsed) {
    return new Response("Not Found", {
      status: 404,
      headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const filePath = parsed.filePath || "index.html";

  const snapshot = snapshots.get(parsed.sandboxId);
  if (!snapshot) {
    // Quiet placeholder (not 503): refresh can re-hit canvas URLs before the
    // shell re-syncs OPFS snapshots. Shell will navigate again when ready.
    // Keep the marker string for assertCanvasEntryServed.
    return new Response(
      "<!doctype html><meta charset=utf-8><title></title>" +
        "<p>Canvas snapshot not ready</p>",
      {
        status: 200,
        headers: {
          ...noStore,
          "Content-Type": "text/html; charset=utf-8",
        },
      }
    );
  }

  const entry = snapshot.files[filePath];
  if (!entry) {
    return new Response(`Not Found: ${filePath}`, {
      status: 404,
      headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const mime = mimeForCanvasPath(filePath);
  if (entry.type === "text") {
    let body = String(entry.body);
    const headers = { ...noStore, "Content-Type": mime };
    if (mime.startsWith("text/html")) {
      body = injectBridge(body);
      headers["Content-Security-Policy"] =
        "base-uri 'self'; object-src 'none'; frame-ancestors 'self'";
    }
    return new Response(body, {
      status: 200,
      headers,
    });
  }

  return new Response(entry.body, {
    status: 200,
    headers: { ...noStore, "Content-Type": mime },
  });
}
