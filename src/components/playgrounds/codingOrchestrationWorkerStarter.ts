/**
 * Coding-orchestration worker (DEC-033／037): BYOK／local LLM 產 edits；
 * 未設定時退回規則修 demo off-by-one（**狗糧／教學驗證**）。
 * **產品路徑**請用獨立小品 [`sampot/pg-llm-agent`](https://github.com/sampot/pg-llm-agent)
 *（見 docs/PG-LLM-AGENT-PLAN.md）。env.SESSION 交帳；有 grant 時經 env.DELEGATE 自寫。
 */

import type { FileMap } from "./projectTypes";
import {
  CODING_ORCH_DEMO_PATH,
  CODING_ORCH_PROTOCOL_API_VERSION,
  CODING_ORCH_PROTOCOL_ID,
} from "./codingOrchestrationApi";
import { buildCodingWorkerSystemPrompt } from "./codingOrchestrationLlm";

export const CODING_ORCH_WORKER_STARTER_NAME = "Coding worker（LLM）";
export const CODING_ORCH_WORKER_DEFAULT_ROLE = "worker";

export function createCodingOrchestrationWorkerStarterFiles(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Coding worker</title>
    <meta name="sam:needs-controller" content="1" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app">
      <header>
        <strong>Worker</strong>
        <span id="seat" class="muted">未入座</span>
        <button type="button" id="btn-settings" class="ghost">BYOK</button>
      </header>
      <form id="settings" class="settings hidden" aria-label="Worker BYOK">
        <label>模式
          <select id="mode">
            <option value="auto">自動（有 endpoint 用 LLM，否則規則）</option>
            <option value="llm">強制 LLM</option>
            <option value="rules">僅規則（無 LLM）</option>
          </select>
        </label>
        <label>Endpoint
          <input id="base-url" type="url" placeholder="https://api.openai.com/v1 或本機" />
        </label>
        <label>Model
          <input id="model" type="text" placeholder="gpt-4o-mini" />
        </label>
        <label>密鑰名
          <select id="secret-name"></select>
        </label>
        <p id="secret-hint" class="muted"></p>
        <div class="row">
          <button type="submit">儲存</button>
          <button type="button" id="btn-refresh-secrets" class="ghost">重新整理密鑰</button>
        </div>
      </form>
      <p id="log" class="log"></p>
    </div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
    "styles.css": `:root {
  color-scheme: light dark;
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  color: #14161a;
  background: #eef2f6;
  line-height: 1.4;
  font-size: 13px;
}
@media (prefers-color-scheme: dark) {
  :root { color: #e8ecf1; background: #12161c; }
}
.app { padding: 0.65rem; display: grid; gap: 0.45rem; }
header { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.muted { opacity: 0.7; }
.ghost {
  margin-left: auto;
  border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
  background: transparent;
  color: inherit;
  border-radius: 6px;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
}
.settings {
  display: grid;
  gap: 0.35rem;
  padding: 0.45rem;
  border: 1px solid color-mix(in oklab, currentColor 18%, transparent);
  border-radius: 8px;
}
.settings.hidden { display: none; }
.settings label { display: grid; gap: 0.15rem; font-size: 12px; }
.settings input, .settings select {
  font: inherit;
  padding: 0.25rem 0.35rem;
  border-radius: 6px;
  border: 1px solid color-mix(in oklab, currentColor 22%, transparent);
  background: transparent;
  color: inherit;
}
.row { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.log {
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  opacity: 0.85;
  max-height: 14rem;
  overflow: auto;
  margin: 0;
}
`,
    "app.js": `const PROTOCOL_ID = ${JSON.stringify(CODING_ORCH_PROTOCOL_ID)};
const PROTOCOL_API = ${JSON.stringify(CODING_ORCH_PROTOCOL_API_VERSION)};
const DEMO_PATH = ${JSON.stringify(CODING_ORCH_DEMO_PATH)};
const STORAGE_KEY = "playgrounds-coding-worker-byok";
const SYSTEM_PROMPT = ${JSON.stringify(buildCodingWorkerSystemPrompt())};

const seatEl = document.getElementById("seat");
const logEl = document.getElementById("log");
const settingsEl = document.getElementById("settings");
const modeEl = document.getElementById("mode");
const baseUrlEl = document.getElementById("base-url");
const modelEl = document.getElementById("model");
const secretEl = document.getElementById("secret-name");
const secretHintEl = document.getElementById("secret-hint");
let channel = null;
let doneTasks = new Set();
let busy = false;

function log(line) {
  logEl.textContent = (logEl.textContent + "\\n" + line).trim().slice(-2500);
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function isLocalLlmBaseUrl(baseUrl) {
  try {
    const u = new URL(String(baseUrl || ""));
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function requestUnlockSecretStore() {
  try {
    window.parent.postMessage({ type: "playgrounds-unlock-secret-store" }, "*");
  } catch (_) {}
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

function applySettingsToForm() {
  const s = loadSettings();
  modeEl.value = s.mode === "llm" || s.mode === "rules" ? s.mode : "auto";
  baseUrlEl.value = s.baseUrl || "https://api.openai.com/v1";
  modelEl.value = s.model || "gpt-4o-mini";
}

async function refreshSecrets() {
  const s = loadSettings();
  const selected = s.secretName || "";
  let names = [];
  try {
    const listed = await api("/api/secrets");
    names = Array.isArray(listed.names) ? listed.names : [];
    secretHintEl.textContent = names.length
      ? "已解鎖 · " + names.length + " 顆（雲端需選密鑰；本機可省略）"
      : "尚無密鑰綁定（請在遊樂場介面解鎖 SecretStore；本機 LLM 可省略）";
  } catch (e) {
    secretHintEl.textContent = "無法列密鑰：" + (e.message || e);
    requestUnlockSecretStore();
  }
  secretEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = names.length ? "— 選擇密鑰（本機可省略）—" : "— 尚無密鑰 —";
  secretEl.appendChild(ph);
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === selected) opt.selected = true;
    secretEl.appendChild(opt);
  }
}

function shouldUseLlm(s) {
  if (s.mode === "rules") return false;
  const base = (s.baseUrl || "").trim();
  const secret = s.secretName && String(s.secretName).trim();
  const ready = Boolean(base && (secret || isLocalLlmBaseUrl(base)));
  if (s.mode === "llm") return true; // may fail with clear error if not ready
  return ready; // auto: rules fallback until BYOK／本機就緒
}

function parseEdits(text) {
  let t = String(text || "").trim();
  const fence = String.fromCharCode(96, 96, 96); // \`\`\`
  if (t.startsWith(fence)) {
    t = t.slice(3).replace(/^json\\s*/i, "");
    const end = t.lastIndexOf(fence);
    if (end >= 0) t = t.slice(0, end);
    t = t.trim();
  }
  let raw;
  try {
    raw = JSON.parse(t);
  } catch {
    return { error: "LLM 回傳不是 JSON", code: "llm_parse_error" };
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.edits) || !raw.edits.length) {
    return { error: "缺少 edits", code: "llm_parse_error" };
  }
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "worker edit";
  const edits = [];
  for (const e of raw.edits) {
    if (!e || typeof e !== "object") return { error: "無效 edit", code: "llm_parse_error" };
    const kind = String(e.kind || "");
    if (kind === "note") {
      edits.push({ kind: "note", path: e.path, note: e.note });
      continue;
    }
    const path = String(e.path || "").replace(/^\\/+/, "");
    if (!path || path.includes("..") || path.startsWith(".agent/")) {
      return { error: "路徑不允許：" + path, code: "edit_path_forbidden" };
    }
    if (!(path === "README.md" || path.startsWith("src/"))) {
      return { error: "路徑不允許：" + path, code: "edit_path_forbidden" };
    }
    if (kind === "write") {
      edits.push({ path, kind: "write", content: String(e.content ?? "") });
      continue;
    }
    if (kind === "patch") {
      const unifiedDiff = String(e.unifiedDiff || "");
      if (!unifiedDiff) return { error: "需要 unifiedDiff", code: "llm_parse_error" };
      edits.push({ path, kind: "patch", unifiedDiff });
      continue;
    }
    return { error: "不支援 kind：" + kind, code: "llm_parse_error" };
  }
  if (!edits.some((e) => e.kind === "write" || e.kind === "patch")) {
    return { error: "edits 沒有 write／patch", code: "llm_parse_error" };
  }
  return { summary, edits };
}

function ruleFix(before) {
  return String(before || "")
    .replace("return a + b + 1; // bug: off-by-one", "return a + b;")
    .replace("return a + b + 1;", "return a + b;");
}

async function chatCompletion(messages) {
  const s = loadSettings();
  const baseUrl = s.baseUrl || "https://api.openai.com/v1";
  const secretName = s.secretName && String(s.secretName).trim();
  if (!secretName && !isLocalLlmBaseUrl(baseUrl)) {
    const err = new Error("請先在 BYOK 選擇 SecretStore 密鑰（本機 endpoint 可省略）");
    err.code = "bad_request";
    throw err;
  }
  const res = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secretName: secretName || undefined,
      baseUrl,
      model: s.model || "gpt-4o-mini",
      stream: false,
      messages,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === "secret_locked" || data.code === "secret_absent") {
      requestUnlockSecretStore();
    }
    const err = new Error(data.error || res.statusText || "llm failed");
    err.code = data.code || "llm_error";
    throw err;
  }
  const content =
    data?.choices?.[0]?.message?.content ||
    data?.message?.content ||
    "";
  if (!content) {
    const err = new Error("LLM 無內容");
    err.code = "llm_empty";
    throw err;
  }
  return String(content);
}

function buildUserPrompt(taskId, brief, path, content) {
  return [
    "taskId: " + taskId,
    "brief: " + brief,
    "file path: " + path,
    "current file content:",
    "-----",
    content,
    "-----",
  ].join("\\n");
}

/** DEC-037: write via env.DELEGATE when Host issued a grant; else leave edits for host_apply. */
async function applyEditsViaDelegate(edits) {
  const ready = await api("/api/delegate/ready").catch(() => null);
  if (!ready || !ready.ready) {
    return { viaDelegate: false, edits };
  }
  const out = [];
  for (const e of edits) {
    if (e.kind === "write" && e.path && typeof e.content === "string") {
      await api("/api/delegate/file", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: e.path, content: e.content }),
      });
      out.push({
        kind: "note",
        path: e.path,
        note: "wrote via env.DELEGATE",
      });
    } else {
      out.push(e);
    }
  }
  return { viaDelegate: true, edits: out };
}

async function handleAssigned(event) {
  const taskId = event && event.taskId;
  if (!taskId || doneTasks.has(taskId) || busy) return;
  busy = true;
  const path = (event.input && event.input.path) || DEMO_PATH;
  const before = (event.input && event.input.content) || "";
  const brief = event.brief || "fix the file";
  try {
    await api("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "task.progress",
        taskId,
        note: "working",
      }),
    }).catch(() => null);

    const s = loadSettings();
    let summary;
    let edits;
    if (shouldUseLlm(s)) {
      log("LLM for " + taskId);
      const content = await chatCompletion([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(taskId, brief, path, before) },
      ]);
      const parsed = parseEdits(content);
      if (parsed.error) throw Object.assign(new Error(parsed.error), { code: parsed.code });
      summary = parsed.summary;
      edits = parsed.edits;
    } else {
      log("rules fallback for " + taskId);
      const content = ruleFix(before);
      if (content === before) {
        throw Object.assign(new Error("規則未產生變更"), { code: "no_change" });
      }
      summary = "fixed off-by-one in " + path + " (rules)";
      edits = [{ path, kind: "write", content }];
    }

    const applied = await applyEditsViaDelegate(edits);
    const resultEdits = applied.edits;
    if (applied.viaDelegate) {
      summary = summary + " (via DELEGATE)";
      log("wrote via DELEGATE");
    }

    doneTasks.add(taskId);
    await api("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "task.result",
        taskId,
        result: { summary, edits: resultEdits },
      }),
    });
    log("result sent (" + summary + ")");
  } catch (e) {
    log("fail: " + (e.message || e));
    try {
      await api("/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "task.failed",
          taskId,
          error: {
            code: e.code || "failed",
            message: String(e.message || e),
          },
        }),
      });
    } catch (_) {}
  } finally {
    busy = false;
  }
}

async function boot() {
  applySettingsToForm();
  await refreshSecrets();
  const ready = await api("/api/session/ready").catch(() => null);
  if (!ready || ready.ready === false) {
    seatEl.textContent = "等待 SESSION…";
    setTimeout(boot, 400);
    return;
  }
  const seat = await api("/api/session/seat");
  seatEl.textContent = seat.role + " · " + (seat.seatId || "").slice(0, 8);
  const ch = await api("/api/session/event-channel");
  channel = new BroadcastChannel(ch.name);
  channel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.type !== "session-event") return;
    const event = msg.event;
    if (event && event.type === "task.assigned") {
      void handleAssigned(event);
    }
  };
  log("listening " + ch.name + " " + PROTOCOL_ID + "@" + PROTOCOL_API);
  const state = await api("/api/session/state").catch(() => null);
  if (state && Array.isArray(state.tasks)) {
    for (const t of state.tasks) {
      if (t.status === "assigned" && t.brief) {
        void handleAssigned({
          taskId: t.taskId,
          brief: t.brief,
          input: {
            path: DEMO_PATH,
            content: state.files && state.files[DEMO_PATH],
          },
        });
      }
    }
  }
}

document.getElementById("btn-settings").addEventListener("click", () => {
  settingsEl.classList.toggle("hidden");
});
document.getElementById("btn-refresh-secrets").addEventListener("click", () => {
  void refreshSecrets();
});
settingsEl.addEventListener("submit", (ev) => {
  ev.preventDefault();
  saveSettings({
    mode: modeEl.value,
    baseUrl: baseUrlEl.value.trim(),
    model: modelEl.value.trim(),
    secretName: secretEl.value,
  });
  log("BYOK 已儲存");
  settingsEl.classList.add("hidden");
});

boot().catch((e) => log(String(e.message || e)));
`,
    "functions.js": `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\\/+$/, "") || "/";
    const method = request.method.toUpperCase();
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    const error = (msg, status = 400, code = "error") =>
      json({ error: msg, code }, status);

    async function readJson(req) {
      try {
        return await req.json();
      } catch {
        return null;
      }
    }

    function isLocalLlmBaseUrl(baseUrl) {
      try {
        const u = new URL(String(baseUrl || ""));
        return u.hostname === "localhost" || u.hostname === "127.0.0.1";
      } catch {
        return false;
      }
    }

    async function resolveSecretBinding(secretName) {
      const name = typeof secretName === "string" ? secretName.trim() : "";
      if (!name) return { error: error("缺少 secretName", 400, "bad_request") };
      const secrets = env.secrets && typeof env.secrets === "object" ? env.secrets : null;
      const binding = secrets ? secrets[name] : null;
      if (!binding || typeof binding.get !== "function") {
        return {
          error: error("找不到密鑰 " + name, 403, "secret_not_found"),
        };
      }
      return { binding };
    }

    async function resolveLlmAuth(secretName, baseUrl) {
      const local = isLocalLlmBaseUrl(baseUrl);
      const name = typeof secretName === "string" ? secretName.trim() : "";
      if (!name) {
        if (local) return { apiKey: null, local: true };
        return { error: error("缺少 secretName", 400, "bad_request") };
      }
      const resolved = await resolveSecretBinding(name);
      if (resolved.error) return { error: resolved.error };
      try {
        return { apiKey: await resolved.binding.get(), local };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "secret_locked") {
          return {
            error: error("SecretStore 已鎖定，請在遊樂場介面解鎖", 403, "secret_locked"),
          };
        }
        return { error: error(msg, 403, msg) };
      }
    }

    if (path.endsWith("/api/secrets") && method === "GET") {
      const secrets = env.secrets && typeof env.secrets === "object" ? env.secrets : {};
      const names = Object.keys(secrets).filter(
        (k) => secrets[k] && typeof secrets[k].get === "function"
      );
      return json({ names });
    }

    if (path.endsWith("/api/llm/chat") && method === "POST") {
      const body = await readJson(request);
      const base = String(body?.baseUrl || "https://api.openai.com/v1").replace(
        /\\/+$/u,
        ""
      );
      const auth = await resolveLlmAuth(body?.secretName, base);
      if (auth.error) return auth.error;
      const headers = { "content-type": "application/json" };
      if (auth.apiKey) headers.authorization = "Bearer " + auth.apiKey;
      const upstream = await fetch(base + "/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: body?.model || "gpt-4o-mini",
          messages: body?.messages,
          stream: false,
        }),
      });
      const text = await upstream.text();
      if (!upstream.ok) {
        return error(
          "HTTP " + upstream.status + (text ? ": " + text.slice(0, 160) : ""),
          502,
          "llm_error"
        );
      }
      try {
        return json(JSON.parse(text));
      } catch {
        return error("upstream 非 JSON", 502, "llm_error");
      }
    }

    const DELEGATE = env.DELEGATE || env.TOOL;
    if (path.endsWith("/api/delegate/ready") && method === "GET") {
      return json({ ready: Boolean(DELEGATE) });
    }
    if (path.endsWith("/api/delegate/file") && method === "PUT") {
      if (!DELEGATE) {
        return json({ error: "no DELEGATE", code: "grant_inactive" }, 503);
      }
      const body = await request.json();
      const p = String(body?.path || "").trim();
      if (!p) return error("path required", 400, "bad_request");
      return json(await DELEGATE.writeFile(p, String(body?.content ?? "")));
    }

    const SESSION = env.SESSION;
    if (!SESSION) {
      return json({ ready: false, error: "no SESSION" }, 503);
    }

    if (path.endsWith("/api/session/ready") && method === "GET") {
      return json({ ready: true });
    }
    if (path.endsWith("/api/session/seat") && method === "GET") {
      return json(await SESSION.getSeat());
    }
    if (path.endsWith("/api/session/event-channel") && method === "GET") {
      return json(await SESSION.getEventChannel());
    }
    if (path.endsWith("/api/session/state") && method === "GET") {
      return json(await SESSION.getState());
    }
    if (path.endsWith("/api/session/act") && method === "POST") {
      const body = await request.json();
      return json(await SESSION.act(body));
    }
    return json({ error: "not_found", code: "not_found" }, 404);
  },
};
`,
    "controller.js": `/**
 * Coding worker Controller (DEC-031) — mailbox receives session.event;
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
    "README.md": `# Coding worker（LLM）

\`coding-orchestration.v1\` 工人座位：\`env.SESSION\` 交帳；有委派 grant 時另有 \`env.DELEGATE\`（DEC-037）。

1. 入座後在 **BYOK** 設定 endpoint／model／密鑰（本機 LLM 可省略密鑰）。
2. 收到 \`task.assigned\` → \`task.progress\` → LLM（或規則後備）。
3. 有 grant 時經 \`env.DELEGATE\` 自寫檔，再 \`task.result\`（note）；否則 edits 交總管 \`host_apply\`。無 \`env.HOST\`。

預設模式 **自動**：有 endpoint 用 LLM；否則用規則修 \`${CODING_ORCH_DEMO_PATH}\` off-by-one。
`,
  };
}
