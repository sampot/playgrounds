<script lang="ts">
  import PlaygroundsApp from "@components/playgrounds/PlaygroundsApp.svelte";

  const title = "遊樂場 · 我是山姆鍋";
  const description =
    "我是山姆鍋的瀏覽器遊樂場：開發與實驗單頁小程式（SAM）；沙盒存於 OPFS。";
  const site = "https://play.samkuo.me";
  const canonicalUrl = `${site}/`;
  const ogImageUrl = `${site}/og.png`;
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content="我是山姆鍋" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={ogImageUrl} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={ogImageUrl} />
</svelte:head>

<PlaygroundsApp />
<noscript>
  <p class="text-skin-base p-6 text-sm">
    遊樂場需要啟用 JavaScript，並在支援 OPFS 的瀏覽器中使用。
  </p>
</noscript>
