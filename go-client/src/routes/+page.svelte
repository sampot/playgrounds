<script lang="ts">
  import { PLAY_ORIGIN } from "$lib/openPlayground";
  import { openPlaygroundHome } from "$lib/openPlayground";
</script>

<svelte:head>
  <title>純玩 · 山姆鍋遊樂場</title>
</svelte:head>

<h1>純玩</h1>
<p class="lead">
  受邀加入時請開啟邀請短網址（<span class="mono">go.samkuo.me/i/…</span>）。此頁不提供編輯環境。
</p>
<p class="status">
  完整遊樂場（開發／本機沙盒）在
  <a href={`${PLAY_ORIGIN}/`} onclick={openPlaygroundHome}>{PLAY_ORIGIN}</a>
</p>
