/**
 * Platform dashboard + join landing (DEC-047 Phase 3).
 * Visual language aligned with field shell (PlaygroundsLayout / global.css).
 */

const MARK = "/favicon.svg";

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
.icon-btn svg {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}
/* 對齊場殼：淺色顯示月亮、深色顯示太陽 */
.icon-btn svg.theme-icon-sun,
html[data-theme="dark"] .icon-btn svg.theme-icon-moon {
  display: none;
}
.icon-btn svg.theme-icon-moon,
html[data-theme="dark"] .icon-btn svg.theme-icon-sun {
  display: inline-block;
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
  text-decoration: none;
  display: inline-flex;
  align-items: center;
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
.overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: color-mix(in oklab, rgb(var(--ink)) 35%, transparent);
  backdrop-filter: blur(4px);
  animation: rise 0.2s var(--ease) both;
}
.overlay[hidden], .overlay.hidden { display: none !important; }
.dialog {
  width: min(22rem, 100%);
  border-radius: var(--radius);
  border: 1px solid rgb(var(--line));
  background: rgb(var(--fill));
  padding: 1.1rem 1.15rem 1rem;
  box-shadow: 0 18px 40px color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
}
.dialog h3 {
  margin: 0 0 0.45rem;
  font-size: 1.05rem;
  font-weight: 650;
}
.dialog p {
  margin: 0;
  font-size: 0.9rem;
  color: color-mix(in oklab, rgb(var(--ink)) 72%, transparent);
}
.dialog .row { margin-top: 1rem; justify-content: flex-end; }
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
    <a href="https://docs.samkuo.me/guides/opening-a-field/" rel="noopener noreferrer">文件</a>
    <span class="sep" aria-hidden="true">·</span>
    <a href="https://dash.samkuo.me/" ${active === "dash" ? 'aria-current="page"' : ""}>後台</a>
  </nav>
  <div class="top-actions">
    <button type="button" class="icon-btn" id="btn-theme" title="切換明／暗主題" aria-label="切換主題" aria-live="polite">
      <svg xmlns="http://www.w3.org/2000/svg" class="theme-icon-moon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path fill="currentColor" d="M20.742 13.045a8.088 8.088 0 0 1-2.077.271c-2.135 0-4.14-.83-5.646-2.336a8.025 8.025 0 0 1-2.064-7.723A1 1 0 0 0 9.73 2.034a10.014 10.014 0 0 0-4.489 2.582c-3.898 3.898-3.898 10.243 0 14.143a9.937 9.937 0 0 0 7.072 2.93 9.93 9.93 0 0 0 7.07-2.929 10.007 10.007 0 0 0 2.583-4.491 1.001 1.001 0 0 0-1.224-1.224zm-2.772 4.301a7.947 7.947 0 0 1-5.656 2.343 7.953 7.953 0 0 1-5.658-2.344c-3.118-3.119-3.118-8.195 0-11.314a7.923 7.923 0 0 1 2.06-1.483 10.027 10.027 0 0 0 2.89 7.848 9.972 9.972 0 0 0 7.848 2.891 8.036 8.036 0 0 1-1.484 2.059z"/>
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" class="theme-icon-sun" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path fill="currentColor" d="M6.993 12c0 2.761 2.246 5.007 5.007 5.007s5.007-2.246 5.007-5.007S14.761 6.993 12 6.993 6.993 9.239 6.993 12zM12 8.993c1.658 0 3.007 1.349 3.007 3.007S13.658 15.007 12 15.007 8.993 13.658 8.993 12 10.342 8.993 12 8.993zM10.998 19h2v3h-2zm0-17h2v3h-2zm-9 9h3v2h-3zm17 0h3v2h-3zM4.219 18.363l2.12-2.122 1.415 1.414-2.12 2.122zM16.24 6.344l2.122-2.122 1.414 1.414-2.122 2.122zM6.342 7.759 4.22 5.637l1.415-1.414 2.12 2.122zm13.434 10.605-1.414 1.414-2.122-2.122 1.414-1.414z"/>
      </svg>
    </button>
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
    description: "Playgrounds Platform 後台：API key 與註冊邀請。",
  })}
<body>
<div class="site">
  ${topNav("dash")}
  <main class="main">
    <div class="hero">
      <h1>遊樂場</h1>
      <p>Platform 後台。統一進入；登入後依角色顯示。後台 API 應持 access token；API key 專供遊樂場殼頁。場邀請短網址由小品經場殼代理向 API 取得。</p>
    </div>

    <div id="flash" class="flash hidden" role="status" aria-live="polite"></div>

    <section id="view-gate">
      <div class="panel" id="view-login">
        <h2>進入</h2>
        <p class="lede">所有帳號由此進入。使用 GitHub 或 Google 登入；登入後依角色顯示（一般使用者僅金鑰；營運僅 admin）。場用 API key 只給遊樂場殼頁，不能用來登入後台。</p>
        <div class="row">
          <a class="btn" id="btn-github" href="/auth/github?intent=login">使用 GitHub 進入</a>
          <a class="btn secondary" id="btn-google" href="/auth/google?intent=login">使用 Google 進入</a>
        </div>
      </div>
    </section>

    <section id="view-app" class="hidden">
      <div class="account-bar">
        <span class="chip"><span class="dot" aria-hidden="true"></span>
          <span id="me-user" class="mono"></span>
          <span aria-hidden="true">·</span>
          <span id="me-role"></span>
          <span id="me-github" class="meta" style="margin-left:0.35rem"></span>
          <span id="me-google" class="meta" style="margin-left:0.35rem"></span>
        </span>
        <button type="button" class="linkish" id="btn-logout">登出</button>
      </div>

      <div class="tabs" role="tablist" aria-label="後台區塊">
        <button type="button" class="tab" role="tab" id="tab-keys" aria-selected="true" aria-controls="panel-keys">金鑰</button>
        <button type="button" class="tab hidden" role="tab" id="tab-admin" aria-selected="false" aria-controls="panel-admin">營運</button>
      </div>

      <div id="panel-keys" role="tabpanel" aria-labelledby="tab-keys">
        <div class="panel">
          <h2>API key</h2>
          <p class="lede">每帳號硬頂一把，<strong>專供遊樂場殼頁</strong>（寫入 SecretStore <span class="mono">PLAYGROUNDS_API_KEY</span>）。明文只在建立／輪替時顯示一次。後台本身應以 access token 呼叫 API，不以金鑰當登入憑證。</p>
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
            <a class="btn secondary hidden" id="btn-link-github" href="/auth/github?intent=link">連結 GitHub</a>
            <a class="btn secondary hidden" id="btn-link-google" href="/auth/google?intent=link">連結 Google</a>
          </div>
        </div>
      </div>

      <div id="panel-admin" role="tabpanel" class="hidden" aria-labelledby="tab-admin">
        <div class="panel">
          <h2>註冊邀請</h2>
          <p class="lede">核發 Platform 註冊用 <span class="mono">/join/&lt;token&gt;</span>。與場邀請 <span class="mono">#pg=</span> 不同（場邀請由小品經殼代理鑄造）。</p>
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
<div id="confirm-overlay" class="overlay hidden" hidden role="dialog" aria-modal="true" aria-labelledby="confirm-title">
  <div class="dialog">
    <h3 id="confirm-title">確認</h3>
    <p id="confirm-msg"></p>
    <div class="row">
      <button type="button" class="secondary" id="confirm-cancel">取消</button>
      <button type="button" class="danger" id="confirm-ok">確認</button>
    </div>
  </div>
</div>
<script>
${THEME_SCRIPT}
(() => {
  const AT = "pg_dash_access_token";
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
  function getAccessToken() { return sessionStorage.getItem(AT) || ""; }
  function setAccessToken(t) {
    if (t) sessionStorage.setItem(AT, t);
    else sessionStorage.removeItem(AT);
    try { sessionStorage.removeItem("pg_dash_api_key"); } catch (_) {}
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
    const t = getAccessToken();
    if (t) headers.Authorization = "Bearer " + t;
    const res = await fetch(path, Object.assign({}, opts, { headers, credentials: "include" }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { res, data };
  }

  let currentRole = "user";

  function showGate() {
    $("view-gate").classList.remove("hidden");
    $("view-app").classList.add("hidden");
    currentRole = "user";
  }
  function applyRoleUi(role) {
    currentRole = role === "admin" ? "admin" : "user";
    const adminTab = $("tab-admin");
    const adminPanel = $("panel-admin");
    const isAdmin = currentRole === "admin";
    adminTab.classList.toggle("hidden", !isAdmin);
    adminTab.hidden = !isAdmin;
    adminPanel.hidden = !isAdmin;
    if (!isAdmin) {
      adminPanel.classList.add("hidden");
      if (adminTab.getAttribute("aria-selected") === "true") selectTab("keys");
    }
  }
  function showApp(me) {
    $("view-gate").classList.add("hidden");
    $("view-app").classList.remove("hidden");
    $("me-user").textContent = me.user_id;
    $("me-role").textContent = me.role === "admin" ? "admin" : "user";
    const gh = $("me-github");
    const linkGh = $("btn-link-github");
    if (me.github && me.github.login) {
      gh.textContent = "@" + me.github.login;
      linkGh.classList.add("hidden");
    } else {
      gh.textContent = "";
      linkGh.classList.remove("hidden");
    }
    const gg = $("me-google");
    const linkGg = $("btn-link-google");
    if (me.google && me.google.email) {
      gg.textContent = me.google.email;
      linkGg.classList.add("hidden");
    } else {
      gg.textContent = "";
      linkGg.classList.remove("hidden");
    }
    if (me.key) {
      $("key-prefix").textContent = me.key.prefix + "…";
      $("key-created").textContent = "建立於 " + new Date(me.key.created_at).toLocaleString();
      $("btn-revoke").disabled = false;
      $("btn-revoke").title = "";
      $("btn-rotate").textContent = "輪替金鑰";
    } else {
      $("key-prefix").textContent = "（尚無金鑰）";
      $("key-created").textContent = "";
      $("btn-revoke").disabled = true;
      $("btn-revoke").title = "尚無金鑰，無法撤銷";
      $("btn-rotate").textContent = "建立金鑰";
    }
    applyRoleUi(me.role);
  }
  function revealKey(plain) {
    $("key-reveal").classList.remove("hidden");
    $("key-plain").textContent = plain;
    selectTab("keys");
  }
  function selectTab(name) {
    if (name === "admin" && currentRole !== "admin") name = "keys";
    const map = { keys: "panel-keys", admin: "panel-admin" };
    for (const [k, panelId] of Object.entries(map)) {
      const tab = $("tab-" + k);
      const panel = $(panelId);
      const on = k === name;
      if (tab) {
        tab.setAttribute("aria-selected", on ? "true" : "false");
      }
      if (panel) {
        if (k === "admin" && currentRole !== "admin") {
          panel.classList.add("hidden");
          panel.hidden = true;
        } else {
          panel.classList.toggle("hidden", !on);
          if (k === "admin") panel.hidden = !on;
        }
      }
    }
  }

  const AUTH_ERR = {
    need_invite_or_link: "此 Google／GitHub 尚未綁到任何帳號。請先用已綁定的方式進入，再到金鑰頁按「連結 Google／GitHub」；新帳號須持註冊邀請；第一個 admin 請走 /bootstrap/。",
    invite_not_found: "註冊邀請無效",
    invite_gone: "註冊邀請已過期或已使用",
    bootstrap_already_done: "已經 bootstrap 過了",
    unauthorized: "授權失敗（請確認 bootstrap token）",
    invalid_state: "登入狀態無效，請重試",
    github_already_linked: "此 GitHub 已綁到其他帳號",
    google_already_linked: "此 Google 已綁到其他帳號",
    admin_github_mismatch: "admin 已綁其他 GitHub",
    admin_google_mismatch: "admin 已綁其他 Google",
    github_oauth_not_configured: "伺服器未設定 GitHub OAuth",
    google_oauth_not_configured: "伺服器未設定 Google OAuth",
    github_user_failed: "無法讀取 GitHub 使用者資料",
    google_user_failed: "無法讀取 Google 使用者資料",
    token_exchange_failed: "OAuth token 交換失敗（請確認 callback URL）",
  };

  async function redeemSession(code) {
    const res = await fetch("/v1/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ session: code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return false;
    if (data.access_token) setAccessToken(data.access_token);
    return true;
  }

  async function maybeRevealPendingKey() {
    const { res, data } = await api("/v1/auth/reveal-key", { method: "POST", body: "{}" });
    if (res.ok && data?.api_key) {
      revealKey(data.api_key);
      flash("請立刻保存場用 API key", "warn");
    }
  }

  async function refresh(flags = {}) {
    clearFlash();
    const { res, data } = await api("/v1/me");
    if (!res.ok) {
      setAccessToken("");
      showGate();
      if (data?.error && data.error !== "unauthorized") {
        flash(
          data?.error === "wrong_credential"
            ? "請使用 SSO 重新登入"
            : (data?.error || "無法驗證"),
          "err"
        );
      }
      return;
    }
    showApp(data);
    if (flags.bootstrap || flags.claimed || flags.linked) {
      await maybeRevealPendingKey();
      if (flags.linked) flash("已連結 SSO 帳號", "ok");
      if (flags.bootstrap) flash("Bootstrap 完成", "ok");
      if (flags.claimed) flash("註冊完成 — 請保存場用 API key", "warn");
    }
  }

  function askConfirm(message, opts = {}) {
    const overlay = $("confirm-overlay");
    const titleEl = $("confirm-title");
    const msgEl = $("confirm-msg");
    const okBtn = $("confirm-ok");
    const cancelBtn = $("confirm-cancel");
    titleEl.textContent = opts.title || "確認";
    msgEl.textContent = message;
    okBtn.textContent = opts.okLabel || "確認";
    okBtn.className = opts.danger === false ? "" : "danger";
    overlay.hidden = false;
    overlay.classList.remove("hidden");
    okBtn.focus();
    return new Promise((resolve) => {
      const close = (ok) => {
        overlay.hidden = true;
        overlay.classList.add("hidden");
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        overlay.onclick = null;
        document.removeEventListener("keydown", onKey);
        resolve(ok);
      };
      const onKey = (e) => {
        if (e.key === "Escape") close(false);
        if (e.key === "Enter") close(true);
      };
      okBtn.onclick = () => close(true);
      cancelBtn.onclick = () => close(false);
      overlay.onclick = (e) => { if (e.target === overlay) close(false); };
      document.addEventListener("keydown", onKey);
    });
  }

  $("tab-keys").onclick = () => selectTab("keys");
  $("tab-admin").onclick = () => {
    if (currentRole !== "admin") return;
    selectTab("admin");
  };

  $("btn-logout").onclick = async () => {
    try { await api("/v1/auth/logout", { method: "POST", body: "{}" }); } catch (_) {}
    setAccessToken("");
    $("key-reveal").classList.add("hidden");
    showGate();
    flash("已登出", "ok");
  };

  $("btn-rotate").onclick = async () => {
    const hasKey = !$("btn-revoke").disabled;
    const ok = await askConfirm(
      hasKey
        ? "輪替場用 API key？舊金鑰會立刻失效（後台工作階段不變）。"
        : "建立一把場用 API key？寫入 SecretStore 後可供遊樂場殼頁使用。",
      {
        title: hasKey ? "輪替金鑰" : "建立金鑰",
        okLabel: hasKey ? "輪替" : "建立",
        danger: hasKey,
      }
    );
    if (!ok) return;
    const { res, data } = await api("/v1/keys", { method: "POST" });
    if (!res.ok) return flash(data?.error || (hasKey ? "輪替失敗" : "建立失敗"), "err");
    revealKey(data.api_key);
    flash(hasKey ? "已輪替 — 請複製新金鑰寫入場內密鑰庫" : "已建立 — 請複製金鑰寫入場內密鑰庫", "warn");
    await refresh();
  };

  $("btn-revoke").onclick = async () => {
    if ($("btn-revoke").disabled) {
      flash("尚無金鑰，無法撤銷", "warn");
      return;
    }
    const ok = await askConfirm("撤銷場用 API key？場殼將無法鑄邀請；後台工作階段仍保留。", {
      title: "撤銷金鑰",
      okLabel: "撤銷",
    });
    if (!ok) return;
    const { res, data } = await api("/v1/keys", { method: "DELETE" });
    if (!res.ok) {
      if (data?.error === "no_key") {
        flash("尚無金鑰，無法撤銷", "warn");
        await refresh();
        return;
      }
      return flash(data?.error || "撤銷失敗", "err");
    }
    $("key-reveal").classList.add("hidden");
    flash("場用金鑰已撤銷", "ok");
    await refresh();
  };

  $("btn-copy-key").onclick = () => copyText($("key-plain").textContent);

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

  (async () => {
    const params = new URLSearchParams(location.search);
    const authErr = params.get("auth_error");
    const sessionCode = params.get("session");
    const flags = {
      bootstrap: params.get("bootstrap") === "1",
      claimed: params.get("claimed") === "1",
      linked: params.get("linked") === "1",
    };
    const hadFlags =
      flags.bootstrap ||
      flags.claimed ||
      flags.linked ||
      params.has("session") ||
      params.has("auth_error");
    let pendingFlash = null;
    if (authErr) {
      pendingFlash = { msg: AUTH_ERR[authErr] || authErr, kind: "err" };
    }
    if (sessionCode) {
      const ok = await redeemSession(sessionCode);
      if (!ok) {
        pendingFlash = {
          msg: "登入交接失敗，請再試一次",
          kind: "err",
        };
      }
    }
    if (hadFlags) history.replaceState({}, "", location.pathname);
    await refresh(flags);
    // refresh() clears flash；OAuth 錯誤須在之後重掛
    if (pendingFlash) flash(pendingFlash.msg, pendingFlash.kind);
  })();
})();
</script>
</body>
</html>`;
}

export function bootstrapHtml(): string {
  return `${shellHead({
    title: "遊樂場 Bootstrap · 我是山姆鍋",
    description: "Playgrounds Platform 一次性 admin bootstrap。",
  })}
<body>
<div class="site">
  ${topNav("dash")}
  <main class="main">
    <div class="hero">
      <h1>Bootstrap</h1>
      <p>建立或綁定第一個 admin（不在一般登入頁顯示）。</p>
    </div>
    <div id="flash" class="flash hidden" role="status" aria-live="polite"></div>
    <div class="panel">
      <h2>Admin bootstrap</h2>
      <p class="lede">使用 Cloudflare secret <span class="mono">ADMIN_BOOTSTRAP_TOKEN</span>。第一次建立 admin＋場用 API key；若先前已 bootstrap 但尚未綁 SSO，可再用同一 token 綁定並進入。</p>
      <label for="boot-token">Bootstrap token</label>
      <input id="boot-token" class="mono" type="password" autocomplete="off"/>
      <div class="row">
        <button type="button" id="btn-bootstrap-github">以 GitHub 完成 bootstrap</button>
        <button type="button" class="secondary" id="btn-bootstrap-google">以 Google 完成 bootstrap</button>
        <a class="btn secondary" href="/">回後台登入</a>
      </div>
    </div>
    <footer class="foot">
      <span class="mono">dash.samkuo.me/bootstrap/</span>
    </footer>
  </main>
</div>
<script>
${THEME_SCRIPT}
(() => {
  bindTheme();
  const flashEl = document.getElementById("flash");
  function flash(msg, kind) {
    flashEl.textContent = msg;
    flashEl.className = "flash " + (kind || "ok");
  }
  const params = new URLSearchParams(location.search);
  const err = params.get("auth_error");
  const ERR = {
    unauthorized: "token 不正確",
    github_already_linked: "此 GitHub 已綁到其他帳號",
    google_already_linked: "此 Google 已綁到其他帳號",
    admin_github_mismatch: "admin 已綁其他 GitHub",
    admin_google_mismatch: "admin 已綁其他 Google",
    token_exchange_failed: "OAuth token 交換失敗",
    github_oauth_not_configured: "伺服器未設定 GitHub OAuth",
    google_oauth_not_configured: "伺服器未設定 Google OAuth",
    github_user_failed: "無法讀取 GitHub 使用者資料",
    google_user_failed: "無法讀取 Google 使用者資料",
  };
  if (err) {
    flash(ERR[err] || err, "err");
    history.replaceState({}, "", location.pathname);
  }
  function startBootstrap(provider) {
    const token = document.getElementById("boot-token").value.trim();
    if (!token) return flash("需要 bootstrap token", "warn");
    location.href = "/auth/" + provider + "?intent=bootstrap&bootstrap_token=" + encodeURIComponent(token);
  }
  document.getElementById("btn-bootstrap-github").onclick = () => startBootstrap("github");
  document.getElementById("btn-bootstrap-google").onclick = () => startBootstrap("google");
  document.getElementById("boot-token").addEventListener("keydown", (e) => {
    if (e.key === "Enter") startBootstrap("github");
  });
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
          <a class="btn" href="/auth/github?intent=join&amp;token=${encodeURIComponent(opts.token)}">使用 GitHub 領取</a>
          <a class="btn secondary" href="/auth/google?intent=join&amp;token=${encodeURIComponent(opts.token)}">使用 Google 領取</a>
        </div>
        <p class="meta" style="margin-top:0.75rem">領取後會綁定 SSO、建立後台 session，並顯示一次場用 API key（寫入場內密鑰庫）。</p>
        <script>${THEME_SCRIPT}; bindTheme();</script>`
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
