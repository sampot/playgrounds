/**
 * Platform dashboard + join landing (DEC-047 Phase 3).
 * Visual language aligned with field shell (PlaygroundsLayout / global.css).
 */

const MARK =
  "https://play.samkuo.me/favicon.svg";

const SHARED_CSS = /* css */ `
:root {
  color-scheme: light;
  --fill: 248 250 249;
  --ink: 28 35 33;
  --accent: 15 118 110;
  --card: 226 232 230;
  --muted-card: 180 196 190;
  --line: 214 222 219;
  --warn: 146 110 28;
  --danger: 176 62 62;
  --ok: 15 118 110;
  --sans: ui-sans-serif, system-ui, "PingFang TC", "Helvetica Neue",
    "Microsoft JhengHei", "Noto Sans TC", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --radius: 0.5rem;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
html[data-theme="dark"] {
  color-scheme: dark;
  --fill: 18 28 26;
  --ink: 226 232 230;
  --accent: 45 212 191;
  --card: 30 41 38;
  --muted-card: 20 83 75;
  --line: 45 74 68;
  --warn: 212 168 75;
  --danger: 232 120 120;
  --ok: 45 212 191;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: var(--sans);
  background:
    radial-gradient(900px 420px at 8% -8%,
      color-mix(in oklab, rgb(var(--accent)) 12%, transparent), transparent 60%),
    radial-gradient(700px 380px at 100% 0%,
      color-mix(in oklab, rgb(var(--muted-card)) 35%, transparent), transparent 55%),
    rgb(var(--fill));
  color: rgb(var(--ink));
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
a {
  color: rgb(var(--accent));
  text-underline-offset: 0.15em;
}
a:hover { filter: brightness(1.08); }
.site {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
}
.top {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid rgb(var(--line));
  background: color-mix(in oklab, rgb(var(--fill)) 88%, transparent);
  backdrop-filter: blur(10px);
  font-size: 0.75rem;
  color: color-mix(in oklab, rgb(var(--ink)) 70%, transparent);
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex-wrap: wrap;
}
.brand-row a {
  color: inherit;
  text-decoration: none;
}
.brand-row a:hover { color: rgb(var(--accent)); }
.brand-row a[aria-current="page"] {
  color: rgb(var(--ink));
  font-weight: 600;
}
.sep { opacity: 0.4; user-select: none; }
.mark {
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
  display: block;
}
.top-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border: 0;
  border-radius: 0.3rem;
  background: transparent;
  color: rgb(var(--ink));
  cursor: pointer;
}
.icon-btn:hover { color: rgb(var(--accent)); }
.icon-btn:focus-visible {
  outline: 2px solid rgb(var(--accent));
  outline-offset: 2px;
}
.main {
  flex: 1 1 auto;
  width: min(40rem, 100%);
  margin: 0 auto;
  padding: 2rem 1.15rem 3.5rem;
}
.hero {
  margin: 0.5rem 0 1.75rem;
  animation: rise 0.55s var(--ease) both;
}
.hero h1 {
  margin: 0;
  font-size: clamp(2rem, 5.5vw, 2.65rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.hero p {
  margin: 0.55rem 0 0;
  max-width: 28rem;
  color: color-mix(in oklab, rgb(var(--ink)) 58%, transparent);
  font-size: 1.02rem;
}
.panel {
  border: 1px solid rgb(var(--line));
  border-radius: var(--radius);
  background: color-mix(in oklab, rgb(var(--fill)) 70%, rgb(var(--card)));
  padding: 1.15rem 1.2rem 1.25rem;
  margin-bottom: 0.85rem;
  animation: rise 0.55s var(--ease) both;
}
.panel:nth-of-type(2) { animation-delay: 0.04s; }
.panel:nth-of-type(3) { animation-delay: 0.08s; }
.panel:nth-of-type(4) { animation-delay: 0.12s; }
.panel h2 {
  margin: 0 0 0.65rem;
  font-size: 0.72rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: color-mix(in oklab, rgb(var(--ink)) 52%, transparent);
}
.lede {
  margin: 0 0 0.85rem;
  font-size: 0.9rem;
  color: color-mix(in oklab, rgb(var(--ink)) 62%, transparent);
}
label {
  display: block;
  margin: 0 0 0.3rem;
  font-size: 0.82rem;
  color: color-mix(in oklab, rgb(var(--ink)) 58%, transparent);
}
label + .field, label + input { margin-bottom: 0.65rem; }
input, select, textarea {
  width: 100%;
  appearance: none;
  border: 1px solid rgb(var(--line));
  border-radius: 0.35rem;
  background: rgb(var(--fill));
  color: rgb(var(--ink));
  padding: 0.62rem 0.72rem;
  font: inherit;
  font-size: 0.92rem;
}
textarea.mono { font-family: var(--mono); font-size: 0.8rem; resize: vertical; }
input.mono, .mono {
  font-family: var(--mono);
  font-size: 0.84rem;
  word-break: break-all;
}
input:focus-visible, select:focus-visible, button:focus-visible {
  outline: 2px solid rgb(var(--accent));
  outline-offset: 1px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.7rem;
}
button, .btn {
  appearance: none;
  border: 0;
  border-radius: 0.35rem;
  padding: 0.52rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 550;
  cursor: pointer;
  background: rgb(var(--accent));
  color: #f8faf9;
  transition: transform 0.15s var(--ease), filter 0.15s var(--ease);
}
html[data-theme="light"] button:not(.secondary):not(.danger):not(.icon-btn):not(.tab):not(.linkish),
html[data-theme="light"] .btn:not(.secondary) {
  color: #f8faf9;
}
html[data-theme="dark"] button:not(.secondary):not(.danger):not(.icon-btn):not(.tab):not(.linkish),
html[data-theme="dark"] .btn:not(.secondary) {
  color: #06201c;
}
button:hover:not(:disabled), .btn:hover { filter: brightness(1.06); }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button.secondary, .btn.secondary {
  background: transparent;
  color: rgb(var(--ink));
  border: 1px solid rgb(var(--line));
}
button.danger {
  background: transparent;
  color: rgb(var(--danger));
  border: 1px solid color-mix(in oklab, rgb(var(--danger)) 45%, rgb(var(--line)));
}
.meta {
  margin: 0.35rem 0 0;
  font-size: 0.84rem;
  color: color-mix(in oklab, rgb(var(--ink)) 55%, transparent);
}
.flash {
  border-radius: var(--radius);
  border: 1px solid rgb(var(--line));
  padding: 0.7rem 0.85rem;
  margin: 0 0 0.9rem;
  font-size: 0.9rem;
  animation: rise 0.35s var(--ease) both;
}
.flash.ok {
  border-color: color-mix(in oklab, rgb(var(--ok)) 40%, rgb(var(--line)));
  background: color-mix(in oklab, rgb(var(--ok)) 10%, rgb(var(--fill)));
}
.flash.warn {
  border-color: color-mix(in oklab, rgb(var(--warn)) 45%, rgb(var(--line)));
  background: color-mix(in oklab, rgb(var(--warn)) 10%, rgb(var(--fill)));
}
.flash.err {
  border-color: color-mix(in oklab, rgb(var(--danger)) 45%, rgb(var(--line)));
  background: color-mix(in oklab, rgb(var(--danger)) 10%, rgb(var(--fill)));
}
.hidden { display: none !important; }
.secret {
  margin-top: 0.75rem;
  padding: 0.85rem;
  border-radius: var(--radius);
  border: 1px dashed color-mix(in oklab, rgb(var(--warn)) 55%, rgb(var(--line)));
  background: color-mix(in oklab, rgb(var(--warn)) 6%, rgb(var(--fill)));
}
.secret strong {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgb(var(--warn));
}
details.boot {
  border: 1px solid rgb(var(--line));
  border-radius: var(--radius);
  padding: 0.65rem 0.9rem 0.85rem;
  margin-top: 0.85rem;
  background: transparent;
}
details.boot summary {
  cursor: pointer;
  font-size: 0.88rem;
  color: color-mix(in oklab, rgb(var(--ink)) 65%, transparent);
  list-style: none;
}
details.boot summary::-webkit-details-marker { display: none; }
details.boot summary::before {
  content: "▸ ";
  color: rgb(var(--accent));
}
details.boot[open] summary::before { content: "▾ "; }
.tabs {
  display: flex;
  gap: 0.2rem;
  margin: 0 0 1rem;
  border-bottom: 1px solid rgb(var(--line));
}
.tab {
  appearance: none;
  border: 0;
  background: transparent;
  color: color-mix(in oklab, rgb(var(--ink)) 55%, transparent);
  padding: 0.55rem 0.75rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  border-radius: 0;
}
.tab[aria-selected="true"] {
  color: rgb(var(--ink));
  border-bottom-color: rgb(var(--accent));
}
.tab:hover { color: rgb(var(--accent)); }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgb(var(--line));
  font-size: 0.75rem;
  color: color-mix(in oklab, rgb(var(--ink)) 70%, transparent);
}
.chip .dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: rgb(var(--accent));
}
.foot {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid rgb(var(--line));
  font-size: 0.78rem;
  color: color-mix(in oklab, rgb(var(--ink)) 48%, transparent);
}
.foot a { color: inherit; }
.account-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 1rem;
}
.linkish {
  display: inline;
  padding: 0;
  border: 0;
  background: none;
  color: rgb(var(--accent));
  font: inherit;
  font-size: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
.center-card {
  min-height: calc(100svh - 3rem);
  display: grid;
  place-items: center;
  padding: 2rem 1.15rem;
}
.center-card .panel {
  width: min(28rem, 100%);
  margin: 0;
}
.status-pill {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid rgb(var(--line));
  color: color-mix(in oklab, rgb(var(--ink)) 65%, transparent);
}
`;

function shellHead(opts: {
  title: string;
  description: string;
}): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, follow"/>
<meta name="description" content="${escapeAttr(opts.description)}"/>
<meta name="theme-color" content="#f8faf9"/>
<meta property="og:site_name" content="我是山姆鍋"/>
<meta property="og:title" content="${escapeAttr(opts.title)}"/>
<meta property="og:locale" content="zh_TW"/>
<title>${escapeHtml(opts.title)}</title>
<link rel="icon" href="${MARK}" type="image/svg+xml"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>${SHARED_CSS}</style>
<script>
(() => {
  try {
    const k = "pg_dash_theme";
    const saved = localStorage.getItem(k);
    const dark = saved === "dark" || (!saved && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#121c1a" : "#f8faf9");
  } catch (_) {}
})();
</script>
</head>`;
}

function topNav(active: "dash" | "join"): string {
  return `<header class="top">
  <nav class="brand-row" aria-label="站點導覽">
    <a href="https://samkuo.me/" rel="noopener noreferrer" aria-label="我是山姆鍋">
      <img class="mark" src="${MARK}" alt="" width="18" height="18" decoding="async"/>
    </a>
    <a href="https://samkuo.me/" rel="noopener noreferrer">我是山姆鍋</a>
    <span class="sep" aria-hidden="true">·</span>
    <a href="https://play.samkuo.me/">遊樂場</a>
    <span class="sep" aria-hidden="true">·</span>
    <a href="https://play.samkuo.me/sam/">小品</a>
    <span class="sep" aria-hidden="true">·</span>
    <a href="https://docs.samkuo.me/" rel="noopener noreferrer">文件</a>
    <span class="sep" aria-hidden="true">·</span>
    <a href="https://dash.samkuo.me/" ${active === "dash" ? 'aria-current="page"' : ""}>後台</a>
  </nav>
  <div class="top-actions">
    <button type="button" class="icon-btn" id="btn-theme" title="切換外觀" aria-label="切換淺色／深色">◐</button>
  </div>
</header>`;
}

const THEME_SCRIPT = /* js */ `
function bindTheme() {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("pg_dash_theme", next); } catch (_) {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#121c1a" : "#f8faf9");
  });
}
`;

export function adminHtml(): string {
  return `${shellHead({
    title: "遊樂場後台 · 我是山姆鍋",
    description: "Playgrounds Platform 後台：API key、邀請與註冊連結。",
  })}
<body>
<div class="site">
  ${topNav("dash")}
  <main class="main">
    <div class="hero">
      <h1>遊樂場</h1>
      <p>Platform 後台。管理 API key、鑄邀請短連結；註冊邀請制、Social SSO 接續。</p>
    </div>

    <div id="flash" class="flash hidden" role="status" aria-live="polite"></div>

    <section id="view-gate">
      <div class="panel" id="view-login">
        <h2>進入</h2>
        <p class="lede">貼上你的 API key。金鑰只存在此分頁的 sessionStorage；之後會改 Social SSO。</p>
        <label for="key-input">API key</label>
        <input id="key-input" class="mono" type="password" autocomplete="off" spellcheck="false" placeholder="pg_sk_…"/>
        <div class="row">
          <button type="button" id="btn-login">進入後台</button>
        </div>
        <details class="boot" id="view-bootstrap">
          <summary>第一次？一次性 bootstrap</summary>
          <p class="meta" style="margin:0.65rem 0 0.5rem">使用 Cloudflare secret <span class="mono">ADMIN_BOOTSTRAP_TOKEN</span>，只成功一次。</p>
          <label for="boot-token">Bootstrap token</label>
          <input id="boot-token" class="mono" type="password" autocomplete="off"/>
          <div class="row">
            <button type="button" class="secondary" id="btn-bootstrap">建立第一把 admin key</button>
          </div>
        </details>
      </div>
    </section>

    <section id="view-app" class="hidden">
      <div class="account-bar">
        <span class="chip"><span class="dot" aria-hidden="true"></span>
          <span id="me-user" class="mono"></span>
          <span aria-hidden="true">·</span>
          <span id="me-role"></span>
        </span>
        <button type="button" class="linkish" id="btn-logout">登出</button>
      </div>

      <div class="tabs" role="tablist" aria-label="後台區塊">
        <button type="button" class="tab" role="tab" id="tab-keys" aria-selected="true" aria-controls="panel-keys">金鑰</button>
        <button type="button" class="tab" role="tab" id="tab-invites" aria-selected="false" aria-controls="panel-invites">邀請</button>
        <button type="button" class="tab hidden" role="tab" id="tab-admin" aria-selected="false" aria-controls="panel-admin">營運</button>
      </div>

      <div id="panel-keys" role="tabpanel" aria-labelledby="tab-keys">
        <div class="panel">
          <h2>API key</h2>
          <p class="lede">每帳號硬頂一把。明文只在建立／輪替時顯示一次；場內請寫入 SecretStore 保留名 <span class="mono">PLAYGROUNDS_API_KEY</span>。</p>
          <p class="mono" id="key-prefix">—</p>
          <p class="meta" id="key-created"></p>
          <div id="key-reveal" class="secret hidden">
            <strong>立刻複製 — 不會再顯示</strong>
            <code class="mono" id="key-plain"></code>
            <div class="row">
              <button type="button" class="secondary" id="btn-copy-key">複製金鑰</button>
            </div>
          </div>
          <div class="row">
            <button type="button" id="btn-rotate">輪替金鑰</button>
            <button type="button" class="danger" id="btn-revoke">撤銷</button>
          </div>
        </div>
      </div>

      <div id="panel-invites" role="tabpanel" class="hidden" aria-labelledby="tab-invites">
        <div class="panel">
          <h2>場邀請</h2>
          <p class="lede">鑄一條短連結（預設 TTL 5 分鐘）。多人可經同一連結加入；QR 請用短網址。</p>
          <label for="invite-kind">Kind</label>
          <select id="invite-kind">
            <option value="signal.handshake" selected>signal.handshake</option>
            <option value="invite.compose">invite.compose</option>
          </select>
          <label for="invite-field">目標場</label>
          <input id="invite-field" class="mono" value="play.samkuo.me"/>
          <label for="invite-intent">Intent（JSON，invite.compose 用）</label>
          <textarea id="invite-intent" class="mono" rows="5" placeholder='{"sam":{"source":"…","presentation":"maximize_preview"},"session":{"protocol":{…},"consent":"always_ask"},"transport":{"roster":{"signal":true}}}'></textarea>
          <div class="row">
            <button type="button" id="btn-invite">建立邀請</button>
          </div>
          <div id="invite-out" class="secret hidden">
            <strong>邀請已就緒（TTL 5m）</strong>
            <p class="meta">短網址（QR 預設）</p>
            <code class="mono" id="invite-short"></code>
            <div class="row">
              <button type="button" class="secondary" id="btn-copy-short">複製短網址</button>
              <a class="btn secondary" id="invite-open" href="#" target="_blank" rel="noopener">開啟深鏈</a>
            </div>
            <p class="meta" style="margin-top:0.65rem">深鏈</p>
            <code class="mono" id="invite-deep"></code>
          </div>
        </div>
      </div>

      <div id="panel-admin" role="tabpanel" class="hidden" aria-labelledby="tab-admin">
        <div class="panel">
          <h2>註冊邀請</h2>
          <p class="lede">核發 Platform 註冊用 <span class="mono">/join/&lt;token&gt;</span>。與場邀請 <span class="mono">#pg=</span> 不同；SSO 兌換稍後接上。</p>
          <div class="row">
            <button type="button" id="btn-reginv">核發註冊邀請</button>
          </div>
          <div id="reginv-out" class="secret hidden">
            <strong>註冊邀請</strong>
            <code class="mono" id="reginv-url"></code>
            <div class="row">
              <button type="button" class="secondary" id="btn-copy-reginv">複製連結</button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <footer class="foot">
      API <a href="https://api.samkuo.me/health"><span class="mono">api.samkuo.me</span></a>
      · 後台 <span class="mono">dash.samkuo.me</span>
      · 場 <a href="https://play.samkuo.me/"><span class="mono">play.samkuo.me</span></a>
    </footer>
  </main>
</div>
<script>
${THEME_SCRIPT}
(() => {
  const KEY = "pg_dash_api_key";
  const $ = (id) => document.getElementById(id);
  const flashEl = $("flash");
  bindTheme();

  function flash(msg, kind = "ok") {
    flashEl.textContent = msg;
    flashEl.className = "flash " + kind;
  }
  function clearFlash() {
    flashEl.className = "flash hidden";
    flashEl.textContent = "";
  }
  function getKey() { return sessionStorage.getItem(KEY) || ""; }
  function setKey(k) {
    if (k) sessionStorage.setItem(KEY, k);
    else sessionStorage.removeItem(KEY);
  }
  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      flash("已複製", "ok");
    } catch {
      flash("複製失敗，請手動選取", "warn");
    }
  }
  async function api(path, opts = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const k = getKey();
    if (k) headers.Authorization = "Bearer " + k;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { res, data };
  }

  function showGate() {
    $("view-gate").classList.remove("hidden");
    $("view-app").classList.add("hidden");
  }
  function showApp(me) {
    $("view-gate").classList.add("hidden");
    $("view-app").classList.remove("hidden");
    $("me-user").textContent = me.user_id;
    $("me-role").textContent = me.role === "admin" ? "admin" : "user";
    if (me.key) {
      $("key-prefix").textContent = me.key.prefix + "…";
      $("key-created").textContent = "建立於 " + new Date(me.key.created_at).toLocaleString();
    } else {
      $("key-prefix").textContent = "（尚無金鑰）";
      $("key-created").textContent = "";
    }
    const adminTab = $("tab-admin");
    if (me.role === "admin") adminTab.classList.remove("hidden");
    else {
      adminTab.classList.add("hidden");
      if (adminTab.getAttribute("aria-selected") === "true") selectTab("keys");
    }
  }
  function revealKey(plain) {
    $("key-reveal").classList.remove("hidden");
    $("key-plain").textContent = plain;
    selectTab("keys");
  }
  function selectTab(name) {
    const map = { keys: "panel-keys", invites: "panel-invites", admin: "panel-admin" };
    for (const [k, panelId] of Object.entries(map)) {
      const tab = $("tab-" + k);
      const panel = $(panelId);
      const on = k === name;
      if (tab) {
        tab.setAttribute("aria-selected", on ? "true" : "false");
      }
      if (panel) panel.classList.toggle("hidden", !on);
    }
  }

  async function refresh() {
    clearFlash();
    if (!getKey()) { showGate(); return; }
    const { res, data } = await api("/v1/me");
    if (!res.ok) {
      setKey("");
      showGate();
      flash(data?.error === "unauthorized" ? "金鑰無效或已撤銷" : (data?.error || "無法驗證"), "err");
      return;
    }
    showApp(data);
  }

  $("tab-keys").onclick = () => selectTab("keys");
  $("tab-invites").onclick = () => selectTab("invites");
  $("tab-admin").onclick = () => selectTab("admin");

  $("btn-login").onclick = async () => {
    const k = $("key-input").value.trim();
    if (!k) return flash("請貼上 API key", "warn");
    setKey(k);
    $("btn-login").disabled = true;
    try { await refresh(); }
    finally { $("btn-login").disabled = false; }
  };
  $("key-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("btn-login").click();
  });

  $("btn-logout").onclick = () => {
    setKey("");
    $("key-reveal").classList.add("hidden");
    showGate();
    flash("已登出", "ok");
  };

  $("btn-bootstrap").onclick = async () => {
    const token = $("boot-token").value.trim();
    if (!token) return flash("需要 bootstrap token", "warn");
    const { res, data } = await api("/v1/admin/bootstrap", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const map = {
        bootstrap_already_done: "已經 bootstrap 過了",
        unauthorized: "token 不正確",
        bootstrap_not_configured: "伺服器未設定 ADMIN_BOOTSTRAP_TOKEN",
      };
      return flash(map[data?.error] || data?.error || "Bootstrap 失敗", "err");
    }
    setKey(data.api_key);
    revealKey(data.api_key);
    flash("Bootstrap 完成 — 請立刻保存 API key", "warn");
    await refresh();
  };

  $("btn-rotate").onclick = async () => {
    if (!confirm("輪替金鑰？舊金鑰會立刻失效。")) return;
    const { res, data } = await api("/v1/keys", { method: "POST" });
    if (!res.ok) return flash(data?.error || "輪替失敗", "err");
    setKey(data.api_key);
    revealKey(data.api_key);
    flash("已輪替 — 請複製新金鑰", "warn");
    await refresh();
  };

  $("btn-revoke").onclick = async () => {
    if (!confirm("撤銷唯一的 API key？你會被登出，且在 SSO 上線前可能無法再進入。")) return;
    const { res, data } = await api("/v1/keys", { method: "DELETE" });
    if (!res.ok) return flash(data?.error || "撤銷失敗", "err");
    setKey("");
    $("key-reveal").classList.add("hidden");
    showGate();
    flash("金鑰已撤銷", "ok");
  };

  $("btn-copy-key").onclick = () => copyText($("key-plain").textContent);

  $("btn-invite").onclick = async () => {
    const kind = $("invite-kind").value || "signal.handshake";
    const targetField = $("invite-field").value.trim() || "play.samkuo.me";
    let intent = {};
    const rawIntent = ($("invite-intent")?.value || "").trim();
    if (rawIntent) {
      try { intent = JSON.parse(rawIntent); }
      catch { return flash("Intent 不是合法 JSON", "err"); }
    }
    $("btn-invite").disabled = true;
    try {
      const { res, data } = await api("/v1/invites", {
        method: "POST",
        body: JSON.stringify({ kind, targetField, intent }),
      });
      if (!res.ok) return flash(data?.error || "建立邀請失敗", "err");
      $("invite-out").classList.remove("hidden");
      $("invite-short").textContent = data.short_url;
      $("invite-deep").textContent = data.deep_link;
      $("invite-open").href = data.deep_link;
      flash("邀請已建立", "ok");
    } finally {
      $("btn-invite").disabled = false;
    }
  };
  $("btn-copy-short").onclick = () => copyText($("invite-short").textContent);

  $("btn-reginv").onclick = async () => {
    const { res, data } = await api("/v1/admin/registration-invites", {
      method: "POST",
      body: "{}",
    });
    if (!res.ok) return flash(data?.error || "核發失敗", "err");
    $("reginv-out").classList.remove("hidden");
    $("reginv-url").textContent = data.join_url;
    flash("註冊邀請已核發", "ok");
  };
  $("btn-copy-reginv").onclick = () => copyText($("reginv-url").textContent);

  refresh();
})();
</script>
</body>
</html>`;
}

export function joinLandingHtml(opts: {
  ok: boolean;
  message: string;
  expiresAt?: number;
  token?: string;
}): string {
  const status = opts.ok ? "有效" : "不可用";
  const exp =
    opts.expiresAt != null
      ? `<p class="meta">到期 ${escapeHtml(new Date(opts.expiresAt).toLocaleString())}</p>`
      : "";
  const claim =
    opts.ok && opts.token
      ? `<div class="row" style="margin-top:1rem">
          <button type="button" id="btn-claim">領取帳號與 API key</button>
        </div>
        <div id="claim-out" class="secret hidden">
          <strong>立刻複製 — 不會再顯示</strong>
          <code class="mono" id="claim-key"></code>
          <div class="row">
            <button type="button" class="secondary" id="btn-copy-claim">複製金鑰</button>
            <a class="btn" href="https://dash.samkuo.me/">前往後台</a>
          </div>
        </div>
        <p class="meta" id="claim-err"></p>
        <script>
        ${THEME_SCRIPT}; bindTheme();
        (() => {
          const token = ${JSON.stringify(opts.token)};
          const btn = document.getElementById("btn-claim");
          const out = document.getElementById("claim-out");
          const keyEl = document.getElementById("claim-key");
          const err = document.getElementById("claim-err");
          btn?.addEventListener("click", async () => {
            btn.disabled = true;
            err.textContent = "";
            try {
              const res = await fetch("/v1/join/" + encodeURIComponent(token) + "/claim", { method: "POST" });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "claim_failed");
              out.classList.remove("hidden");
              keyEl.textContent = data.api_key;
              try { sessionStorage.setItem("pg_dash_api_key", data.api_key); } catch (_) {}
              btn.classList.add("hidden");
            } catch (e) {
              err.textContent = e instanceof Error ? e.message : String(e);
              btn.disabled = false;
            }
          });
          document.getElementById("btn-copy-claim")?.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(keyEl.textContent || ""); } catch (_) {}
          });
        })();
        </script>`
      : `<script>${THEME_SCRIPT}; bindTheme();</script>`;
  return `${shellHead({
    title: "遊樂場註冊邀請 · 我是山姆鍋",
    description: "Playgrounds Platform 註冊邀請。",
  })}
<body>
<div class="site">
  ${topNav("join")}
  <div class="center-card">
    <div class="panel">
      <div class="hero" style="margin:0 0 1rem">
        <h1 style="font-size:1.65rem">遊樂場</h1>
        <p style="margin-top:0.35rem">Platform 註冊邀請</p>
      </div>
      <p>${escapeHtml(opts.message)}</p>
      ${exp}
      <span class="status-pill">${status}</span>
      ${claim}
      <p class="meta" style="margin-top:1.25rem">
        <a href="https://dash.samkuo.me/">後台</a>
        ·
        <a href="https://play.samkuo.me/">進入場</a>
      </p>
    </div>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
