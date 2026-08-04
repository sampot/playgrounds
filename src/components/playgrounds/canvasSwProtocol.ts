/**
 * Playgrounds canvas Service Worker protocol (DEC-016).
 * Shared by the shell client and unit tests; keep `public/sw.js` canvas section in sync.
 */

import { normalizeProjectPath } from "./pathUtils";
import {
  PLAYGROUNDS_CANVAS_PREFIXES,
  isPlaygroundsCanvasPathname,
  isPlaygroundsShellPathname,
  playgroundsCanvasPrefix,
  playgroundsHomePath,
} from "./playgroundsPaths";
import { isTextContent, type FileContent, type FileMap } from "./projectTypes";

/** Single site SW (canvas virtual origin + Playgrounds offline cache). */
export const CANVAS_SW_SCRIPT = "/sw.js";
/** Root scope so one SW controls shell, canvas iframes, and offline fallback. */
export const CANVAS_SCOPE = "/";
export const CANVAS_SYNC_TYPE = "playgrounds-canvas-sync";
/**
 * Active canvas prefix (DEC-041: blog `/playgrounds/canvas/`, standalone `/canvas/`).
 * Prefer `playgroundsCanvasPrefix()`; this alias tracks the path config.
 */
export function getCanvasPrefix(): string {
  return playgroundsCanvasPrefix();
}
/** @deprecated Use getCanvasPrefix() / playgroundsCanvasPrefix() — value follows path config. */
export const CANVAS_PREFIX = "/playgrounds/canvas/";
export const CANVAS_SYNC_ACK_TYPE = "playgrounds-canvas-sync-ack";
export const CANVAS_API_TYPE = "playgrounds-canvas-api";
export const CANVAS_API_RESULT_TYPE = "playgrounds-canvas-api-result";

export const FUNCTIONS_ENTRY = "functions.js";
export const FUNCTIONS_UNAVAILABLE_ERROR = "playgrounds_functions_unavailable";
/** Shell has no file map yet (boot / HMR race). Prefer HTTP 200 so DevTools stays quiet. */
export const PROJECT_NOT_READY_ERROR = "project_not_ready";
/** SW could not find the /playgrounds/ shell tab. Prefer HTTP 200 (same quiet pattern). */
export const FUNCTIONS_NO_SHELL_ERROR = "playgrounds_functions_no_shell";
/** Follower could not reach a Leader to run functions.js. Prefer HTTP 200. */
export const FUNCTIONS_NO_LEADER_ERROR = "playgrounds_functions_no_leader";

export const CANVAS_API_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export type SyncFileEntry =
  { type: "text"; body: string } | { type: "bytes"; body: ArrayBuffer };

export interface CanvasSyncMessage {
  type: typeof CANVAS_SYNC_TYPE;
  sandboxId: string;
  generation: number;
  files: Record<string, SyncFileEntry>;
}

export interface CanvasSyncAckMessage {
  type: typeof CANVAS_SYNC_ACK_TYPE;
  sandboxId: string;
  generation: number;
}

/** Serialized Fetch API Request for SW ↔ shell. */
export interface SerializedRequest {
  method: string;
  url: string;
  headers: [string, string][];
  body: ArrayBuffer | null;
}

/** Serialized Fetch API Response for shell ↔ SW. */
export interface SerializedResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: ArrayBuffer | null;
}

export interface CanvasApiMessage {
  type: typeof CANVAS_API_TYPE;
  requestId: string;
  sandboxId: string;
  request: SerializedRequest;
}

export interface CanvasApiResultMessage {
  type: typeof CANVAS_API_RESULT_TYPE;
  requestId: string;
  response?: SerializedResponse;
  error?: string;
}

export function isCanvasPathname(pathname: string): boolean {
  return isPlaygroundsCanvasPathname(pathname);
}

/** Offline shell SW must not treat canvas URLs as cacheable documents. */
export function isPlaygroundsShellPath(pathname: string): boolean {
  return isPlaygroundsShellPathname(pathname);
}

export function mimeForCanvasPath(path: string): string {
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

export function isCanvasApiPath(filePath: string): boolean {
  return filePath === "api" || filePath.startsWith("api/");
}

/**
 * Parse `/playgrounds/canvas/<id>/…` or `/canvas/<id>/…` into sandbox id + file path.
 * Empty file path means project root (caller may default to index.html).
 */
export function parseCanvasUrlPath(
  pathname: string
): { sandboxId: string; filePath: string } | null {
  let rest: string | null = null;
  for (const prefix of PLAYGROUNDS_CANVAS_PREFIXES) {
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
  let sandboxId: string;
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

export function resolveCanvasFilePath(filePath: string): string {
  return filePath || "index.html";
}

export function fileContentToSyncEntry(content: FileContent): SyncFileEntry {
  if (isTextContent(content)) {
    return { type: "text", body: content };
  }
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return { type: "bytes", body: copy.buffer };
}

export function fileMapToSyncFiles(
  files: FileMap
): Record<string, SyncFileEntry> {
  const out: Record<string, SyncFileEntry> = {};
  for (const [path, content] of Object.entries(files)) {
    const norm = normalizeProjectPath(path);
    out[norm] = fileContentToSyncEntry(content);
  }
  return out;
}

export function syncFilesTransferables(
  files: Record<string, SyncFileEntry>
): Transferable[] {
  const list: Transferable[] = [];
  for (const entry of Object.values(files)) {
    if (entry.type === "bytes") list.push(entry.body);
  }
  return list;
}

export function buildCanvasSyncMessage(
  sandboxId: string,
  generation: number,
  files: FileMap
): CanvasSyncMessage {
  return {
    type: CANVAS_SYNC_TYPE,
    sandboxId,
    generation,
    files: fileMapToSyncFiles(files),
  };
}

export function buildCanvasEntryUrl(
  sandboxId: string,
  generation: number,
  entry = "index.html"
): string {
  const id = encodeURIComponent(sandboxId);
  const file = entry
    .split("/")
    .map(p => encodeURIComponent(p))
    .join("/");
  return `${playgroundsCanvasPrefix()}${id}/${file}?v=${generation}`;
}

export function functionsUnavailableBody(): string {
  return JSON.stringify({
    error: FUNCTIONS_UNAVAILABLE_ERROR,
    message:
      "找不到 functions.js（Workers 形 fetch handler）；純靜態專案可忽略 /api。",
  });
}

/** Expected idle / race — HTTP 200 so Chrome does not log "Failed to load resource". */
export function projectNotReadyBody(): string {
  return JSON.stringify({
    ready: false,
    code: PROJECT_NOT_READY_ERROR,
    error: "沙盒檔案尚未就緒（請稍候或重新載入 Agent）",
  });
}

export function functionsNoShellBody(): string {
  return JSON.stringify({
    ready: false,
    code: FUNCTIONS_NO_SHELL_ERROR,
    error: "playgrounds_functions_no_shell",
    message: `找不到遊樂場分頁；請保持 ${playgroundsHomePath()} 分頁開啟。`,
  });
}

export function functionsNoLeaderBody(): string {
  return JSON.stringify({
    ready: false,
    code: FUNCTIONS_NO_LEADER_ERROR,
    error: FUNCTIONS_NO_LEADER_ERROR,
    message: "尚無 Leader 可執行 functions.js；請稍候或保持遊樂場分頁開啟。",
  });
}

export function functionsErrorBody(message: string): string {
  return JSON.stringify({
    error: "playgrounds_functions_error",
    message,
  });
}

export async function serializeRequest(
  request: Request
): Promise<SerializedRequest> {
  const headers: [string, string][] = [];
  request.headers.forEach((value, key) => {
    headers.push([key, value]);
  });
  let body: ArrayBuffer | null = null;
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

export function deserializeRequest(data: SerializedRequest): Request {
  const init: RequestInit = {
    method: data.method,
    headers: data.headers,
  };
  if (data.body && data.method !== "GET" && data.method !== "HEAD") {
    init.body = data.body;
  }
  return new Request(data.url, init);
}

export async function serializeResponse(
  response: Response
): Promise<SerializedResponse> {
  const headers: [string, string][] = [];
  response.headers.forEach((value, key) => {
    headers.push([key, value]);
  });
  const body = await response.arrayBuffer();
  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    body: body.byteLength ? body : null,
  };
}

export function deserializeResponse(data: SerializedResponse): Response {
  return new Response(data.body, {
    status: data.status,
    statusText: data.statusText,
    headers: data.headers,
  });
}

export function serializedResponseTransferables(
  response: SerializedResponse
): Transferable[] {
  return response.body ? [response.body] : [];
}

/** Injected into HTML so the shell console panel still receives logs/errors,
 * `fetch("/api/…")` resolves under the canvas project path, same-origin fetch
 * is summarized for HOST.getNetworkLog, and DOM snapshots can be requested. */
export const CANVAS_BRIDGE_SCRIPT = `<script data-playgrounds-bridge>
(function () {
  /* canvas-bridge-rev:9 */
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

export function injectCanvasBridge(html: string): string {
  if (html.includes("data-playgrounds-bridge")) return html;
  if (/<head[\s>]/iu.test(html)) {
    return html.replace(/<head([^>]*)>/iu, `<head$1>${CANVAS_BRIDGE_SCRIPT}`);
  }
  if (/<html[\s>]/iu.test(html)) {
    return html.replace(
      /<html([^>]*)>/iu,
      `<html$1><head>${CANVAS_BRIDGE_SCRIPT}</head>`
    );
  }
  return `${CANVAS_BRIDGE_SCRIPT}${html}`;
}

export function isCanvasServiceWorkerRegistration(
  reg: ServiceWorkerRegistration
): boolean {
  const script =
    reg.active?.scriptURL ||
    reg.installing?.scriptURL ||
    reg.waiting?.scriptURL ||
    "";
  try {
    const path = new URL(script).pathname;
    // Prefer unified /sw.js; tolerate legacy sw-canvas.js during migration.
    return path === "/sw.js" || path.endsWith("/sw-canvas.js");
  } catch {
    return script.includes("sw-canvas.js");
  }
}
