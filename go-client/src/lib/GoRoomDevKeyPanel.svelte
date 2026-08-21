<script lang="ts">
  import { goAuth } from "./goAuth.svelte";
  import {
    goRoomDevPageEnabled,
    readGoRoomDevRememberedKey,
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
  let hint = $state("");
  let busy = $state(false);
  let hydrated = $state(false);

  $effect(() => {
    if (!enabled || hydrated || goAuth.loggedIn) return;
    const remembered = readGoRoomDevRememberedKey({ enabled: true });
    if (!remembered) {
      hydrated = true;
      return;
    }
    hydrated = true;
    void applyKey(remembered, { remember: true, silent: true });
  });

  async function applyKey(
    key: string,
    opts?: { remember?: boolean; silent?: boolean }
  ) {
    if (busy) return;
    error = "";
    hint = "";
    busy = true;
    try {
      await goAuth.applyFieldApiKey(key);
      if (opts?.remember !== false) {
        writeGoRoomDevRememberedKey(key, { enabled: true });
      }
      draft = "";
      if (!opts?.silent) hint = "已套用並記住（僅本機開發）";
      onApplied?.();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function onSubmit(ev: Event) {
    ev.preventDefault();
    await applyKey(draft, { remember: true });
  }

  async function onRemember() {
    const key = goAuth.getPlatformApiKeyForHostLoop();
    if (!key) {
      error = "目前沒有可用的 key";
      return;
    }
    writeGoRoomDevRememberedKey(key, { enabled: true });
    hint = "已記住到本機；之後開包廂會自動登入";
    error = "";
  }

  async function onCopy() {
    const key = goAuth.getPlatformApiKeyForHostLoop();
    if (!key) {
      error = "目前沒有可用的 key";
      return;
    }
    try {
      await navigator.clipboard.writeText(key);
      hint = "已複製 field API key";
      error = "";
    } catch {
      error = "無法複製，請用開發者工具讀 sessionStorage";
    }
  }

  function onForget() {
    writeGoRoomDevRememberedKey(null, { enabled: true });
    hint = "已清除本機記住的 key";
    error = "";
  }
</script>

{#if enabled}
  <section class="dev-key" data-testid="room-dev-key-panel" aria-label="開發通行證">
    <p class="dev-key-title">開發通行證（僅 localhost）</p>
    {#if goAuth.loggedIn}
      <p class="dev-key-lede">
        已登入。可記住到本機，之後免再 SSO；或複製給 Agent／另一台。
      </p>
      <div class="dev-key-actions">
        <button
          type="button"
          class="pixel-btn pixel-btn--primary"
          disabled={busy || goAuth.busy}
          onclick={() => void onRemember()}
        >
          記住到本機
        </button>
        <button
          type="button"
          class="pixel-btn"
          disabled={busy || goAuth.busy}
          onclick={() => void onCopy()}
        >
          複製 key
        </button>
        <button
          type="button"
          class="pixel-btn"
          disabled={busy}
          onclick={onForget}
        >
          清除記住
        </button>
      </div>
    {:else}
      <p class="dev-key-lede">
        貼上 <code>pg_sk_…</code>（從已登入 tab「複製 key」取得），免開 DevTools。
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
    {/if}
    {#if error}
      <p class="dev-key-err" role="alert">{error}</p>
    {/if}
    {#if hint}
      <p class="dev-key-hint" role="status">{hint}</p>
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
  }
  .dev-key-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .dev-key-actions .pixel-btn,
  .dev-key-form .pixel-btn {
    min-height: 2.75rem;
  }
  .dev-key-err {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    color: #b00020;
  }
  .dev-key-hint {
    margin: 0.5rem 0 0;
    font-size: 0.75rem;
    opacity: 0.85;
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
