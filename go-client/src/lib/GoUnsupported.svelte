<script lang="ts">
  import { goBrowserSupports, goBrowserUnsupportedMessage } from "$lib/goCanvasSupport";

  let copied = $state(false);

  const support = goBrowserSupports();
  const message = goBrowserUnsupportedMessage(support) ?? "";
  const pageUrl =
    typeof location !== "undefined" ? location.href : "";

  /**
   * Copy the *current page URL* so the player can paste it into a system
   * browser. Clipboard API may be unavailable in the very in-app browsers we
   * gate for, so fall back to `execCommand("copy")`.
   */
  function copyPageUrl() {
    copyText(pageUrl)
      .catch(() => copyTextFallback(pageUrl))
      .then(() => {
        copied = true;
        setTimeout(() => (copied = false), 2200);
      });
  }

  function copyText(text: string): Promise<void> {
    if (typeof navigator?.clipboard?.writeText === "function") {
      return navigator.clipboard.writeText(text).then(() => undefined);
    }
    return Promise.reject(new Error("no clipboard API"));
  }

  function copyTextFallback(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
</script>

{#if !support.supported}
  <div class="go-unsupported" role="alert" aria-live="polite">
    <div class="go-unsupported-card pixel-frame">
      <h1 class="go-unsupported-title pixel-text">目前的瀏覽器無法玩遊戲</h1>
      <p class="go-unsupported-msg">{message}</p>
      <p class="go-unsupported-hint">
        請在 <strong>Safari／Chrome／Edge</strong> 等完整瀏覽器貼上下方連結開啟。<br />
        在 App 內建瀏覽器（如 LINE／Instagram）請「複製網址」後，到系統瀏覽器貼上開啟。
      </p>
      <div class="go-unsupported-url">
        <code class="go-unsupported-code" title={pageUrl}>{pageUrl}</code>
        <button
          type="button"
          class="go-unsupported-copy pixel-btn pixel-btn--primary"
          onclick={copyPageUrl}
          aria-label={copied ? "已複製" : "複製連結"}
          title={copied ? "已複製至剪貼簿" : "複製此頁連結到剪貼簿"}
        >
          {copied ? "已複製" : "複製網址"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .go-unsupported {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.9rem;
    padding: 2rem 1rem;
    text-align: center;
    background: rgb(var(--fill));
    color: rgb(var(--ink));
  }
  .go-unsupported-card {
    max-width: 28rem;
    width: 100%;
  }
  .go-unsupported-title {
    margin: 0 0 0.75rem;
    font-family: var(--pixel);
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .go-unsupported-msg {
    margin: 0 0 0.65rem;
    font-size: 0.95rem;
    color: rgb(var(--muted));
  }
  .go-unsupported-hint {
    margin: 0 0 0.85rem;
    font-size: 0.85rem;
    color: rgb(var(--muted));
    line-height: 1.5;
  }
  .go-unsupported-url {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.4rem 0.6rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    box-shadow: var(--pixel-inset);
  }
  .go-unsupported-code {
    font-family: ui-monospace, "SF Mono", "Noto Sans TC", monospace;
    font-size: 0.78rem;
    word-break: break-all;
    color: rgb(var(--ink));
    flex: 1;
    min-width: 0;
    text-align: start;
  }
  .go-unsupported-copy {
    flex-shrink: 0;
    font-size: 0.78rem;
    min-height: 2.25rem;
    padding: 0.3rem 0.75rem;
  }
</style>
