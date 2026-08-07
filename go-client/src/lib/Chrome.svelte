<script lang="ts">
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";

  const playHost = PLAY_ORIGIN.replace(/^https:\/\//, "");
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
    title="開啟遊樂場"
    target="_blank"
    rel="noopener noreferrer"
    onclick={openPlaygroundHome}
  >
    <span class="play-label">遊樂場</span>
    <span class="host">{playHost}</span>
  </a>
</header>
