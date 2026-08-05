/**
 * Minimal Agent SAM starter (not the Steward／總管 BYOK template).
 * Demonstrates Controller-driven background work without requiring an LLM.
 */

import type { FileMap } from "./projectTypes";

/** Default display name for the base Agent starter. */
export const AGENT_BASE_STARTER_NAME = "Agent";

export function createAgentBaseStarterFiles(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Agent</title>
    <meta name="sam:needs-controller" content="true" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app">
      <header>
        <strong title="Agent SAM：可背景／主動運行（不必用 LLM）">Agent</strong>
        <span id="role" class="muted">一般 Agent 範本</span>
      </header>
      <p class="lead">
        與工具 SAM 不同：Agent 可經 Controller <em>主動或背景</em>運行。
        本範本不含 LLM；若要當遊樂場對口請改用「總管」範本。
      </p>
      <dl class="stats">
        <div><dt>Controller</dt><dd id="ctrl">…</dd></div>
        <div><dt>背景 tick</dt><dd id="ticks">—</dd></div>
        <div><dt>上次 tick</dt><dd id="last">—</dd></div>
      </dl>
      <div class="row">
        <button type="button" id="btn-start">開始背景</button>
        <button type="button" id="btn-stop" class="ghost">停止</button>
        <button type="button" id="btn-tick" class="ghost">手動 tick</button>
      </div>
      <p id="log" class="log" aria-live="polite"></p>
    </div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
    "styles.css": `:root {
  color-scheme: light dark;
  --bg: #eef2f6;
  --fg: #14161a;
  --muted: #5c6570;
  --card: #fff;
  --line: #d5dbe3;
  --accent: #0f766e;
  --on-accent: #f0fdfa;
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: var(--fg);
  background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #12161c;
    --fg: #e8ecf1;
    --muted: #9aa3ad;
    --card: #1a2028;
    --line: #2a3340;
    --accent: #2dd4bf;
    --on-accent: #042f2e;
  }
}
.app { padding: 0.75rem; max-width: 28rem; }
header { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.5rem; }
.muted { color: var(--muted); font-size: 11px; }
.lead { margin: 0 0 0.75rem; color: var(--muted); font-size: 12px; }
.stats {
  display: grid;
  gap: 0.35rem;
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.75rem;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.stats > div { display: flex; justify-content: space-between; gap: 0.75rem; }
dt { margin: 0; color: var(--muted); font-size: 11px; }
dd { margin: 0; font-variant-numeric: tabular-nums; }
.row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.65rem; }
button {
  border: 0;
  border-radius: 5px;
  padding: 0.35rem 0.65rem;
  background: var(--accent);
  color: var(--on-accent);
  font: inherit;
  cursor: pointer;
}
button.ghost {
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--line);
}
.log {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--muted);
  max-height: 10rem;
  overflow: auto;
}
`,
    "app.js": `const ctrlEl = document.getElementById("ctrl");
const ticksEl = document.getElementById("ticks");
const lastEl = document.getElementById("last");
const logEl = document.getElementById("log");

function log(line) {
  logEl.textContent = (logEl.textContent + "\\n" + line).trim().slice(-1500);
}

async function api(path, init) {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || "request failed");
    err.code = data.code;
    throw err;
  }
  return data;
}

async function refresh() {
  try {
    const s = await api("/api/status");
    ctrlEl.textContent = s.running ? "運行中" : "已停止";
    ticksEl.textContent = String(s.ticks ?? 0);
    lastEl.textContent = s.lastAt || "—";
  } catch (e) {
    ctrlEl.textContent = "無法讀取（需 functions／Controller）";
    log(String(e.message || e));
  }
}

document.getElementById("btn-start").onclick = async () => {
  try {
    await api("/api/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "start" }),
    });
    log("已請 Controller 開始背景 tick");
    await refresh();
  } catch (e) {
    log("start 失敗：" + (e.message || e));
  }
};

document.getElementById("btn-stop").onclick = async () => {
  try {
    await api("/api/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "stop" }),
    });
    log("已請 Controller 停止");
    await refresh();
  } catch (e) {
    log("stop 失敗：" + (e.message || e));
  }
};

document.getElementById("btn-tick").onclick = async () => {
  try {
    const r = await api("/api/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "tick" }),
    });
    log("手動 tick → " + (r.ticks ?? "?"));
    await refresh();
  } catch (e) {
    log("tick 失敗：" + (e.message || e));
  }
};

refresh();
setInterval(() => void refresh(), 2000);
`,
    "controller.js": `/**
 * Minimal Agent Controller (DEC-024).
 * Background ticks via schedule — no LLM required.
 * Full HOST / BYOK chat belongs in the Steward（總管）template.
 */
const TICK_MS = 3000;

async function readState(env) {
  const ticks = Number((await env.KV.get("agent:ticks")) || "0");
  const running = (await env.KV.get("agent:running")) === "1";
  const lastAt = (await env.KV.get("agent:lastAt")) || "";
  return { ticks, running, lastAt };
}

async function writeTick(env) {
  const ticks = Number((await env.KV.get("agent:ticks")) || "0") + 1;
  const lastAt = new Date().toISOString();
  await env.KV.put("agent:ticks", String(ticks));
  await env.KV.put("agent:lastAt", lastAt);
  return { ticks, lastAt };
}

export default {
  async onStart(env, ctx) {
    await env.KV.put("agent:controller", "up");
    // Shell attaches this Controller for Agent form (sam:needs-controller);
    // 設為總管 is only for env.HOST / 對口席, not required to run.
    // UI toggles agent:running via functions.js; alarm only ticks when running.
    if (ctx && typeof ctx.schedule === "function") {
      ctx.schedule({ delayMs: TICK_MS });
    }
  },
  async onStop(env) {
    await env.KV.put("agent:controller", "down");
  },
  async alarm(env, ctx) {
    if ((await env.KV.get("agent:running")) === "1") {
      await writeTick(env);
    }
    if (ctx && typeof ctx.schedule === "function") {
      ctx.schedule({ delayMs: TICK_MS });
    }
  },
  async onCommand(command, env) {
    if (!command || typeof command !== "object") {
      return { ok: false, code: "bad_command" };
    }
    if (command.type === "status") {
      const state = await readState(env);
      return { ok: true, controller: true, ...state };
    }
    if (command.type === "start") {
      await env.KV.put("agent:running", "1");
      return { ok: true, running: true };
    }
    if (command.type === "stop") {
      await env.KV.put("agent:running", "0");
      return { ok: true, running: false };
    }
    if (command.type === "tick") {
      const { ticks, lastAt } = await writeTick(env);
      return { ok: true, ticks, lastAt };
    }
    return { ok: false, code: "unknown_command" };
  },
};
`,
    "functions.js": `/** Thin Infrastructure: status + forward control to Controller via alarm/onCommand bridge. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\\/+$/u, "") || "/";

    if (request.method === "GET" && path.endsWith("/api/status")) {
      const ticks = Number((await env.KV.get("agent:ticks")) || "0");
      const running = (await env.KV.get("agent:running")) === "1";
      const lastAt = (await env.KV.get("agent:lastAt")) || "";
      const controller = (await env.KV.get("agent:controller")) || "unknown";
      return Response.json({
        ok: true,
        ticks,
        running,
        lastAt,
        controller,
      });
    }

    if (request.method === "POST" && path.endsWith("/api/control")) {
      const body = await request.json().catch(() => ({}));
      const type = body && body.type;
      if (type === "start") {
        await env.KV.put("agent:running", "1");
        return Response.json({
          ok: true,
          running: true,
          note: "Controller 排程會在 Agent 形態下持續 tick（不必設為總管）",
        });
      }
      if (type === "stop") {
        await env.KV.put("agent:running", "0");
        return Response.json({ ok: true, running: false });
      }
      if (type === "tick") {
        const ticks = Number((await env.KV.get("agent:ticks")) || "0") + 1;
        const lastAt = new Date().toISOString();
        await env.KV.put("agent:ticks", String(ticks));
        await env.KV.put("agent:lastAt", lastAt);
        return Response.json({ ok: true, ticks, lastAt });
      }
      return Response.json({ ok: false, error: "unknown type", code: "bad_command" }, { status: 400 });
    }

    return Response.json({ error: "not_found", code: "not_found" }, { status: 404 });
  },
};
`,
    "README.md": `# Agent（一般範本）

這是**一般 Agent SAM** 範本：有 UI + \`functions.js\` + **\`controller.js\`**，示範**背景／主動**運行（tick），**不**依賴 LLM。

## 和別種 SAM 的差別

| 種類 | 運行方式 | 典型用途 |
| --- | --- | --- |
| **一般／工具 SAM** | 多半被動：人開畫布或經 grant 被呼叫 | 頁面、編輯器工具 |
| **Agent** | 可經 Controller **主動或背景**跑 | 監控、排程、入座參與、領域代理人 |
| **總管（Steward）** | 一種被設為遊樂場對口的 Agent；持完整 \`env.HOST\` | 聽使用者指示打理沙盒（開源小品 \`sampot/pg-steward\` 含 BYOK） |

Agent **不必**使用 LLM。若要開箱當總管，請從小品開啟 [\`pg-steward\`](https://play.samkuo.me/?open=sampot%2Fpg-steward&name=%E7%B8%BD%E7%AE%A1)，再開啟後設為總管。

## 怎麼試

1. 以本範本建立沙盒（遊樂場會依 \`sam:needs-controller\` 掛上 Controller；**不必**設為總管）。
2. 畫布按「手動 tick」看計數；按「開始背景」讓 Controller 排程持續 tick。
3. 「設為總管」只在需要 \`env.HOST\`／當遊樂場對口時才用——那是總管角色，不是 Agent 形態的前提。
4. 改造成你的領域 Agent 時，保留 \`controller.js\` 契約即可。
`,
  };
}
