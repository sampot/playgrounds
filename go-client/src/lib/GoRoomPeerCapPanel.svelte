<script lang="ts">
  import { chromeSession } from "$lib/chromeSession.svelte";

  let {
    joinUrl = null,
    expiresAt = null,
    onMint,
    onRevoke,
  }: {
    joinUrl?: string | null;
    expiresAt?: number | null;
    onMint?: (label: string) => void | Promise<void>;
    onRevoke?: () => void | Promise<void>;
  } = $props();

  let label = $state("監控鏡頭");
  let busy = $state(false);

  const expired = $derived(
    typeof expiresAt === "number" && expiresAt > 0 && Date.now() > expiresAt
  );

  async function mint() {
    if (!onMint || busy) return;
    busy = true;
    try {
      await onMint(label.trim() || "監控");
    } finally {
      busy = false;
    }
  }

  async function revoke() {
    if (!onRevoke || busy) return;
    busy = true;
    try {
      await onRevoke();
    } finally {
      busy = false;
    }
  }

  async function copyUrl() {
    if (!joinUrl?.trim()) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      chromeSession.setFlash("已複製監控連結", 2200);
    } catch {
      chromeSession.setFlash("無法複製連結", 2800);
    }
  }
</script>

<section class="peer-cap-panel" aria-label="監控 Peer">
  <h2 class="peer-cap-title">監控 Peer</h2>
  <p class="peer-cap-hint">
    產生一次性連結，讓額外鏡頭或 CLI（pg-boothd peer）加入 roster。
  </p>

  {#if !joinUrl || expired}
    <label class="peer-cap-field">
      <span>標籤</span>
      <input type="text" bind:value={label} maxlength="32" autocomplete="off" />
    </label>
    <button type="button" class="peer-cap-primary" disabled={busy} onclick={mint}>
      {busy ? "產生中…" : "產生監控連結"}
    </button>
  {:else}
    <p class="peer-cap-live" role="status">監控連結有效中</p>
    <div class="peer-cap-actions">
      <button type="button" class="peer-cap-primary" onclick={copyUrl}>
        複製連結
      </button>
      <button
        type="button"
        class="peer-cap-secondary"
        disabled={busy}
        onclick={revoke}
      >
        撤銷
      </button>
    </div>
    <p class="peer-cap-url">{joinUrl}</p>
  {/if}
</section>

<style>
  .peer-cap-panel {
    margin: 0.75rem 1rem 0;
    padding: 0.85rem 1rem;
    border: 1px solid rgb(var(--border, 60 60 60) / 0.35);
    border-radius: 0.65rem;
    background: rgb(var(--surface, 20 20 24) / 0.55);
  }
  .peer-cap-title {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .peer-cap-hint {
    margin: 0 0 0.75rem;
    font-size: 0.82rem;
    opacity: 0.85;
    line-height: 1.45;
  }
  .peer-cap-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.65rem;
    font-size: 0.85rem;
  }
  .peer-cap-field input {
    min-height: 2.75rem;
    padding: 0.5rem 0.65rem;
    border-radius: 0.45rem;
    border: 1px solid rgb(var(--border, 80 80 80) / 0.5);
    background: rgb(var(--bg, 10 10 12));
    color: inherit;
  }
  .peer-cap-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .peer-cap-primary,
  .peer-cap-secondary {
    min-height: 2.75rem;
    padding: 0.45rem 0.85rem;
    border-radius: 0.45rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .peer-cap-primary {
    border: none;
    background: rgb(var(--accent, 180 80 40));
    color: rgb(var(--accent-fg, 255 255 255));
  }
  .peer-cap-secondary {
    border: 1px solid rgb(var(--border, 80 80 80) / 0.55);
    background: transparent;
    color: inherit;
  }
  .peer-cap-live {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
  }
  .peer-cap-url {
    margin: 0;
    font-size: 0.75rem;
    word-break: break-all;
    opacity: 0.7;
  }
</style>
