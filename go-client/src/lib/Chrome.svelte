<script lang="ts">
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";
</script>

<header class="chrome" aria-label="站群">
  <a
    class="mark-link"
    href="https://samkuo.me/"
    title="我是山姆鍋"
    target="_blank"
    rel="noopener noreferrer"
  >
    <img class="mark" src="/favicon.svg" width="22" height="22" alt="山姆鍋" />
  </a>
  <a
    class="play-link"
    href={`${PLAY_ORIGIN}/`}
    title="在系統瀏覽器開啟遊樂場（可行時跳出 App 內嵌瀏覽）"
    onclick={openPlaygroundHome}
  >
    遊樂場
  </a>
  <span class="host" aria-hidden="true">{PLAY_ORIGIN.replace(/^https:\/\//, "")}</span>
</header>
