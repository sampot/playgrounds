/**
 * Dogfood Participant Agent: one reusable template (DEC-023).
 * Clone in the shell for more seats. Session role is a permission class
 * (default `participant`); persona / strategy live in the SAM itself.
 */

import type { FileMap } from "./projectTypes";
import {
  BRAINSTORM_PROTOCOL_API_VERSION,
  BRAINSTORM_PROTOCOL_ID,
} from "./sessionHostStarter";

export const SESSION_PARTICIPANT_STARTER_NAME = "腦力激盪參與者（規則）";
/** Default session permission role for brainstorm.v1 joins. */
export const SESSION_PARTICIPANT_DEFAULT_ROLE = "participant";

export function createSessionParticipantStarterFiles(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>腦力激盪參與者</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app">
      <header>
        <strong>參與者</strong>
        <span id="seat" class="muted">未入座</span>
      </header>
      <label class="row">自動回應
        <input id="auto" type="checkbox" checked />
      </label>
      <p id="log" class="log"></p>
    </div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
    "styles.css": `:root {
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  color: #14161a;
  background: #eef2f6;
  line-height: 1.4;
  font-size: 13px;
}
@media (prefers-color-scheme: dark) {
  :root { color: #e8ecf1; background: #12161c; }
}
.app { padding: 0.65rem; }
.muted { opacity: 0.7; margin-left: 0.5rem; }
.row { display: flex; gap: 0.5rem; align-items: center; margin: 0.5rem 0; }
.log { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 11px; opacity: 0.85; max-height: 12rem; overflow: auto; }
`,
    "app.js": `const PROTOCOL_ID = ${JSON.stringify(BRAINSTORM_PROTOCOL_ID)};
const PROTOCOL_API = ${JSON.stringify(BRAINSTORM_PROTOCOL_API_VERSION)};

const seatEl = document.getElementById("seat");
const logEl = document.getElementById("log");
const autoEl = document.getElementById("auto");

let channel = null;
let lastSeq = 0;
let myRole = ${JSON.stringify(SESSION_PARTICIPANT_DEFAULT_ROLE)};
let reacting = false;

function log(line) {
  logEl.textContent = (logEl.textContent + "\\n" + line).trim().slice(-2000);
}

async function api(path, init) {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ready === false) {
    const err = new Error(data.error || res.statusText || "request failed");
    err.code = data.code || "error";
    throw err;
  }
  return data;
}

function isRetryable(e) {
  return e && (e.code === "session_inactive" || e.code === "host_unavailable");
}

function ideaFromEvent(event) {
  const item = event && event.item;
  const text = (item && item.text) || "";
  if (!text) return null;
  // Only auto-reply to human to avoid agent↔agent loops in the dogfood demo.
  if (item.role !== "human") return null;
  return "延伸：" + text.slice(0, 80);
}

async function maybeReact(event) {
  if (!autoEl.checked || reacting) return;
  const text = ideaFromEvent(event);
  if (!text) return;
  reacting = true;
  try {
    await api("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "speak", text }),
    });
    log("act → " + text);
  } catch (e) {
    log("act 失敗：" + (e.message || e));
  } finally {
    reacting = false;
  }
}

async function boot(attempt = 0) {
  try {
    if (attempt) seatEl.textContent = "入座中…";
    const seat = await api("/api/session/seat");
    myRole = seat.role || myRole;
    seatEl.textContent = seat.role + " / " + seat.seatId;
    const ch = await api("/api/session/channel");
    const state = await api("/api/session/state");
    lastSeq = state.seq || 0;
    if (channel) {
      try { channel.close(); } catch (_) { /* ignore */ }
    }
    channel = new BroadcastChannel(ch.name);
    channel.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.type !== "session-event") return;
      if (typeof msg.seq === "number") {
        if (msg.seq <= lastSeq) return;
        if (msg.seq > lastSeq + 1) {
          log("seq 缺口 → getState");
          void api("/api/session/state").then((s) => {
            lastSeq = s.seq || lastSeq;
          });
        }
        lastSeq = msg.seq;
      }
      log("event #" + msg.seq);
      void maybeReact(msg.event);
    };
    log("listening " + ch.name + " role=" + myRole + " " + PROTOCOL_ID + "@" + PROTOCOL_API);
  } catch (e) {
    // Brief retry only for join race (background seat iframe). Opening this
    // SAM as a normal work project is idle — do not spam probes or console.
    if (isRetryable(e) && attempt < 8) {
      setTimeout(() => void boot(attempt + 1), 50 + attempt * 25);
      return;
    }
    seatEl.textContent = "未入座";
    if (!isRetryable(e)) log(String(e.message || e));
    else log("待機：由主持沙盒加入後才會連線");
  }
}

boot();
`,
    "controller.js": `/**
 * Participant Controller (DEC-031) — mailbox receives session.event;
 * UI still listens on BroadcastChannel for live updates.
 */
export default {
  async onStart(env) {
    if (env.KV && typeof env.KV.put === "function") {
      await env.KV.put("agent:mailbox:lastSessionSeq", "0");
    }
  },
  async onMessage(msg, env) {
    if (!msg || msg.type !== "session.event") return;
    const seq = Number(msg.payload?.seq) || 0;
    const last = Number(
      (env.KV && (await env.KV.get("agent:mailbox:lastSessionSeq"))) || "0"
    );
    if (seq > 0 && seq <= last) return;
    if (env.KV && seq > 0) {
      await env.KV.put("agent:mailbox:lastSessionSeq", String(seq));
      await env.KV.put(
        "agent:mailbox:lastSessionEvent",
        JSON.stringify({ seq, event: msg.payload?.event ?? null, at: Date.now() })
      );
    }
  },
  async onCommand(command, env) {
    if (command?.type === "last_session_event" && env.KV) {
      const raw = await env.KV.get("agent:mailbox:lastSessionEvent");
      return raw ? JSON.parse(raw) : null;
    }
    return { ok: false, code: "unknown_command" };
  },
};
`,
    "functions.js": `function requireSession(env) {
  if (!env?.SESSION) {
    const err = new Error("env.SESSION 不可用（需先入座）");
    err.code = "session_inactive";
    throw err;
  }
  return env.SESSION;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function err(e, status = 400) {
  const code = e?.code || "error";
  return json({ error: e?.message || String(e), code }, status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\\/+$/, "") || "/";
    const isProbe =
      request.method === "GET" &&
      (path.endsWith("/api/session/seat") ||
        path.endsWith("/api/session/channel") ||
        path.endsWith("/api/session/state"));
    try {
      const SESSION = requireSession(env);
      if (path.endsWith("/api/session/seat") && request.method === "GET") {
        return json(await SESSION.getSeat());
      }
      if (path.endsWith("/api/session/channel") && request.method === "GET") {
        return json(await SESSION.getEventChannel());
      }
      if (path.endsWith("/api/session/state") && request.method === "GET") {
        return json(await SESSION.getState());
      }
      if (path.endsWith("/api/session/meta") && request.method === "GET") {
        return json({
          protocolId: ${JSON.stringify(BRAINSTORM_PROTOCOL_ID)},
          apiVersion: ${JSON.stringify(BRAINSTORM_PROTOCOL_API_VERSION)},
        });
      }
      if (path.endsWith("/api/session/act") && request.method === "POST") {
        const body = await request.json();
        return json(await SESSION.act(body));
      }
      if (path.endsWith("/api/session/leave") && request.method === "POST") {
        return json(await SESSION.leave());
      }
      return err({ message: "找不到路由", code: "not_found" }, 404);
    } catch (e) {
      // Probes while idle (opened as work project, or pre-join): 200 + ready:false
      // so the browser console stays clean.
      if (e?.code === "session_inactive" && isProbe) {
        return json({
          ready: false,
          code: "session_inactive",
          error: e?.message || "未入座",
        });
      }
      const status = e?.code === "session_inactive" ? 409 : 400;
      return err(e, status);
    }
  },
};
`,
  };
}
