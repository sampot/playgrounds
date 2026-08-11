<script lang="ts">
  import "../../../lib/styles.css";
  import Flash from "$lib/components/Flash.svelte";
  import { dash } from "$lib/dash.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <title>登入遊樂場 · 我是山姆鍋</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<Flash message={dash.flashMsg} kind={dash.flashKind} />
{@render children()}