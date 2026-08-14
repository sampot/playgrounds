<script lang="ts">
  import { goBrowserSupports, goBrowserUnsupportedMessage } from "$lib/goCanvasSupport";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";

  /** @param {Text} - for display of copied state */
  let copied = $state(false);

  /** Copy the go-client URL so the player can paste it into a system browser
   * (e.g. from an in-app WebView where the current browser can't run games). */
  function copyGoUrl() {
    if (typeof navigator?.clipboard?.writeText !== "function") {
      fallbackCopy(`${PLAYGROUNDS_GO_ORIGIN}/`);
      return;
    }
    void navigator.clipboard.writeText(`${PLAYGROUNDS_GO_ORIGIN}/`).then(
      () => (copied = true),
      () => fallbackCopy(`${PLAYGROUNDS_GO_ORIGIN}/`)
    );
  }

  function fallbackCopy(text: string) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      copied = true;
    } catch {
      /* clipboard unavailable — the user can still use the new-tab link */
    }
  }

  const message = goBrowserUnsupportedMessage(goBrowserSupports()) ?? "";
  const homeUrl = `${PLAYGROUNDS_GO_ORIGIN}/`;
</script>

<div class="go-unsupported" role="alert" aria-live="assertive">
  <h1 class="go-unsupported-title">目前的瀏覽器無法玩遊戲</h1>
  <p class="go-unsupported-msg">{message}</p>
  <p class="go-unsupported-hint">
    請複製下方連結，到 <strong>Safari／Chrome／Edge</strong> 等完整瀏覽器重新開啟。
    App 內建瀏覽器（如 LINE／Instagram）請點「在新分頁開啟」，再用系統瀏覽器接續。
  </p>
  <div class="go-unsupported-url">
    <code class="go-unsupported-code">{homeUrl}</code>
    <button
      type="button"
      class="go-unsupported-copy"
      onclick={copyGoUrl}
      aria-label={copied ? "已複製" : "複製連結"}
      title={copied ? "已複製至剪贴簿" : "複製連結到剪貼簿"}
    >
      {copied ? "已複製" : "複製連結"}
    </button>
  </div>
  <div class="go-unsupported-actions">
    <a
      class="go-unsupported-btn"
      href={homeUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      在新分頁／系統瀏覽器開啟
    </a>
    <a
      class="go-unsupported-btn go-unsupported-btn--outline"
      href={PLAY_ORIGIN}
      target="_blank"
      rel="noopener noreferrer"
      onclick={openPlaygroundHome}
    >
      前往完整遊樂場
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
    gap: 0.85rem;
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
  .go-unsupported-hint {
    margin: 0;
    font-size: 0.85rem;
    color: rgb(var(--muted));
    max-width: 26rem;
    line-height: 1.45;
  }
  .go-unsupported-url {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid rgb(var(--line));
    border-radius: var(--radius);
    background: rgb(var(--card));
  }
  .go-unsupported-code {
    font-family: ui-monospace, "SF Mono", "Noto Sans TC", monospace;
    font-size: 0.8rem;
    word-break: break-all;
    color: rgb(var(--ink));
  }
  .go-unsupported-copy {
    flex-shrink: 0;
    min-height: 2.25rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid rgb(var(--accent));
    border-radius: var(--radius);
    background: rgb(var(--accent));
    color: #fff;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 650;
    cursor: pointer;
  }
  .go-unsupported-copy:hover,
  .go-unsupported-copy:focus-visible {
    filter: brightness(1.05);
    outline: none;
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
