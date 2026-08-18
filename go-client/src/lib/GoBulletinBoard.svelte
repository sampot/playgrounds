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

  let dialogEl = $state<HTMLDialogElement | null>(null);

  $effect(() => {
    const el = dialogEl;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  });

  function close() {
    open = false;
  }
</script>

<dialog
  bind:this={dialogEl}
  class="bulletin-board"
  aria-labelledby="bulletin-board-title"
  onclose={close}
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <div class="bulletin-board-inner pixel-box">
    <header class="bulletin-board-header">
      <h2 id="bulletin-board-title" class="pixel-text">布告欄</h2>
      <button type="button" class="pixel-btn bulletin-board-close" onclick={close}>
        關閉
      </button>
    </header>
    {#if bulletins.length === 0}
      <p class="bulletin-board-empty">目前沒有公告。</p>
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
</dialog>

<style>
  .bulletin-board {
    border: none;
    padding: 0;
    max-width: min(100vw - 1.5rem, 24rem);
    background: transparent;
  }
  .bulletin-board::backdrop {
    background: color-mix(in oklab, rgb(var(--ink)) 35%, transparent);
  }
  .bulletin-board-inner {
    padding: 0.85rem 1rem 1rem;
    background: rgb(var(--card));
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
