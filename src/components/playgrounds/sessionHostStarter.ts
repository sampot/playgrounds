/**
 * Dogfood Host SAM: realtime brainstorm (DEC-023). No turn lock, no LLM.
 * Protocol: brainstorm.v1
 *
 * Demonstrates Host-owned session product UX calling the shell channel API
 * (`/api/shell/session/*`). Domain naming stays here; the shell is transport only.
 *
 * Behavioral API logic for tests lives in brainstormSessionApi.ts; the OPFS
 * template functions.js must stay self-contained and KV-backed (same contract).
 */

import {
  BRAINSTORM_PROTOCOL_API_VERSION,
  BRAINSTORM_PROTOCOL_ID,
  BRAINSTORM_ROLE_LIMITS,
  BRAINSTORM_ROLES,
  BRAINSTORM_STATE_KEY,
} from "./brainstormSessionApi";
import type { FileMap } from "./projectTypes";

export const SESSION_HOST_STARTER_NAME = "腦力激盪（主持）";
export {
  BRAINSTORM_PROTOCOL_API_VERSION,
  BRAINSTORM_PROTOCOL_ID,
} from "./brainstormSessionApi";

export function createSessionHostStarterFiles(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>腦力激盪</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app">
      <header>
        <strong>腦力激盪</strong>
        <span id="meta" class="muted">尚未開始</span>
      </header>
      <div id="controls" class="controls">
        <button type="button" id="btn-open" class="primary">開始這一場</button>
        <button type="button" id="btn-spawn" class="secondary" disabled>加入一位參與者</button>
        <button type="button" id="btn-invite-roster" class="secondary" disabled>邀請對手入座</button>
        <button type="button" id="btn-pause" class="secondary" disabled>暫停</button>
        <button type="button" id="btn-close" class="secondary" disabled>結束</button>
      </div>
      <ul id="seats" class="seats" aria-label="參與者"></ul>
      <form id="form" class="row">
        <input id="text" type="text" placeholder="你的發言…" autocomplete="off" disabled />
        <button type="submit" class="primary" disabled>送出</button>
      </form>
      <p id="status" class="muted" role="status"></p>
      <ul id="list"></ul>
      <p class="hint muted">
        遊樂場只提供多人通道 API；這一場叫什麼、怎麼管理，由本主持沙盒決定。
      </p>
    </div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
    "styles.css": `:root {
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  color: #14161a;
  background: #f4f5f7;
  line-height: 1.45;
}
@media (prefers-color-scheme: dark) {
  :root { color: #e8ecf1; background: #0f1216; }
}
.app { max-width: 40rem; margin: 0 auto; padding: 1rem; }
header { display: flex; gap: 0.75rem; align-items: baseline; margin-bottom: 0.75rem; flex-wrap: wrap; }
.muted { opacity: 0.7; font-size: 0.875rem; }
.hint { margin-top: 1rem; font-size: 0.8rem; }
.controls { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.65rem; }
.row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
input { flex: 1; padding: 0.5rem 0.65rem; border: 1px solid #c5ccd4; border-radius: 6px; background: #fff; color: inherit; }
input:disabled { opacity: 0.55; }
@media (prefers-color-scheme: dark) {
  input { background: #171b21; border-color: #2a313a; }
}
button { border: 0; border-radius: 6px; padding: 0.45rem 0.75rem; cursor: pointer; font: inherit; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
.primary { background: #0f766e; color: #fff; }
.secondary { background: #e5e9ee; color: inherit; }
@media (prefers-color-scheme: dark) {
  .secondary { background: #1c232c; }
}
.seats { list-style: none; padding: 0; margin: 0 0 0.65rem; font-size: 0.8rem; opacity: 0.85; }
.seats li { display: flex; gap: 0.5rem; align-items: center; padding: 0.2rem 0; }
.seats button { padding: 0.15rem 0.45rem; font-size: 0.75rem; background: transparent; border: 1px solid #c5ccd4; }
@media (prefers-color-scheme: dark) {
  .seats button { border-color: #2a313a; }
}
ul#list { list-style: none; padding: 0; margin: 0; }
ul#list li { padding: 0.5rem 0; border-bottom: 1px solid #d8dde3; }
@media (prefers-color-scheme: dark) {
  ul#list li { border-color: #2a313a; }
}
.tag { font-size: 0.75rem; opacity: 0.65; margin-right: 0.35rem; }
`,
    "app.js": `const PROTOCOL_ID = ${JSON.stringify(BRAINSTORM_PROTOCOL_ID)};
const PROTOCOL_API = ${JSON.stringify(BRAINSTORM_PROTOCOL_API_VERSION)};

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const metaEl = document.getElementById("meta");
const seatsEl = document.getElementById("seats");
const form = document.getElementById("form");
const textEl = document.getElementById("text");
const btnOpen = document.getElementById("btn-open");
const btnSpawn = document.getElementById("btn-spawn");
const btnInviteRoster = document.getElementById("btn-invite-roster");
const btnPause = document.getElementById("btn-pause");
const btnClose = document.getElementById("btn-close");
const submitBtn = form.querySelector('button[type="submit"]');

let channel = null;
let lastSeq = 0;
let active = false;
let paused = false;

function setStatus(t) {
  statusEl.textContent = t || "";
}

async function shell(path, init) {
  const res = await fetch("/api/shell/session" + path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.code || res.statusText);
    err.code = data.code;
    throw err;
  }
  return data;
}

function renderItems(items) {
  listEl.innerHTML = "";
  for (const it of items || []) {
    const li = document.createElement("li");
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = it.role || "?";
    li.appendChild(tag);
    li.appendChild(document.createTextNode(it.text || ""));
    listEl.appendChild(li);
  }
}

function renderSeats(seats) {
  seatsEl.innerHTML = "";
  for (const seat of seats || []) {
    const li = document.createElement("li");
    const remote = seat.remote ? " · 遠端" : "";
    const label = (seat.kind === "human" ? "人類" : "參與者") + " · " + seat.role + remote;
    li.appendChild(document.createTextNode(label));
    if (seat.kind !== "human" && seat.seatId) {
      const leave = document.createElement("button");
      leave.type = "button";
      leave.textContent = "離開";
      leave.onclick = () => void onLeave(seat.seatId);
      li.appendChild(leave);
    }
    seatsEl.appendChild(li);
  }
}

function syncControls() {
  btnOpen.disabled = active;
  btnSpawn.disabled = !active || paused;
  btnInviteRoster.disabled = !active || paused;
  btnPause.disabled = !active;
  btnClose.disabled = !active;
  btnPause.textContent = paused ? "繼續" : "暫停";
  textEl.disabled = !active || paused;
  submitBtn.disabled = !active || paused;
  if (!active) {
    metaEl.textContent = "尚未開始";
  } else if (paused) {
    metaEl.textContent = "已暫停";
  } else {
    metaEl.textContent = "進行中 · " + PROTOCOL_ID;
  }
}

function bindChannel(channelName) {
  if (!channelName) return;
  if (channel) {
    try { channel.close(); } catch (_) { /* ignore */ }
  }
  channel = new BroadcastChannel(channelName);
  channel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.type !== "session-event") return;
    if (typeof msg.seq === "number" && msg.seq <= lastSeq) return;
    lastSeq = msg.seq || lastSeq;
    void loadDomainState().catch((e) => setStatus(String(e.message || e)));
    void refreshStatus().catch(() => {});
  };
}

async function loadDomainState() {
  const res = await fetch("/api/session/state?role=human");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  renderItems(data.items);
  if (data.channelName) bindChannel(data.channelName);
  if (typeof data.seq === "number") lastSeq = Math.max(lastSeq, data.seq);
}

async function refreshStatus() {
  const data = await shell("/status");
  active = !!data.active;
  paused = data.status === "paused";
  renderSeats(data.seats || []);
  if (data.channelName) bindChannel(data.channelName);
  syncControls();
  return data;
}

async function onOpen() {
  setStatus("開啟通道…");
  try {
    const opened = await shell("/open", { method: "POST" });
    lastSeq = 0;
    bindChannel(opened.channelName);
    await loadDomainState();
    await refreshStatus();
    setStatus("這一場已開始；可加入參與者或發言");
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

async function onClose() {
  setStatus("結束中…");
  try {
    await shell("/close", { method: "POST" });
    if (channel) {
      try { channel.close(); } catch (_) { /* ignore */ }
      channel = null;
    }
    renderItems([]);
    await refreshStatus();
    setStatus("已結束");
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

async function onPauseToggle() {
  try {
    if (paused) await shell("/resume", { method: "POST" });
    else await shell("/pause", { method: "POST" });
    await refreshStatus();
    setStatus(paused ? "已暫停" : "已繼續");
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

async function onSpawn() {
  setStatus("建立並加入參與者…");
  try {
    const spawned = await shell("/spawn-participant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "participant" }),
    });
    await refreshStatus();
    setStatus("已加入「" + spawned.name + "」");
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

async function onInviteRoster() {
  setStatus("邀請對手入座…");
  try {
    const invited = await shell("/invite-roster", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "participant" }),
    });
    setStatus("已送出邀請（" + invited.protocolId + "）— 等待對方接受");
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

async function onLeave(seatId) {
  try {
    await shell("/leave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatId }),
    });
    await refreshStatus();
    setStatus("已請離座位");
  } catch (e) {
    setStatus(String(e.message || e));
  }
}

btnOpen.addEventListener("click", () => void onOpen());
btnClose.addEventListener("click", () => void onClose());
btnPause.addEventListener("click", () => void onPauseToggle());
btnSpawn.addEventListener("click", () => void onSpawn());
btnInviteRoster.addEventListener("click", () => void onInviteRoster());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textEl.value.trim();
  if (!text) return;
  setStatus("送出中…");
  try {
    const res = await fetch("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seatId: "human-ui",
        role: "human",
        payload: { type: "speak", text },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.code || res.statusText);
    textEl.value = "";
    if (data.channelName && data.events?.length) {
      const ch = channel || new BroadcastChannel(data.channelName);
      channel = ch;
      const useSeq = typeof data.seq === "number" ? data.seq : lastSeq + 1;
      for (const event of data.events) {
        ch.postMessage({
          type: "session-event",
          sessionId: data.sessionId,
          seq: useSeq,
          event,
        });
      }
      lastSeq = Math.max(lastSeq, useSeq);
    }
    await loadDomainState();
    setStatus("已送出");
  } catch (err) {
    setStatus(String(err.message || err));
  }
});

refreshStatus()
  .then((s) => {
    if (s.active) return loadDomainState();
  })
  .catch((e) => setStatus(String(e.message || e)));
`,
    "functions.js": `const PROTOCOL_ID = ${JSON.stringify(BRAINSTORM_PROTOCOL_ID)};
const PROTOCOL_API = ${JSON.stringify(BRAINSTORM_PROTOCOL_API_VERSION)};
const ROLES = ${JSON.stringify([...BRAINSTORM_ROLES])};
const ROLE_LIMITS = ${JSON.stringify(BRAINSTORM_ROLE_LIMITS)};
const STATE_KEY = ${JSON.stringify(BRAINSTORM_STATE_KEY)};

/**
 * Persist session state in Durable KV so shell-forwarded calls and the
 * work-canvas /api path share one store (separate functions.js module loads).
 */
async function loadStore(env) {
  const raw = await env.KV.get(STATE_KEY, "text");
  if (!raw) {
    return { sessionId: null, channelName: null, seq: 0, items: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      sessionId: parsed.sessionId || null,
      channelName: parsed.channelName || null,
      seq: Number(parsed.seq) || 0,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { sessionId: null, channelName: null, seq: 0, items: [] };
  }
}

async function saveStore(env, store) {
  await env.KV.put(STATE_KEY, JSON.stringify(store));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function err(code, error, status = 400) {
  return json({ error, code }, status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\\/+$/, "") || "/";

    if (path.endsWith("/api/session/meta") && request.method === "GET") {
      return json({
        protocolId: PROTOCOL_ID,
        apiVersion: PROTOCOL_API,
        roles: ROLES,
        roleLimits: ROLE_LIMITS,
      });
    }

    if (path.endsWith("/api/session/open") && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const store = {
        sessionId: String(body.sessionId || ""),
        channelName: String(body.channelName || ""),
        seq: 0,
        items: [],
      };
      await saveStore(env, store);
      return json({
        ok: true,
        sessionId: store.sessionId,
        channelName: store.channelName,
      });
    }

    if (path.endsWith("/api/session/state") && request.method === "GET") {
      const store = await loadStore(env);
      return json({
        items: store.items,
        seq: store.seq,
        sessionId: store.sessionId,
        channelName: store.channelName,
        protocolId: PROTOCOL_ID,
        apiVersion: PROTOCOL_API,
      });
    }

    if (path.endsWith("/api/session/act") && request.method === "POST") {
      const store = await loadStore(env);
      if (!store.sessionId) {
        return err("session_inactive", "通道尚未開啟（請先開始這一場）", 409);
      }
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return err("act_rejected", "無效 body");
      }
      const role = String(body.role || "");
      if (!ROLES.includes(role)) {
        return err("role_forbidden", "role 不允許");
      }
      const payload = body.payload || {};
      const text = String(payload.text || "").trim();
      if (!text) {
        return err("act_rejected", "需要 payload.text");
      }
      if (text.length > 500) {
        return err("act_rejected", "文字過長");
      }
      const item = {
        id: "i-" + Math.random().toString(36).slice(2, 9),
        role,
        text,
      };
      store.items.push(item);
      store.seq += 1;
      await saveStore(env, store);
      const event = { type: "item_added", item, seq: store.seq };
      return json({
        ok: true,
        events: [event],
        state: { items: store.items, seq: store.seq },
        seq: store.seq,
        sessionId: store.sessionId,
        channelName: store.channelName,
      });
    }

    return err("not_found", "找不到路由", 404);
  },
};
`,
  };
}
