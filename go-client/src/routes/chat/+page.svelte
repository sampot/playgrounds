<script lang="ts">
  import {
    GO_CHAT_DESCRIPTION,
    GO_CHAT_DOCUMENT_TITLE,
    goOgMeta,
    goWebPageJsonLd,
  } from "$lib/goShareMeta";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";

  const og = goOgMeta({
    title: GO_CHAT_DOCUMENT_TITLE,
    description: GO_CHAT_DESCRIPTION,
    url: `${PLAYGROUNDS_GO_ORIGIN}/chat`,
  });
  const pageLdJson = JSON.stringify(
    goWebPageJsonLd({
      title: og.title,
      description: og.description,
      url: og.url,
    })
  );
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
  <meta property="og:image:alt" content={og.imageAlt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content={og.twitterSite} />
  <meta name="twitter:title" content={og.title} />
  <meta name="twitter:description" content={og.description} />
  <meta name="twitter:image" content={og.image} />
  <meta name="twitter:image:alt" content={og.imageAlt} />
  {@html `<script type="application/ld+json">${pageLdJson}</script>`}
</svelte:head>

<p class="chat-back">
  <a href="/">← 回遊樂場大廳</a>
</p>

<h1 class="pixel-text">聊天區</h1>
<p class="lead">大廳那桌椅子是入口。之後會員可在這裡邀請朋友線上對話、分享檔案。</p>

<section class="chat-section pixel-frame" aria-labelledby="chat-soon">
  <h2 id="chat-soon">即將開放</h2>
  <p>
    登入通行證的會員將能發出邀請，在瀏覽器裡對話，並把檔案傳給同一場的朋友。現在先記住這個位子；Esc 可回大廳。
  </p>
  <p class="chat-note">單機遊玩不受影響。對話與檔案不會經過遊戲機台本身。</p>
</section>

<style>
  .chat-back {
    margin: 0 0 1rem;
    font-size: 0.9rem;
  }
  .chat-back a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-weight: 600;
    text-decoration: none;
  }
  .chat-back a:hover,
  .chat-back a:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .lead {
    margin: 0 0 1.15rem;
    font-size: 0.95rem;
    line-height: 1.45;
  }
  .chat-section {
    margin: 0 0 1.5rem;
  }
  .chat-section h2 {
    margin: 0 0 0.5rem;
    font-family: var(--pixel);
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .chat-section p {
    margin: 0 0 0.7rem;
    line-height: 1.5;
  }
  .chat-note {
    color: color-mix(in oklab, rgb(var(--ink)) 72%, transparent);
    font-size: 0.88rem;
  }
</style>
