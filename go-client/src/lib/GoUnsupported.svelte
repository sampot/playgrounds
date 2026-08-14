<script lang="ts">
  import { goBrowserSupports, goBrowserUnsupportedMessage } from "$lib/goCanvasSupport";
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";

  /** Recomputed on each render: the browser may not have changed, but props
   * are cheap and this keeps the message authoritative. */
  const support = goBrowserSupports();
  const message = goBrowserUnsupportedMessage(support) ?? "";

  /** Copy the canonical go host URL to clipboard so the user can paste into a
   * system browser (works in-app when the share sheet is the only option). */
  function copyHome() {
    if (typeof navigator?.clipboard?.writeText === "function") {
      void navigator.clipboard.writeText(`${PLAY_ORIGIN}/`);
    }
    openPlaygroundHome();
  }

  const missingList = support.missing.map(m => ({
    localStorage: "localStorage",
    indexedDB: "IndexedDB",
    webassembly: "WebAssembly",
    serviceWorker: "Service Worker",
  })[m]);
</script>

<div class="go-unsupported" role="alert" aria-live="assertive">
  <h1 class="go-unsupported-title">抱歉，瀏覽器不支援</h1>
  <p class="go-unsupported-msg">{message}</p>
  {#if missingList.length}
    <ul class="go-unsupported-list">
      {#each missingList as m}
        <li>缺少：{m}</li>
      {/each}
    </ul>
  {/if}
  <p class="go-unsupported-hint">
    純玩需要 Service Worker、localStorage、IndexedDB 與 WebAssembly。
    在 App 內建瀏覽器中打不開請改用系統 Safari／Chrome。
  </p>
  <div class="go-unsupported-actions">
    <a
      class="go-unsupported-btn"
      href="/"
      onclick={() => {
        copyHome();
      }}
    >
      前往首頁
    </a>
    <a
      class="go-unsupported-btn go-unsupported-btn--outline"
      href={PLAY_ORIGIN}
      target="_blank"
      rel="noopener noreferrer"
    >
      在新分頁開啟遊樂場
    </a>
  </div>
</div>

<style>
  .go-unsupported {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    text-align: center;
    background: rgb(var(--fill));
    color: rgb(var(--ink));
  }
  .go-unsupported-title {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 700;
  }
  .go-unsupported-msg {
    margin: 0;
    font-size: 0.95rem;
    color: rgb(var(--muted));
    max-width: 26rem;
  }
  .go-unsupported-list {
    list-style: disc inside;
    margin: 0;
    padding: 0;
    color: rgb(var(--muted));
  }
  .go-unsupported-hint {
    margin: 0;
    font-size: 0.85rem;
    color: rgb(var(--muted));
  }
  .go-unsupported-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    justify-content: center;
  }
  .go-unsupported-btn {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    padding: 0.55rem 1rem;
    border: 1px solid rgb(var(--accent));
    border-radius: var(--radius);
    background: rgb(var(--accent));
    color: #fff;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 650;
    text-decoration: none;
    cursor: pointer;
  }
  .go-unsupported-btn--outline {
    background: transparent;
    color: rgb(var(--accent));
  }
</style>
