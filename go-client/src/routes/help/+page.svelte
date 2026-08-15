<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { browser } from "$app/environment";
  import {
    GO_HELP_DESCRIPTION,
    GO_HELP_DOCUMENT_TITLE,
    goOgMeta,
  } from "$lib/goShareMeta";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";

  const og = goOgMeta({
    title: GO_HELP_DOCUMENT_TITLE,
    description: GO_HELP_DESCRIPTION,
    url: `${PLAYGROUNDS_GO_ORIGIN}/help`,
  });

  let backHref = $state("/");
  let backLabel = $state("← 回純玩首頁");

  function isHelpPath(pathname: string): boolean {
    return pathname === "/help" || pathname.startsWith("/help/");
  }

  function applyBack(pathWithSearch: string): void {
    const path = pathWithSearch || "/";
    backHref = path;
    backLabel = path === "/" ? "← 回純玩首頁" : "← 回上一頁";
  }

  afterNavigate(({ from }) => {
    if (!browser) return;
    if (from?.url && !isHelpPath(from.url.pathname)) {
      applyBack(from.url.pathname + from.url.search + from.url.hash);
      return;
    }
    // Full navigation into /help: use same-origin referrer when it is a prior go page.
    try {
      const ref = document.referrer;
      if (ref) {
        const u = new URL(ref);
        if (u.origin === location.origin && !isHelpPath(u.pathname)) {
          applyBack(u.pathname + u.search + u.hash);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    applyBack("/");
  });
</script>

<svelte:head>
  <title>{og.title}</title>
  <meta name="description" content={og.description} />
  <link rel="canonical" href={og.url} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content={og.siteName} />
  <meta property="og:title" content={og.title} />
  <meta property="og:description" content={og.description} />
  <meta property="og:url" content={og.url} />
  <meta property="og:image" content={og.image} />
  <meta property="og:image:width" content={String(og.imageWidth)} />
  <meta property="og:image:height" content={String(og.imageHeight)} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={og.title} />
  <meta name="twitter:description" content={og.description} />
  <meta name="twitter:image" content={og.image} />
</svelte:head>

<p class="help-back">
  <a href={backHref}>{backLabel}</a>
</p>

<h1 class="pixel-text">使用說明</h1>
<p class="lead">加入主畫面、離線再玩，以及掃碼落在 App 內建瀏覽器時怎麼辦。</p>

<section class="help-section pixel-frame" aria-labelledby="help-install">
  <h2 id="help-install">加入主畫面</h2>
  <p>
    用 <strong>iPhone Safari</strong>（不是頁頂「分享」）：
  </p>
  <ol class="help-steps">
    <li>開啟純玩首頁或任一遊戲頁。</li>
    <li>點 Safari <strong>底部分享鈕</strong>（方塊↑）。若看不到，可先按底欄「⋯」再選分享。</li>
    <li>向下捲動；必要時先按「檢視更多」。</li>
    <li>選「加入主畫面」，再按「加入」。</li>
  </ol>
  <p class="help-note">
    若選單裡沒有「加入主畫面」，到分享選單底部「編輯動作」確認該項有開啟。
  </p>
  <p>
    Android Chrome：瀏覽器選單裡的「安裝應用程式」或「加到主畫面」（文案依版本而異）。
  </p>
</section>

<section class="help-section pixel-frame" aria-labelledby="help-offline">
  <h2 id="help-offline">離線再玩</h2>
  <p>
    連線成功開過一次的遊戲，之後可在「更多 → 管理可離線玩的遊戲」再開。邀請短連結（<span
      class="mono">/i/…</span
    >）是臨時的，不能當離線入口。
  </p>
</section>

<section class="help-section pixel-frame" aria-labelledby="help-webview">
  <h2 id="help-webview">App 內建瀏覽器（例如 LINE）</h2>
  <p>
    用相機或 LINE 掃 QR／點連結時，常會開在 <strong>App 內建瀏覽器</strong>，功能可能不完整（無法加入主畫面、部分遊戲異常）。
  </p>
  <p>請改用系統瀏覽器（Safari／Chrome）開啟同一網址：</p>
  <ol class="help-steps">
    <li>在內建瀏覽器選單找「在 Safari 開啟」「以瀏覽器開啟」或「用其他 App 開啟」。</li>
    <li>若沒有這些選項：複製網址，貼到 Safari／Chrome 位址列再開。</li>
  </ol>
  <p class="help-note">
    純玩盡量不依賴跳出 App 也能試玩；若遇到異常，用系統瀏覽器通常就能解決。
  </p>
</section>

<style>
  .help-back {
    margin: 0 0 1rem;
    font-size: 0.9rem;
  }
  .help-back a {
    font-weight: 600;
    text-decoration: none;
  }
  .help-back a:hover,
  .help-back a:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .help-section {
    margin: 0 0 1.5rem;
  }
  .help-section h2 {
    margin: 0 0 0.5rem;
    font-family: var(--pixel);
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .help-section p {
    margin: 0 0 0.65rem;
    font-size: 0.9rem;
    line-height: 1.5;
    color: color-mix(in oklab, rgb(var(--ink)) 88%, transparent);
  }
  .help-steps {
    margin: 0 0 0.75rem;
    padding-left: 1.25rem;
    font-size: 0.9rem;
    line-height: 1.55;
  }
  .help-steps li {
    margin: 0 0 0.35rem;
  }
  .help-note {
    color: rgb(var(--muted)) !important;
    font-size: 0.85rem !important;
  }
</style>
