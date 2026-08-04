/**
 * Starter files for a Playgrounds Tool SAM (DEC-022 / PG-TOOLS-PLAN Phase 4).
 * Mounted in the Editor slot; uses env.TOOL (not env.HOST).
 */

import type { FileMap, ProjectMeta } from "./projectTypes";
import { projectToolFieldsFromFiles } from "./samHeadProjectMeta";
import { TEXT_TOOL_GLOBS, TEXT_TOOL_KINDS } from "./toolMatch";

export const TOOL_STARTER_NAME = "文字工具";

/** Mirror of `sam:tool-*` in the starter index.html head (DEC-024). */
export function toolStarterMeta(): Pick<
  ProjectMeta,
  "toolKinds" | "toolGlobs"
> {
  return (
    projectToolFieldsFromFiles(createToolStarterFiles()) ?? {
      toolKinds: [...TEXT_TOOL_KINDS],
      toolGlobs: [...TEXT_TOOL_GLOBS],
    }
  );
}

export function createToolStarterFiles(): FileMap {
  const toolKinds = TEXT_TOOL_KINDS.join(", ");
  const toolGlobs = TEXT_TOOL_GLOBS.join(", ");
  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="sam:tool-kinds" content="${toolKinds}" />
    <meta name="sam:tool-globs" content="${toolGlobs}" />
    <title>文字工具</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app">
      <header class="top">
        <div class="brand">
          <strong>文字工具</strong>
          <span id="path-label" class="path" title="授權路徑">—</span>
        </div>
        <div class="actions">
          <span id="mode-label" class="mode" title="授權模式"></span>
          <button type="button" id="btn-reload" class="ghost" title="重新載入">重新載入</button>
          <button type="button" id="btn-save" class="primary" disabled>儲存</button>
          <button type="button" id="btn-close" class="ghost" title="關閉工具">關閉</button>
        </div>
      </header>
      <p id="status" class="status" role="status"></p>
      <textarea id="editor" class="editor" spellcheck="false" placeholder="掛載後會載入授權檔案…"></textarea>
    </div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
    "styles.css": `:root {
  color-scheme: light dark;
  --bg: #f4f5f7;
  --panel: #fff;
  --text: #14161a;
  --muted: #5c6570;
  --line: #d8dde3;
  --accent: #0f766e;
  --on-accent: #f0fdfa;
  --danger: #b91c1c;
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1216;
    --panel: #171b21;
    --text: #e8ecf1;
    --muted: #9aa3ad;
    --line: #2a313a;
    --accent: #2dd4bf;
    --on-accent: #042f2e;
    --danger: #f87171;
  }
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--text);
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.brand strong {
  font-size: 0.85rem;
}

.path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 16rem;
}

.actions {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.mode {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

button {
  font: inherit;
  font-size: 0.75rem;
  border-radius: 0.35rem;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  padding: 0.3rem 0.65rem;
  cursor: pointer;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

button.primary {
  background: var(--accent);
  border-color: transparent;
  color: var(--on-accent);
  font-weight: 600;
}

button.ghost {
  background: transparent;
}

.status {
  margin: 0;
  padding: 0.35rem 0.75rem;
  font-size: 0.72rem;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
  min-height: 1.5rem;
}

.status.error {
  color: var(--danger);
}

.editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 0;
  resize: none;
  padding: 0.75rem;
  background: var(--bg);
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  line-height: 1.5;
}

.editor:focus {
  outline: none;
}

.editor[readonly] {
  opacity: 0.92;
}
`,
    "app.js": `/** Minimal Tool SAM UI — talks to env.TOOL via functions.js (DEC-022). */

const pathLabel = document.getElementById("path-label");
const modeLabel = document.getElementById("mode-label");
const statusEl = document.getElementById("status");
const editor = document.getElementById("editor");
const btnSave = document.getElementById("btn-save");
const btnReload = document.getElementById("btn-reload");
const btnClose = document.getElementById("btn-close");

let focusPath = "";
let mode = "read";
let contentHash = "";
let dirty = false;

function setStatus(text, isError = false) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("error", Boolean(isError));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || "請求失敗");
    err.code = data.code;
    throw err;
  }
  return data;
}

function syncChrome() {
  pathLabel.textContent = focusPath || "—";
  modeLabel.textContent = mode || "";
  const writable = mode === "readwrite";
  editor.readOnly = !writable;
  btnSave.disabled = !writable || !dirty || !focusPath;
}

async function loadGrantAndFile() {
  setStatus("載入授權…");
  const grant = await api("/api/tool/grant");
  mode = grant.mode || "read";
  focusPath =
    grant.focusPath ||
    (Array.isArray(grant.paths) && grant.paths[0]) ||
    "";
  syncChrome();
  if (!focusPath) {
    editor.value = "";
    setStatus("沒有 focusPath；請在遊樂場指定授權路徑後重新掛載", true);
    return;
  }
  setStatus("載入檔案…");
  const file = await api("/api/tool/file?" + new URLSearchParams({ path: focusPath }));
  editor.value = file.content ?? "";
  contentHash = file.hash || "";
  dirty = false;
  syncChrome();
  setStatus(mode === "readwrite" ? "可編輯 · 已載入" : "唯讀 · 已載入");
}

async function save() {
  if (!focusPath || mode !== "readwrite") return;
  setStatus("儲存中…");
  btnSave.disabled = true;
  try {
    const body = {
      path: focusPath,
      content: editor.value,
    };
    if (contentHash) body.expectedHash = contentHash;
    const result = await api("/api/tool/file", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    contentHash = result.hash || "";
    dirty = false;
    syncChrome();
    setStatus("已儲存");
  } catch (e) {
    setStatus(e.message || String(e), true);
    syncChrome();
  }
}

editor.addEventListener("input", () => {
  if (mode !== "readwrite") return;
  dirty = true;
  syncChrome();
  if (statusEl.textContent === "已儲存") setStatus("未儲存");
});

btnReload.addEventListener("click", () => {
  void loadGrantAndFile().catch(e => setStatus(e.message || String(e), true));
});

btnSave.addEventListener("click", () => {
  void save();
});

btnClose.addEventListener("click", () => {
  void api("/api/tool/close", {
    method: "POST",
    body: JSON.stringify({ dirty }),
  })
    .then(() => setStatus("已請求關閉"))
    .catch(e => setStatus(e.message || String(e), true));
});

void loadGrantAndFile().catch(e => {
  setStatus(
    (e.message || String(e)) +
      "（請用遊樂場「用沙盒開啟」掛載此沙盒為工具）",
    true
  );
});
`,
    "functions.js": `/** Workers-shaped routes for Tool SAM → env.TOOL (DEC-022). */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function error(message, status = 400, code = "bad_request") {
  return json({ error: message, code }, status);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function requireTool(env) {
  if (!env?.TOOL) {
    throw Object.assign(
      new Error("env.TOOL 不可用（僅掛載為工具時可呼叫）"),
      { code: "tool_inactive" }
    );
  }
  return env.TOOL;
}

function apiSubpath(pathname) {
  const marker = "/api";
  const idx = pathname.indexOf(marker);
  if (idx < 0) return pathname || "/";
  return pathname.slice(idx + marker.length) || "/";
}

function toolError(e) {
  const code =
    e && typeof e === "object" && "code" in e ? String(e.code) : "error";
  const status =
    code === "not_found"
      ? 404
      : code === "forbidden" || code === "tool_inactive"
        ? 403
        : code === "conflict"
          ? 409
          : 400;
  return error(e instanceof Error ? e.message : String(e), status, code);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = apiSubpath(url.pathname);
    const method = request.method.toUpperCase();

    try {
      const TOOL = requireTool(env);

      if (path === "/tool/meta" && method === "GET") {
        return json({
          apiVersion: await TOOL.apiVersion(),
          capabilities: await TOOL.capabilities(),
        });
      }
      if (path === "/tool/grant" && method === "GET") {
        return json(await TOOL.getGrant());
      }
      if (path === "/tool/file" && method === "GET") {
        const filePath = url.searchParams.get("path");
        if (!filePath) return error("缺少 path");
        return json(await TOOL.readFile(filePath));
      }
      if (path === "/tool/file" && method === "PUT") {
        const body = await readJson(request);
        if (!body?.path || typeof body.content !== "string") {
          return error("需要 path 與 content 字串");
        }
        return json(
          await TOOL.writeFile(body.path, body.content, {
            expectedHash: body.expectedHash,
          })
        );
      }
      if (path === "/tool/file-base64" && method === "GET") {
        const filePath = url.searchParams.get("path");
        if (!filePath) return error("缺少 path");
        return json(await TOOL.readFileBase64(filePath));
      }
      if (path === "/tool/file-base64" && method === "PUT") {
        const body = await readJson(request);
        if (!body?.path || typeof body.base64 !== "string") {
          return error("需要 path 與 base64");
        }
        return json(await TOOL.writeFileBase64(body.path, body.base64));
      }
      if (path === "/tool/close" && method === "POST") {
        const body = await readJson(request);
        return json(await TOOL.close({ dirty: Boolean(body?.dirty) }));
      }

      return error("找不到路由", 404, "not_found");
    } catch (e) {
      return toolError(e);
    }
  },
};
`,
    "README.md": `# 文字工具（Tool SAM 範本）

此沙盒是 **工具**，不是總管（Steward）。

1. 先開啟你的**工作沙盒**並選好要編的檔。
2. 在 Editor 列按火花圖示：符合的文字檔會**直接**用本工具開啟；或從「用沙盒開啟」選本專案。
3. 本工具會經 \`env.TOOL\` 讀寫授權檔；關閉會卸下掛載。

也可從「新沙盒」選「工具」範本建立（\`index.html\` head 的 \`sam:tool-kinds\` / \`sam:tool-globs\` 供自動建議）。
`,
  };
}
