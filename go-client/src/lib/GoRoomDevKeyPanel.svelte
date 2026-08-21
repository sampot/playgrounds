<script lang="ts">
  /**
   * Localhost-only paste panel for /room Host when not yet logged in.
   * Logged-in reveal／copy／remember lives in GoProfilePanel.
   */
  import { goAuth } from "./goAuth.svelte";
  import {
    goRoomDevPageEnabled,
    writeGoRoomDevRememberedKey,
  } from "./goRoomDev";

  let {
    onApplied,
  }: {
    /** Called after a key is successfully applied (so Host can openBooth／mint). */
    onApplied?: () => void;
  } = $props();

  const enabled = $derived(goRoomDevPageEnabled());
  let draft = $state("");
  let error = $state("");
  let busy = $state(false);

  async function applyKey(key: string) {
    if (busy) return;
    error = "";
    busy = true;
    try {
      await goAuth.applyFieldApiKey(key);
      writeGoRoomDevRememberedKey(key, { enabled: true });
      draft = "";
      onApplied?.();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function onSubmit(ev: Event) {
    ev.preventDefault();
    await applyKey(draft);
  }
</script>

{#if enabled && !goAuth.loggedIn}
  <section class="dev-key" data-testid="room-dev-key-panel" aria-label="開發通行證">
    <p class="dev-key-title">開發通行證（僅 localhost）</p>
    <p class="dev-key-lede">
      貼上 <code>pg_sk_…</code>（從已登入 tab「我的身分」複製），免開 DevTools。
    </p>
    <form class="dev-key-form" onsubmit={(e) => void onSubmit(e)}>
      <label class="dev-key-field">
        <span class="sr-only">field API key</span>
        <input
          class="pixel-input"
          type="password"
          name="dev_api_key"
          autocomplete="off"
          spellcheck="false"
          placeholder="pg_sk_…"
          bind:value={draft}
          disabled={busy || goAuth.busy}
          data-testid="room-dev-key-input"
        />
      </label>
      <button
        type="submit"
        class="pixel-btn pixel-btn--primary"
        disabled={busy || goAuth.busy || !draft.trim()}
        data-testid="room-dev-key-apply"
      >
        {busy || goAuth.busy ? "套用中…" : "套用並記住"}
      </button>
    </form>
    {#if error}
      <p class="dev-key-err" role="alert">{error}</p>
    {/if}
  </section>
{/if}

<style>
  .dev-key {
    margin: 0.75rem 0 0;
    padding: 0.75rem 0.85rem;
    border: 1px dashed color-mix(in oklab, CanvasText 35%, transparent);
    border-radius: 0.35rem;
    background: color-mix(in oklab, Canvas 92%, CanvasText);
  }
  .dev-key-title {
    margin: 0 0 0.35rem;
    font-size: 0.8rem;
    font-weight: 700;
  }
  .dev-key-lede {
    margin: 0 0 0.55rem;
    font-size: 0.75rem;
    line-height: 1.35;
    opacity: 0.85;
  }
  .dev-key-lede code {
    font-size: 0.7rem;
  }
  .dev-key-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .dev-key-field {
    display: block;
  }
  .dev-key-field .pixel-input {
    width: 100%;
    box-sizing: border-box;
    min-height: 2.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
  }
  .dev-key-form .pixel-btn {
    min-height: 2.75rem;
  }
  .dev-key-err {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    color: #b00020;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (min-width: 480px) {
    .dev-key-form {
      flex-direction: row;
      align-items: stretch;
    }
    .dev-key-field {
      flex: 1;
      min-width: 0;
    }
  }
</style>
