<script lang="ts">
  import SamCatalogBrowser from "@components/sam-catalog/SamCatalogBrowser.svelte";
  import { samCatalogPage } from "../../data/samCatalog";

  const title = samCatalogPage.title;
  const description = samCatalogPage.description;
  const pageTitle = `${title} · 我是山姆鍋`;
  const site = "https://play.samkuo.me";
  const canonicalUrl = `${site}/sam/`;
  const ogImageUrl = `${site}/sam/og.png`;
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={description} />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content="我是山姆鍋" />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={ogImageUrl} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={ogImageUrl} />
</svelte:head>

<SamCatalogBrowser variant="page" />
