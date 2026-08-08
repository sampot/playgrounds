/**
 * SW-less canvas for in-app browsers (LINE scanner / WKWebView).
 * Uses composePreview srcdoc + postMessage session API bridge.
 */

import {
  composePreview,
  revokePreviewBlobs,
} from "@pg/composePreview";
import type { FileMap } from "@pg/projectTypes";
import { handleGoSessionApi } from "./goCanvas";

export const GO_MEMORY_SESSION_TYPE = "playgrounds-go-memory-session" as const;
export const GO_MEMORY_SESSION_RESULT = "playgrounds-go-memory-session-result" as const;
export const GO_MEMORY_BC_TYPE = "playgrounds-go-memory-bc" as const;

const SESSION_BRIDGE = `<script data-go-memory-session>
(function () {
  var MSG = ${JSON.stringify(GO_MEMORY_SESSION_TYPE)};
  var RES = ${JSON.stringify(GO_MEMORY_SESSION_RESULT)};
  var BC = ${JSON.stringify(GO_MEMORY_BC_TYPE)};
  var _fetch = window.fetch.bind(window);
  function isSessionPath(u) {
    try {
      var s = typeof u === "string" ? u : (u && u.url) ? String(u.url) : "";
      return s.indexOf("/api/session") !== -1;
    } catch (_) { return false; }
  }
  window.fetch = function (input, init) {
    if (!isSessionPath(input)) return _fetch(input, init);
    var method = (init && init.method) || (input && input.method) || "GET";
    var url = typeof input === "string" ? input : String(input.url || "");
    var bodyPromise = Promise.resolve(null);
    if (method !== "GET" && method !== "HEAD" && init && init.body != null) {
      if (typeof init.body === "string") {
        bodyPromise = Promise.resolve(new TextEncoder().encode(init.body).buffer);
      } else if (init.body instanceof ArrayBuffer) {
        bodyPromise = Promise.resolve(init.body);
      } else if (typeof init.body.arrayBuffer === "function") {
        bodyPromise = init.body.arrayBuffer();
      }
    }
    var requestId = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
    return bodyPromise.then(function (bodyBuf) {
      return new Promise(function (resolve, reject) {
        function onMsg(ev) {
          var data = ev.data;
          if (!data || data.type !== RES || data.requestId !== requestId) return;
          window.removeEventListener("message", onMsg);
          if (data.error) {
            reject(new Error(data.error));
            return;
          }
          var r = data.response || {};
          var headers = new Headers();
          (r.headers || []).forEach(function (pair) {
            if (pair && pair.length >= 2) headers.set(pair[0], pair[1]);
          });
          resolve(new Response(r.body || null, {
            status: r.status || 200,
            statusText: r.statusText || "",
            headers: headers
          }));
        }
        window.addEventListener("message", onMsg);
        parent.postMessage({
          type: MSG,
          requestId: requestId,
          request: {
            method: String(method).toUpperCase(),
            url: url,
            body: bodyBuf
          }
        }, "*");
        setTimeout(function () {
          window.removeEventListener("message", onMsg);
          reject(new Error("session_api_timeout"));
        }, 30000);
      });
    });
  };
  // srcdoc opaque origin cannot share BroadcastChannel with the shell.
  window.BroadcastChannel = function (name) {
    var channelName = String(name || "");
    var handlers = [];
    function onParent(ev) {
      var data = ev.data;
      if (!data || data.type !== BC || data.name !== channelName) return;
      var msg = { data: data.payload };
      handlers.forEach(function (h) {
        try { h(msg); } catch (_) { /* ignore */ }
      });
      if (typeof channel.onmessage === "function") {
        try { channel.onmessage(msg); } catch (_) { /* ignore */ }
      }
    }
    window.addEventListener("message", onParent);
    var channel = {
      name: channelName,
      onmessage: null,
      postMessage: function () { /* session events are host → guest only */ },
      close: function () {
        window.removeEventListener("message", onParent);
        handlers = [];
      },
      addEventListener: function (type, fn) {
        if (type === "message" && typeof fn === "function") handlers.push(fn);
      },
      removeEventListener: function (type, fn) {
        if (type !== "message") return;
        handlers = handlers.filter(function (h) { return h !== fn; });
      }
    };
    return channel;
  };
})();
</script>`;

let memoryCanvasWindow: Window | null = null;

export function setGoMemoryCanvasWindow(win: Window | null): void {
  memoryCanvasWindow = win;
}

/** Fan out Host session events into the memory iframe (BroadcastChannel shim). */
export function publishGoMemoryBroadcast(
  channelName: string,
  payload: unknown
): void {
  try {
    memoryCanvasWindow?.postMessage(
      {
        type: GO_MEMORY_BC_TYPE,
        name: channelName,
        payload,
      },
      "*"
    );
  } catch {
    /* ignore */
  }
}

export type MemoryCanvasBuild = {
  srcdoc: string;
  blobUrls: string[];
  generation: number;
};

export function buildGoMemoryCanvas(
  files: FileMap,
  generation: number
): MemoryCanvasBuild {
  const { srcdoc: base, blobUrls } = composePreview(files, "index.html");
  let srcdoc = base;
  if (/<head[\s>]/iu.test(srcdoc)) {
    srcdoc = srcdoc.replace(/<head([^>]*)>/iu, `<head$1>${SESSION_BRIDGE}`);
  } else {
    srcdoc = `${SESSION_BRIDGE}${srcdoc}`;
  }
  // Bust iframe remounts when generation changes.
  srcdoc = srcdoc.replace(
    /<html([^>]*)>/iu,
    `<html$1 data-go-gen="${generation}">`
  );
  return { srcdoc, blobUrls, generation };
}

export function installGoMemorySessionListener(
  getSandboxId: () => string | null
): () => void {
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as
      | {
          type?: string;
          requestId?: string;
          request?: {
            method: string;
            url: string;
            body: ArrayBuffer | null;
          };
        }
      | undefined;
    if (!data || data.type !== GO_MEMORY_SESSION_TYPE) return;
    const source = ev.source as Window | null;
    if (!source || typeof data.requestId !== "string" || !data.request) return;
    const sandboxId = getSandboxId();
    void (async () => {
      try {
        if (!sandboxId) {
          source.postMessage(
            {
              type: GO_MEMORY_SESSION_RESULT,
              requestId: data.requestId,
              response: {
                status: 200,
                statusText: "",
                headers: [["Content-Type", "application/json; charset=utf-8"]],
                body: new TextEncoder().encode(
                  JSON.stringify({
                    ready: false,
                    code: "session_inactive",
                    error: "未入座",
                  })
                ).buffer,
              },
            },
            "*"
          );
          return;
        }
        if (!data.request) return;
        const response = await handleGoSessionApi(sandboxId, data.request);
        source.postMessage(
          {
            type: GO_MEMORY_SESSION_RESULT,
            requestId: data.requestId,
            response,
          },
          "*"
        );
      } catch (e) {
        source.postMessage(
          {
            type: GO_MEMORY_SESSION_RESULT,
            requestId: data.requestId,
            error: e instanceof Error ? e.message : String(e),
          },
          "*"
        );
      }
    })();
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

export function revokeGoMemoryBlobs(blobUrls: string[]): void {
  revokePreviewBlobs(blobUrls);
}
