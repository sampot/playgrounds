<script lang="ts">
  import { goBrowserSupports, goBrowserUnsupportedMessage } from "$lib/goCanvasSupport";

  let copied = $state(false);

  const support = goBrowserSupports();
  const message = goBrowserUnsupportedMessage(support) ?? "";
  const pageUrl = typeof location !== "undefined" ? location.href : "";

  /**
   * Copy the *current page URL* to the clipboard so the player can paste it
   * into a system browser. Falls back to `execCommand` when the Clipboard API
   * is unavailable (common inside the very in-app browsers we gate for).
   */
  function copyPageUrl() {
    void copyText(pageUrl)
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
  <div class="go-browser-banner" role="alert" aria-live="polite">
    <span class="go-browser-banner-msg">{message}</span>
    <button
      type="button"
      class="go-browser-banner-copy"
      onclick={copyPageUrl}
      aria-label={copied ? "已複製" : "複製連結"}
      title="複製此頁連結到剪貼簿"
    >
      {copied ? "已複製" : "複製網址"}
    </button>
  </div>
{/if}

<style>
  .go-browser-banner {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-height: 0;
    overflow: hidden;
    padding: 0 0.75rem;
    font-size: 0.82rem;
    color: rgb(var(--ink));
    background: color-mix(in oklab, rgb(220 38 38 / 0.12), transparent 40%);
    border-bottom: 1px dashed rgb(var(--line));
    transition: max-height 0.22s ease;
  }
  .go-browser-banner:has(.go-browser-banner-copy) {
    max-height: 3.25rem;
    padding: 0.5rem 0.75rem;
  }
  .go-browser-banner-msg {
    flex: 1 1 auto;
    line-height: 1.4;
  }
  .go-browser-banner-copy {
    flex-shrink: 0;
    min-height: 2.25rem;
    padding: 0.3rem 0.75rem;
    border: 1px solid rgb(var(--accent));
    border-radius: var(--radius);
    background: rgb(var(--accent));
    color: #fff;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 650;
    cursor: pointer;
  }
  .go-browser-banner-copy:hover,
  .go-browser-banner-copy:focus-visible {
    filter: brightness(1.05);
    outline: none;
  }
</style>
