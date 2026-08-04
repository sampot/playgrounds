/**
 * Dogfood Host SAM for coding-orchestration.v1 (DEC-033). No LLM.
 * UI: open channel → spawn worker → assign task → show applied files.
 */

import type { FileMap } from "./projectTypes";
import {
  CODING_ORCH_CAPABILITIES,
  CODING_ORCH_DEMO_PATH,
  CODING_ORCH_JOIN_POLICY,
  CODING_ORCH_PROTOCOL_API_VERSION,
  CODING_ORCH_PROTOCOL_ID,
  CODING_ORCH_ROLE_LIMITS,
  CODING_ORCH_ROLES,
  CODING_ORCH_STATE_KEY,
} from "./codingOrchestrationApi";

export const CODING_ORCH_HOST_STARTER_NAME = "Coding 編排（主持）";
export {
  CODING_ORCH_PROTOCOL_API_VERSION,
  CODING_ORCH_PROTOCOL_ID,
} from "./codingOrchestrationApi";

const DEMO_JS = `export function add(a, b) {
  return a + b + 1; // bug: off-by-one
}
`;

export function createCodingOrchestrationHostStarterFiles(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Coding 編排</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app">
      <header>
        <strong>Coding 編排</strong>
        <span id="meta" class="muted">尚未開始</span>
      </header>
      <p class="hint muted">invite_only · coding-orchestration.v1 · worker 可 BYOK</p>
      <div id="controls" class="controls">
        <button type="button" id="btn-open" class="primary">開始編排</button>
        <button type="button" id="btn-spawn" class="secondary" disabled>邀請 worker</button>
        <button type="button" id="btn-assign" class="secondary" disabled>指派任務</button>
        <button type="button" id="btn-close" class="secondary" disabled>結束</button>
      </div>
      <ul id="seats" class="seats" aria-label="座位"></ul>
      <pre id="demo" class="demo"></pre>
      <p id="status" class="muted" role="status"></p>
      <ul id="log"></ul>
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
.app { max-width: 42rem; margin: 0 auto; padding: 1rem; }
header { display: flex; gap: 0.75rem; align-items: baseline; flex-wrap: wrap; }
.muted { opacity: 0.7; font-size: 0.875rem; }
.hint { margin: 0.35rem 0 0.75rem; font-size: 0.8rem; }
.controls { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.65rem; }
button { border: 0; border-radius: 6px; padding: 0.45rem 0.75rem; cursor: pointer; font: inherit; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
.primary { background: #0f766e; color: #fff; }
.secondary { background: #e5e9ee; color: inherit; }
@media (prefers-color-scheme: dark) {
  .secondary { background: #1c232c; }
}
.seats { list-style: none; padding: 0; margin: 0 0 0.65rem; font-size: 0.8rem; }
.demo {
  font-size: 0.75rem;
  padding: 0.65rem;
  border-radius: 6px;
  background: #e8ecf1;
  overflow: auto;
  max-height: 10rem;
}
@media (prefers-color-scheme: dark) {
  .demo { background: #171b21; }
}
ul#log { list-style: none; padding: 0; margin: 0.75rem 0 0; font-size: 0.8rem; }
ul#log li { padding: 0.35rem 0; border-bottom: 1px solid #d8dde3; }
@media (prefers-color-scheme: dark) {
  ul#log li { border-color: #2a313a; }
}
`,
    [CODING_ORCH_DEMO_PATH]: DEMO_JS,
    "app.js": `const PROTOCOL_ID = ${JSON.stringify(CODING_ORCH_PROTOCOL_ID)};
const PROTOCOL_API = ${JSON.stringify(CODING_ORCH_PROTOCOL_API_VERSION)};
const DEMO_PATH = ${JSON.stringify(CODING_ORCH_DEMO_PATH)};

const metaEl = document.getElementById("meta");
const statusEl = document.getElementById("status");
const seatsEl = document.getElementById("seats");
const logEl = document.getElementById("log");
const demoEl = document.getElementById("demo");
const btnOpen = document.getElementById("btn-open");
const btnSpawn = document.getElementById("btn-spawn");
const btnAssign = document.getElementById("btn-assign");
const btnClose = document.getElementById("btn-close");

let channel = null;
let lastWorkerSeatId = null;

function setStatus(t) {
  statusEl.textContent = t || "";
}

function shell(path, init) {
  return fetch("/api/shell/session" + path, {
    method: (init && init.method) || "GET",
    headers: { "content-type": "application/json", ...(init && init.headers) },
    body: init && init.body,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.code = data.code;
      throw err;
    }
    return data;
  });
}

function domain(path, init) {
  return fetch(path, init).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.code = data.code;
      throw err;
    }
    return data;
  });
}

function pushLog(line) {
  const li = document.createElement("li");
  li.textContent = line;
  logEl.prepend(li);
}

function renderSeats(seats) {
  seatsEl.innerHTML = "";
  for (const s of seats || []) {
    const li = document.createElement("li");
    li.textContent = (s.role || "?") + " · " + (s.kind || "") + " · " + String(s.sandboxId || s.seatId || "").slice(0, 10);
    seatsEl.appendChild(li);
  }
}

async function refreshDemo() {
  const st = await domain("/api/session/state").catch(() => null);
  if (st && st.files && st.files[DEMO_PATH] != null) {
    demoEl.textContent = st.files[DEMO_PATH];
  }
}

async function refreshStatus() {
  const s = await shell("/status");
  if (!s.active) {
    metaEl.textContent = "尚未開始";
    btnOpen.disabled = false;
    btnSpawn.disabled = true;
    btnAssign.disabled = true;
    btnClose.disabled = true;
    renderSeats([]);
    return s;
  }
  metaEl.textContent = "進行中 · " + PROTOCOL_ID + " · " + (s.protocol && s.protocol.joinPolicy || "");
  btnOpen.disabled = true;
  btnSpawn.disabled = false;
  btnAssign.disabled = !lastWorkerSeatId;
  btnClose.disabled = false;
  renderSeats(s.seats);
  return s;
}

function listenChannel(name) {
  if (channel) {
    try { channel.close(); } catch (_) {}
  }
  channel = new BroadcastChannel(name);
  channel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.type !== "session-event") return;
    const t = msg.event && msg.event.type;
    pushLog((t || "event") + " #" + msg.seq);
    if (t === "task.result" || t === "orchestration.completed") {
      void refreshDemo();
    }
    void refreshStatus();
  };
}

btnOpen.addEventListener("click", async () => {
  try {
    setStatus("開啟中…");
    const opened = await shell("/open", { method: "POST", body: "{}" });
    listenChannel(opened.channelName);
    lastWorkerSeatId = null;
    await refreshStatus();
    await refreshDemo();
    setStatus("已開啟；請邀請 worker");
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

btnSpawn.addEventListener("click", async () => {
  try {
    setStatus("邀請 worker…");
    const spawned = await shell("/spawn-participant", {
      method: "POST",
      body: JSON.stringify({ role: "worker", name: "Coding worker" }),
    });
    lastWorkerSeatId = spawned.seatId;
    btnAssign.disabled = false;
    await refreshStatus();
    setStatus("已邀請 " + spawned.seatId.slice(0, 8) + "…；可指派任務");
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

btnAssign.addEventListener("click", async () => {
  try {
    if (!lastWorkerSeatId) throw new Error("尚未邀請 worker");
    setStatus("指派中…");
    const res = await domain("/api/session/assign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assigneeSeatId: lastWorkerSeatId }),
    });
    if (res.events && res.events.length) {
      // Shell publishes when act runs; assign is Host-local — push via shell? 
      // Domain assign returns events; ask shell status refresh; Host should publish.
      // Forward publish: call a tiny endpoint or rely on worker polling state.
      pushLog("task.assigned");
    }
    // Publish assign events onto the channel via a no-op shell path:
    // Host functions cannot BroadcastChannel; shell only publishes on SESSION.act.
    // Workaround: worker boots reads state; also post via fetch that shell doesn't see.
    // Use shell by having worker poll — worker starter already reads state on boot.
    // After late assign, worker listens BC — we need publish. Add /api/session/publish in Host
    // that returns events and... still no BC from Host canvas alone.
    // Canvas Host can new BroadcastChannel(opened.channelName) and post!
    const st = await shell("/status");
    if (st.channelName && res.events) {
      const ch = new BroadcastChannel(st.channelName);
      let seq = 0;
      for (const event of res.events) {
        seq += 1;
        ch.postMessage({
          type: "session-event",
          sessionId: st.sessionId,
          seq,
          event,
        });
      }
      ch.close();
    }
    setStatus("已指派；等待 worker 回報");
    await refreshStatus();
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

btnClose.addEventListener("click", async () => {
  try {
    await shell("/close", { method: "POST", body: "{}" });
    lastWorkerSeatId = null;
    if (channel) {
      try { channel.close(); } catch (_) {}
      channel = null;
    }
    await refreshStatus();
    setStatus("已結束");
  } catch (e) {
    setStatus(String(e.message || e));
  }
});

refreshStatus().catch((e) => setStatus(String(e.message || e)));
`,
    "functions.js": `const PROTOCOL_ID = ${JSON.stringify(CODING_ORCH_PROTOCOL_ID)};
const PROTOCOL_API = ${JSON.stringify(CODING_ORCH_PROTOCOL_API_VERSION)};
const JOIN_POLICY = ${JSON.stringify(CODING_ORCH_JOIN_POLICY)};
const ROLES = ${JSON.stringify([...CODING_ORCH_ROLES])};
const ROLE_LIMITS = ${JSON.stringify(CODING_ORCH_ROLE_LIMITS)};
const CAPABILITIES = ${JSON.stringify([...CODING_ORCH_CAPABILITIES])};
const STATE_KEY = ${JSON.stringify(CODING_ORCH_STATE_KEY)};
const DEMO_PATH = ${JSON.stringify(CODING_ORCH_DEMO_PATH)};
const DEMO_SEED = ${JSON.stringify(DEMO_JS)};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
function err(code, error, status = 400) {
  return json({ error, code }, status);
}
function emptyStore() {
  return {
    sessionId: null,
    channelName: null,
    chatSessionId: "dogfood",
    revision: 0,
    status: "planning",
    goal: "Fix off-by-one in demo.js",
    tasks: [],
    files: { [DEMO_PATH]: DEMO_SEED },
  };
}
async function loadStore(env) {
  const raw = await env.KV.get(STATE_KEY, "text");
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw);
    const base = emptyStore();
    return {
      ...base,
      ...parsed,
      files: { ...base.files, ...(parsed.files || {}) },
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return emptyStore();
  }
}
async function saveStore(env, store) {
  await env.KV.put(STATE_KEY, JSON.stringify(store));
}
function pathAllowed(path) {
  const p = String(path || "").replace(/^\\/+/, "");
  if (!p || p.includes("..") || p.startsWith(".agent/")) return false;
  return p === "README.md" || p.startsWith("src/");
}
function applyEdits(store, edits) {
  if (!Array.isArray(edits) || !edits.length) {
    return { error: err("act_rejected", "result.edits 必填") };
  }
  const fileWrites = [];
  for (const edit of edits) {
    const path = String(edit.path || "").replace(/^\\/+/, "");
    if (!pathAllowed(path)) {
      return { error: err("edit_path_forbidden", "路徑不允許：" + path) };
    }
    if (edit.kind === "write") {
      const content = String(edit.content ?? "");
      store.files[path] = content;
      fileWrites.push({ path, content });
    } else if (edit.kind === "note") {
      continue;
    } else {
      return { error: err("act_rejected", "狗糧 Host 請用 kind:write（patch 見單元測試 API）") };
    }
  }
  return { fileWrites };
}
function publicState(store) {
  return {
    protocolId: PROTOCOL_ID,
    apiVersion: PROTOCOL_API,
    joinPolicy: JOIN_POLICY,
    chatSessionId: store.chatSessionId,
    sessionId: store.sessionId,
    channelName: store.channelName,
    revision: store.revision,
    status: store.status,
    goal: store.goal,
    tasks: store.tasks,
    files: store.files,
  };
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
        joinPolicy: JOIN_POLICY,
        capabilities: CAPABILITIES,
      });
    }
    if (path.endsWith("/api/session/open") && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const store = emptyStore();
      store.sessionId = String(body.sessionId || "");
      store.channelName = String(body.channelName || "");
      if (typeof body.chatSessionId === "string" && body.chatSessionId.trim()) {
        store.chatSessionId = body.chatSessionId.trim();
      }
      store.tasks = [{
        taskId: "t1",
        title: "Fix off-by-one",
        brief: "In " + DEMO_PATH + ", change add() to return a + b (remove + 1).",
        status: "pending",
        assigneeSeatId: null,
      }];
      await saveStore(env, store);
      return json({
        ok: true,
        sessionId: store.sessionId,
        channelName: store.channelName,
        chatSessionId: store.chatSessionId,
      });
    }
    if (path.endsWith("/api/session/state") && request.method === "GET") {
      return json(publicState(await loadStore(env)));
    }
    if (path.endsWith("/api/session/assign") && request.method === "POST") {
      const store = await loadStore(env);
      if (!store.sessionId) return err("session_inactive", "通道尚未開啟", 409);
      const body = await request.json().catch(() => ({}));
      const assigneeSeatId = String(body.assigneeSeatId || "").trim();
      if (!assigneeSeatId) return err("act_rejected", "需要 assigneeSeatId");
      let task = store.tasks.find((t) => t.taskId === "t1");
      if (!task) {
        task = {
          taskId: "t1",
          title: "Fix off-by-one",
          brief: "fix " + DEMO_PATH,
          status: "assigned",
          assigneeSeatId,
        };
        store.tasks = [task];
      } else {
        task.status = "assigned";
        task.assigneeSeatId = assigneeSeatId;
      }
      store.status = "running";
      store.revision += 1;
      await saveStore(env, store);
      return json({
        ok: true,
        events: [{
          type: "task.assigned",
          taskId: task.taskId,
          brief: task.brief,
          assigneeSeatId,
          input: { path: DEMO_PATH, content: store.files[DEMO_PATH] },
          revision: store.revision,
        }],
        state: publicState(store),
      });
    }
    if (path.endsWith("/api/session/act") && request.method === "POST") {
      const store = await loadStore(env);
      if (!store.sessionId) return err("session_inactive", "通道尚未開啟", 409);
      const body = await request.json().catch(() => null);
      if (!body) return err("act_rejected", "無效 body");
      if (body.role !== "worker") return err("role_forbidden", "僅 worker");
      const payload = body.payload || {};
      const type = String(payload.type || "");
      const taskId = String(payload.taskId || "");
      const task = store.tasks.find((t) => t.taskId === taskId);
      if (!task) return err("task_not_found", "未知 taskId");
      if (
        task.assigneeSeatId &&
        body.seatId &&
        task.assigneeSeatId !== body.seatId
      ) {
        return err("task_not_assigned", "此座位未擁有該任務");
      }
      if (type === "task.progress") {
        task.status = "in_progress";
        store.revision += 1;
        await saveStore(env, store);
        return json({
          ok: true,
          events: [{
            type: "task.progress",
            taskId,
            note: String(payload.note || ""),
            revision: store.revision,
          }],
          state: publicState(store),
          seq: store.revision,
        });
      }
      if (type === "task.failed") {
        task.status = "failed";
        task.error = {
          code: String((payload.error && payload.error.code) || "failed"),
          message: String((payload.error && payload.error.message) || "worker failed"),
        };
        store.status = "failed";
        store.revision += 1;
        await saveStore(env, store);
        return json({
          ok: true,
          events: [{
            type: "task.failed",
            taskId,
            error: task.error,
            revision: store.revision,
          }],
          state: publicState(store),
          seq: store.revision,
        });
      }
      if (type === "task.result") {
        if (task.status !== "assigned" && task.status !== "in_progress") {
          return err("task_invalid_state", "任務狀態為 " + task.status);
        }
        const result = payload.result;
        if (!result || typeof result !== "object") return err("act_rejected", "需要 result");
        const applied = applyEdits(store, result.edits);
        if (applied.error) return applied.error;
        task.status = "done";
        task.result = result;
        store.status = "completed";
        store.revision += 1;
        await saveStore(env, store);
        return json({
          ok: true,
          events: [
            { type: "task.result", taskId, revision: store.revision },
            { type: "orchestration.completed", summary: String(result.summary || "done") },
          ],
          state: publicState(store),
          seq: store.revision,
          fileWrites: applied.fileWrites,
        });
      }
      if (type === "task.clarify") {
        store.revision += 1;
        await saveStore(env, store);
        return json({
          ok: true,
          events: [{
            type: "task.clarify",
            taskId,
            question: String(payload.question || ""),
            revision: store.revision,
          }],
          state: publicState(store),
          seq: store.revision,
        });
      }
      return err("act_rejected", "未知 act type：" + type);
    }
    return err("not_found", "找不到路由", 404);
  },
};
`,
  };
}
