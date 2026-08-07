/**
 * Thin local Avatar projection SAM template (DEC-045 Phase 2.5).
 * UI-only — no controller.js; authority stays at remote homePeer.
 */

import type { FileMap } from "../projectTypes";

export const AVATAR_PROJECTION_STARTER_TITLE = "連線畫面";

/** postMessage bridge between projection iframe and AvatarsPanel. */
export const ROSTER_AVATAR_BRIDGE = "playgrounds-roster-avatar" as const;

export type AvatarProjectionOpts = {
  peerAgentId: string;
  name: string;
  identiconUrl: string;
};

export function createAvatarProjectionStarterFiles(
  opts: AvatarProjectionOpts
): FileMap {
  const peerAgentId = opts.peerAgentId;
  const name = opts.name.trim() || peerAgentId;
  const identiconUrl = opts.identiconUrl;

  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(name)}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div class="app">
      <header class="row">
        <img id="icon" class="icon" alt="" width="36" height="36" />
        <div class="meta">
          <strong id="name"></strong>
          <span class="muted">對方場上的連線畫面</span>
        </div>
      </header>
      <button type="button" id="ping" class="btn">打招呼</button>
      <p id="log" class="log" aria-live="polite"></p>
    </div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
    "styles.css": `:root {
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  color: #14161a;
  background: #eef2f6;
  line-height: 1.35;
  font-size: 12px;
}
@media (prefers-color-scheme: dark) {
  :root { color: #e8ecf1; background: #12161c; }
}
.app { padding: 0.5rem; display: flex; flex-direction: column; gap: 0.45rem; height: 100%; box-sizing: border-box; }
.row { display: flex; gap: 0.5rem; align-items: center; }
.icon { border-radius: 6px; background: #fff; flex-shrink: 0; }
.meta { min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
.meta strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted { opacity: 0.55; font-size: 10px; }
.btn {
  align-self: flex-start;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  border-radius: 6px;
  padding: 0.3rem 0.65rem;
  font: inherit;
  cursor: pointer;
}
.btn:disabled { opacity: 0.45; cursor: default; }
.log {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  opacity: 0.8;
  max-height: 5.5rem;
  overflow: auto;
  flex: 1;
}
`,
    "app.js": `const BRIDGE = ${JSON.stringify(ROSTER_AVATAR_BRIDGE)};
const PEER_ID = ${JSON.stringify(peerAgentId)};
const PEER_NAME = ${JSON.stringify(name)};
const ICON_URL = ${JSON.stringify(identiconUrl)};

const nameEl = document.getElementById("name");
const iconEl = document.getElementById("icon");
const pingEl = document.getElementById("ping");
const logEl = document.getElementById("log");

nameEl.textContent = PEER_NAME;
iconEl.src = ICON_URL;
iconEl.alt = "";

function log(line) {
  const next = (logEl.textContent + "\\n" + line).trim();
  logEl.textContent = next.slice(-1800);
}

function postToShell(msg) {
  parent.postMessage({ type: BRIDGE, peerAgentId: PEER_ID, ...msg }, "*");
}

pingEl.addEventListener("click", () => {
  postToShell({ action: "ping" });
  log("已送出打招呼…");
});

window.addEventListener("message", ev => {
  const data = ev.data;
  if (!data || data.type !== BRIDGE) return;
  if (data.action === "relay" && data.payload) {
    const p = data.payload;
    if (p.kind === "ping") {
      log("對方打招呼");
      postToShell({ action: "pong" });
    } else if (p.kind === "pong") {
      log("對方回了招呼");
    } else {
      log(typeof p.kind === "string" ? p.kind : "訊息");
    }
  }
});

postToShell({ action: "ready" });
log("已就緒");
`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}
