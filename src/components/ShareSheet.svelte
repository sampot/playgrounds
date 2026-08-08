<script lang="ts">
  import { encodeRosterQrPngDataUrl } from "./playgrounds/roster/rosterQr";
  import {
    canUseWebShare,
    copyShareUrl,
    isShareAbort,
    shareViaWebShare,
  } from "../utils/shareOrCopy";

  type Props = {
    open: boolean;
    title: string;
    url: string;
    /** Host＋path without scheme for short display. */
    spoken?: string;
    hint?: string;
    /**
     * When true, show the URL as a link that opens a new tab
     * (field catalog). go keeps plain spoken text.
     */
    urlAsLink?: boolean;
    onClose: () => void;
    onFlash: (msg: string) => void;
  };

  let {
    open,
    title,
    url,
    spoken = "",
    hint = "請對方用相機掃碼開玩",
    urlAsLink = false,
    onClose,
    onFlash,
  }: Props = $props();

  let canShare = $state(false);
  let qrDataUrl = $state<string | null>(null);
  let qrError = $state("");
  let qrBusy = $state(false);
  let actionBusy = $state(false);
  let dialogEl = $state<HTMLDialogElement | null>(null);

  const displayUrl = $derived(spoken.trim() || url.trim());

  $effect(() => {
    canShare = canUseWebShare();
  });

  $effect(() => {
    if (!open) {
      qrDataUrl = null;
      qrError = "";
      qrBusy = false;
      return;
    }
    const target = url.trim();
    if (!target) {
      qrError = "分享網址為空";
      return;
    }
    let cancelled = false;
    qrBusy = true;
    qrError = "";
    qrDataUrl = null;
    void encodeRosterQrPngDataUrl(target, { scale: 6, border: 2 })
      .then(dataUrl => {
        if (!cancelled) {
          qrDataUrl = dataUrl;
          qrBusy = false;
        }
      })
      .catch(e => {
        if (!cancelled) {
          qrError = e instanceof Error ? e.message : String(e);
          qrBusy = false;
        }
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const el = dialogEl;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
      queueMicrotask(() => {
        el.querySelector<HTMLButtonElement>(".share-sheet-close")?.focus();
      });
    } else if (el.open) {
      el.close();
    }
  });

  function onDialogCancel(e: Event) {
    e.preventDefault();
    onClose();
  }

  async function onSystemShare() {
    if (actionBusy || !canShare) return;
    actionBusy = true;
    try {
      await shareViaWebShare({ title, url });
      onFlash(`已分享「${title}」`);
    } catch (e) {
      if (isShareAbort(e)) return;
      onFlash(e instanceof Error ? e.message : String(e));
    } finally {
      actionBusy = false;
    }
  }

  async function onCopy() {
    if (actionBusy) return;
    actionBusy = true;
    try {
      await copyShareUrl(url);
      onFlash(`已複製連結（${title}）`);
    } catch (e) {
      onFlash(e instanceof Error ? e.message : String(e));
    } finally {
      actionBusy = false;
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  class="share-sheet"
  aria-labelledby="share-sheet-title"
  oncancel={onDialogCancel}
  onclick={e => {
    if (e.target === dialogEl) onClose();
  }}
>
  <div class="share-sheet-panel">
    <header class="share-sheet-head">
      <h2 id="share-sheet-title" class="share-sheet-title">{title}</h2>
      <button
        type="button"
        class="share-sheet-close"
        onclick={onClose}
        aria-label="關閉分享"
      >
        關閉
      </button>
    </header>

    <p class="share-sheet-hint">{hint}</p>

    <div class="share-sheet-qr-wrap" aria-live="polite">
      {#if qrBusy}
        <p class="share-sheet-qr-status">產生 QR…</p>
      {:else if qrDataUrl}
        <img
          class="share-sheet-qr"
          src={qrDataUrl}
          alt={`${title} 分享 QR`}
          width="220"
          height="220"
        />
      {:else}
        <p class="share-sheet-qr-status">
          {qrError || "無法產生 QR，請複製下方連結。"}
        </p>
      {/if}
    </div>

    {#if displayUrl}
      {#if urlAsLink}
        <a
          class="share-sheet-url"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`開啟 ${title}（新分頁）`}
        >
          {displayUrl}
        </a>
      {:else}
        <p class="share-sheet-spoken" aria-label="口誦短網址">{displayUrl}</p>
      {/if}
    {/if}

    <div class="share-sheet-actions">
      {#if canShare}
        <button
          type="button"
          class="share-sheet-btn share-sheet-btn--primary"
          disabled={actionBusy}
          onclick={() => void onSystemShare()}
        >
          系統分享
        </button>
      {/if}
      <button
        type="button"
        class="share-sheet-btn"
        disabled={actionBusy}
        onclick={() => void onCopy()}
      >
        複製連結
      </button>
    </div>
  </div>
</dialog>

<style>
  .share-sheet {
    --ss-fill: var(--fill, var(--color-fill, 248 250 249));
    --ss-ink: var(--ink, var(--color-text-base, 28 35 33));
    --ss-accent: var(--accent, var(--color-accent, 15 118 110));
    --ss-line: var(--line, var(--color-border, 214 222 219));
    --ss-muted: var(--muted, var(--color-text-base, 100 116 112));
    --ss-card: var(--card, var(--color-card, 226 232 230));
    --ss-radius: 0.5rem;
    margin: 0;
    padding: 0;
    border: none;
    max-width: none;
    width: 100%;
    max-height: min(92svh, 40rem);
    background: transparent;
    color: rgb(var(--ss-ink));
  }
  .share-sheet::backdrop {
    background: color-mix(in oklab, rgb(var(--ss-ink)) 45%, transparent);
  }
  .share-sheet[open] {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    position: fixed;
    inset: 0;
  }
  .share-sheet-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-width: 28rem;
    margin: 0 auto;
    padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    border: 1px solid rgb(var(--ss-line));
    border-bottom: none;
    border-radius: calc(var(--ss-radius) + 0.35rem)
      calc(var(--ss-radius) + 0.35rem) 0 0;
    background: rgb(var(--ss-fill));
    box-shadow: 0 -8px 28px color-mix(in oklab, rgb(var(--ss-ink)) 16%, transparent);
  }
  .share-sheet-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .share-sheet-title {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .share-sheet-close {
    flex-shrink: 0;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.35rem 0.75rem;
    border: 1px solid rgb(var(--ss-line));
    border-radius: var(--ss-radius);
    background: rgb(var(--ss-fill));
    color: rgb(var(--ss-ink));
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
  .share-sheet-close:hover,
  .share-sheet-close:focus-visible {
    border-color: rgb(var(--ss-accent));
    color: rgb(var(--ss-accent));
    outline: none;
  }
  .share-sheet-hint {
    margin: 0;
    font-size: 0.85rem;
    color: rgb(var(--ss-muted) / 0.85);
  }
  .share-sheet-qr-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: min(52vw, 14rem);
    padding: 0.75rem;
    border-radius: var(--ss-radius);
    background: #fff;
    border: 1px solid rgb(var(--ss-line));
  }
  .share-sheet-qr {
    display: block;
    width: min(52vw, 14rem);
    height: auto;
    max-width: 100%;
    aspect-ratio: 1;
    image-rendering: pixelated;
  }
  .share-sheet-qr-status {
    margin: 0;
    padding: 1rem;
    text-align: center;
    font-size: 0.85rem;
    color: rgb(var(--ss-muted) / 0.85);
  }
  .share-sheet-spoken,
  .share-sheet-url {
    margin: 0;
    padding: 0.55rem 0.65rem;
    border-radius: var(--ss-radius);
    background: color-mix(in oklab, rgb(var(--ss-card)) 70%, rgb(var(--ss-fill)));
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.35;
    word-break: break-all;
    text-align: center;
  }
  .share-sheet-url {
    display: block;
    color: rgb(var(--ss-accent));
    text-decoration: underline;
    text-underline-offset: 0.15em;
    min-height: 2.75rem;
    box-sizing: border-box;
  }
  .share-sheet-url:hover,
  .share-sheet-url:focus-visible {
    outline: none;
    background: color-mix(in oklab, rgb(var(--ss-accent)) 12%, rgb(var(--ss-fill)));
  }
  .share-sheet-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .share-sheet-btn {
    min-height: 2.75rem;
    padding: 0.45rem 0.85rem;
    border: 1px solid rgb(var(--ss-line));
    border-radius: var(--ss-radius);
    background: rgb(var(--ss-fill));
    color: rgb(var(--ss-ink));
    font: inherit;
    font-size: 0.95rem;
    font-weight: 650;
    cursor: pointer;
  }
  .share-sheet-btn:hover:not(:disabled),
  .share-sheet-btn:focus-visible:not(:disabled) {
    border-color: rgb(var(--ss-accent));
    color: rgb(var(--ss-accent));
    outline: none;
  }
  .share-sheet-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .share-sheet-btn--primary {
    border-color: color-mix(in oklab, rgb(var(--ss-accent)) 55%, rgb(var(--ss-line)));
    background: color-mix(in oklab, rgb(var(--ss-accent)) 16%, rgb(var(--ss-fill)));
    color: rgb(var(--ss-ink));
  }
  @media (min-width: 40rem) {
    .share-sheet[open] {
      justify-content: center;
      padding: 1rem;
    }
    .share-sheet-panel {
      border-radius: calc(var(--ss-radius) + 0.35rem);
      border-bottom: 1px solid rgb(var(--ss-line));
      max-width: 24rem;
    }
    .share-sheet-actions {
      flex-direction: row;
    }
    .share-sheet-btn {
      flex: 1;
    }
  }
</style>
