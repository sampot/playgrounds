/**
 * Minimal canvas SW for go-client (DEC-050).
 * Serves /canvas/<sandboxId>/* from memory sync; /api/* → parent shell MessagePort.
 *
 * Must stay aligned with field public/sw.js for:
 * - HTML canvas-bridge (rewrite fetch("/api/…") → canvas-relative)
 * - forwarding API to the shell client (not the iframe)
 */
const GO_SW_REV = 2;
const CANVAS_PREFIX = "/canvas/";
const SYNC_TYPE = "playgrounds-canvas-sync";
const SYNC_ACK = "playgrounds-canvas-sync-ack";
const API_TYPE = "playgrounds-canvas-api";
const API_RESULT = "playgrounds-canvas-api-result";

/** @type {Map<string, { generation: number, files: Record<string, {type:string, body:string|ArrayBuffer}> }>} */
const snapshots = new Map();

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", event => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
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
    return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
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

async function findShellClient() {
  const all = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of all) {
    try {
      const u = new URL(client.url);
      if (isGoShellClientPath(u.pathname)) return client;
    } catch {
      /* ignore */
    }
  }
  return null;
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
  const client = await findShellClient();
  if (!client) {
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
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(
        new Response(JSON.stringify({ error: "api_timeout" }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        })
      );
    }, 30000);
    channel.port1.onmessage = ev => {
      clearTimeout(timer);
      channel.port1.close();
      const msg = ev.data;
      if (!msg || msg.type !== API_RESULT || msg.requestId !== requestId) {
        resolve(
          new Response(JSON.stringify({ error: "bad_api_result" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          })
        );
        return;
      }
      if (msg.error) {
        resolve(
          new Response(JSON.stringify({ error: msg.error }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        );
        return;
      }
      const r = msg.response;
      resolve(
        new Response(r.body, {
          status: r.status,
          statusText: r.statusText || "",
          headers: r.headers || [
            ["Content-Type", "application/json; charset=utf-8"],
          ],
        })
      );
    };
    client.postMessage(
      {
        type: API_TYPE,
        requestId,
        sandboxId,
        request: {
          method: request.method,
          url: request.url,
          headers,
          body: bodyBuf,
        },
      },
      [channel.port2]
    );
  });
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const parsed = parseCanvas(url.pathname);
  if (!parsed) return;

  event.respondWith(
    (async () => {
      if (parsed.filePath === "api" || parsed.filePath.startsWith("api/")) {
        return forwardApi(parsed.sandboxId, event.request);
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
    })()
  );
});

void GO_SW_REV;
