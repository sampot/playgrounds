<script lang="ts">
  import type { GoBulletin } from "$lib/goBulletin";

  let {
    open = $bindable(false),
    bulletins,
    onDismiss,
  }: {
    open?: boolean;
    bulletins: GoBulletin[];
    onDismiss: (bulletin: GoBulletin) => void;
  } = $props();

  let closeBtn = $state<HTMLButtonElement | null>(null);
  let wasOpen = false;

  $effect(() => {
    if (!open) {
      wasOpen = false;
      return;
    }
    if (!wasOpen) wasOpen = true;
    closeBtn?.focus();
  });

  function close() {
    open = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }
</script>

{#if open}
  <div
    class="bulletin-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="bulletin-board-title"
    tabindex="-1"
    onkeydown={onKeydown}
  >
    <div class="bulletin-board-inner pixel-box">
      <header class="bulletin-board-header">
        <h2 id="bulletin-board-title" class="pixel-text">布告欄</h2>
        <button
          bind:this={closeBtn}
          type="button"
          class="pixel-btn bulletin-board-close"
          onclick={close}
        >
          關閉
        </button>
      </header>
      {#if bulletins.length === 0}
        <p class="bulletin-board-empty">今日休息。有消息會貼在這裡。</p>
      {:else}
        <ul class="bulletin-board-list">
          {#each bulletins as item (item.id)}
            <li class="bulletin-board-item">
              <p class="bulletin-board-item-title">{item.title}</p>
              {#if item.body}
                <p class="bulletin-board-item-body">{item.body}</p>
              {/if}
              <div class="bulletin-board-item-actions">
                {#if item.href}
                  <a class="pixel-btn" href={item.href}>{item.hrefLabel ?? "詳情"}</a>
                {/if}
                {#if item.dismissible}
                  <button
                    type="button"
                    class="pixel-btn"
                    onclick={() => onDismiss(item)}
                  >
                    關閉此則
                  </button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bulletin-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    z-index: 3;
    background: color-mix(in oklab, rgb(var(--ink)) 22%, transparent);
    border-radius: var(--radius);
  }
  .bulletin-board-inner {
    width: 100%;
    max-height: min(70dvh, 28rem);
    overflow: auto;
    padding: 0.85rem 1rem 1rem;
    background: rgb(var(--card));
    border-radius: 0 0 var(--radius) var(--radius);
    border-top: var(--pixel-edge) solid rgb(var(--ink));
  }
  .bulletin-board-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }
  .bulletin-board-header h2 {
    margin: 0;
    font-family: var(--pixel);
    font-size: 0.95rem;
  }
  .bulletin-board-close {
    min-height: 44px;
    min-width: 44px;
  }
  .bulletin-board-empty {
    margin: 0;
    font-size: 0.9rem;
    color: rgb(var(--muted));
    line-height: 1.45;
  }
  .bulletin-board-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }
  .bulletin-board-item {
    border: var(--pixel-edge) solid color-mix(in oklab, rgb(var(--ink)) 22%, transparent);
    border-radius: var(--radius);
    padding: 0.55rem 0.65rem;
  }
  .bulletin-board-item-title {
    margin: 0 0 0.35rem;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .bulletin-board-item-body {
    margin: 0 0 0.45rem;
    font-size: 0.85rem;
    white-space: pre-wrap;
  }
  .bulletin-board-item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .bulletin-board-item-actions :global(a),
  .bulletin-board-item-actions button {
    min-height: 44px;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
</style>
