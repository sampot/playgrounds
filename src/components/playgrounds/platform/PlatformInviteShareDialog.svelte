<script lang="ts">
  import { encodeRosterQrPngDataUrl } from "../roster/rosterQr";
  import type { PlatformInviteSharePayload } from "./platformInviteShareShell";

  let {
    open = $bindable(false),
    payload = $bindable<PlatformInviteSharePayload | null>(null),
  }: {
    open?: boolean;
    payload?: PlatformInviteSharePayload | null;
  } = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let qrUrl = $state<string | null>(null);
  let copyFlash = $state<string | null>(null);
  let qrBusy = $state(false);

  const shortUrl = $derived(payload?.shortUrl?.trim() || "");
  const title = $derived(payload?.title?.trim() || "邀請對手");
  const isHandshakeOnly = $derived(payload?.kind === "signal.handshake");
  const linkLabel = $derived(isHandshakeOnly ? "邀請連結" : "短網址");
  const hint = $derived(
    payload?.hint?.trim() ||
      (isHandshakeOnly
        ? "對方掃描 QR 或開啟連結即可連上。只建立連線，不會自動加入任何局。"
        : "對手無需註冊。請保持本頁在線以完成連線。")
  );

  $effect(() => {
    if (open && dialogEl && !dialogEl.open) {
      queueMicrotask(() => dialogEl?.showModal());
    }
    if (!open && dialogEl?.open) {
      dialogEl.close();
    }
  });

  $effect(() => {
    const url = shortUrl;
    if (!open || !url) {
      qrUrl = null;
      return;
    }
    let cancelled = false;
    qrBusy = true;
    void encodeRosterQrPngDataUrl(url)
      .then(dataUrl => {
        if (!cancelled) qrUrl = dataUrl;
      })
      .catch(() => {
        if (!cancelled) qrUrl = null;
      })
      .finally(() => {
        if (!cancelled) qrBusy = false;
      });
    return () => {
      cancelled = true;
    };
  });

  function onDialogClose(): void {
    open = false;
    copyFlash = null;
  }

  async function copyShortUrl(): Promise<void> {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      copyFlash = "已複製連結";
    } catch {
      copyFlash = "請手動選取複製";
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  class="playgrounds-dialog border-skin-line bg-skin-fill text-skin-base m-auto w-[min(22rem,calc(100%-1.5rem))] max-h-[min(36rem,calc(100%-1.5rem))] rounded-xl border p-0 shadow-2xl backdrop:bg-black/55"
  aria-labelledby="pg-invite-share-title"
  onclose={onDialogClose}
>
  <div class="playgrounds-dialog-head">
    <div class="playgrounds-dialog-title-row">
      <h2 id="pg-invite-share-title" class="m-0 text-base font-semibold">
        {title}
      </h2>
    </div>
    <button
      type="button"
      class="text-skin-base/60 hover:text-skin-base min-h-11 min-w-11 rounded-md px-2 text-sm"
      onclick={() => dialogEl?.close()}
    >
      關閉
    </button>
  </div>

  <div class="flex flex-col gap-3 px-4 py-3">
    <p class="text-skin-base/55 m-0 text-[12px] leading-relaxed">{hint}</p>

    <div
      class="border-skin-line bg-skin-card flex min-h-[11rem] items-center justify-center rounded-lg border p-3"
    >
      {#if qrUrl}
        <img
          src={qrUrl}
          alt={isHandshakeOnly ? "邀請連線 QR" : "邀請短網址 QR"}
          class="h-44 w-44 max-w-full rounded bg-white p-2"
          width="176"
          height="176"
        />
      {:else if qrBusy}
        <p class="text-skin-base/45 m-0 text-xs" role="status">產生 QR…</p>
      {:else}
        <p class="text-skin-base/45 m-0 text-xs">無法產生 QR，請用下方連結</p>
      {/if}
    </div>

    <label class="flex flex-col gap-1">
      <span class="text-skin-base/50 text-[11px]">{linkLabel}</span>
      <input
        class="border-skin-line bg-skin-fill text-skin-base min-h-11 w-full rounded-md border px-2.5 font-mono text-[11px]"
        type="text"
        readonly
        value={shortUrl}
        onclick={e => (e.currentTarget as HTMLInputElement).select()}
      />
    </label>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="bg-skin-accent text-skin-inverted min-h-11 flex-1 rounded-md px-3 text-sm font-semibold disabled:opacity-40"
        disabled={!shortUrl}
        onclick={() => void copyShortUrl()}
      >
        複製連結
      </button>
      <button
        type="button"
        class="border-skin-line bg-skin-card text-skin-base min-h-11 rounded-md border px-3 text-sm"
        onclick={() => dialogEl?.close()}
      >
        完成
      </button>
    </div>

    {#if copyFlash}
      <p class="text-skin-accent m-0 text-[11px]" role="status">{copyFlash}</p>
    {/if}

    {#if payload?.expiresAt}
      <p class="text-skin-base/40 m-0 text-[10px]">
        約於 {payload.expiresAt} 前有效（邀請預設數分鐘）
      </p>
    {/if}
  </div>
</dialog>
