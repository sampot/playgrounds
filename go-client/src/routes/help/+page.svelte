<script lang="ts">
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";

  const title = "使用說明 · 純玩";
  const description =
    "如何加入主畫面，以及用 LINE 等 App 內建瀏覽器開啟時怎麼改用系統瀏覽器。";
  const canonical = `${PLAYGROUNDS_GO_ORIGIN}/help`;
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content="山姆鍋遊樂場" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
</svelte:head>

<p class="help-back">
  <a href="/">← 回純玩首頁</a>
</p>

<h1>使用說明</h1>
<p class="lead">加入主畫面、離線再玩，以及掃碼落在 App 內建瀏覽器時怎麼辦。</p>

<section class="help-section" aria-labelledby="help-install">
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

<section class="help-section" aria-labelledby="help-offline">
  <h2 id="help-offline">離線再玩</h2>
  <p>
    連線成功開過一次的遊戲，之後可在「更多 → 可離線玩」再開。邀請短連結（<span
      class="mono">/i/…</span
    >）是臨時的，不能當離線入口。
  </p>
</section>

<section class="help-section" aria-labelledby="help-webview">
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
    font-size: 1.05rem;
    font-weight: 700;
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
