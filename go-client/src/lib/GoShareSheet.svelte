<script lang="ts">
  import { encodeRosterQrPngDataUrl } from "@pg/roster/rosterQr";
  import {
    canUseWebShare,
    copyShareUrl,
    isShareAbort,
    shareViaWebShare,
  } from "@utils/shareOrCopy";

  type Props = {
    open: boolean;
    title: string;
    url: string;
    /** Host＋path without scheme for spoken short form. */
    spoken?: string;
    onClose: () => void;
    onFlash: (msg: string) => void;
  };

  let { open, title, url, spoken = "", onClose, onFlash }: Props = $props();

  let canShare = $state(false);
  let qrDataUrl = $state<string | null>(null);
  let qrError = $state("");
  let qrBusy = $state(false);
  let actionBusy = $state(false);
  let dialogEl = $state<HTMLDialogElement | null>(null);

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
      // Focus close — keyboard／a11y; avoid trapping system share.
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

    <p class="share-sheet-hint">請對方用相機掃碼開玩</p>

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

    {#if spoken}
      <p class="share-sheet-spoken" aria-label="口誦短網址">{spoken}</p>
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
