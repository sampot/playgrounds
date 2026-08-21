<script lang="ts">
  import type { RoomPlayableGame } from "$lib/goRoomPlayBootstrap";

  let {
    open = $bindable(false),
    games,
    onPick,
  }: {
    open?: boolean;
    games: RoomPlayableGame[];
    onPick: (catalogId: string) => void | Promise<void>;
  } = $props();

  let closeBtn = $state<HTMLButtonElement | null>(null);
  let wasOpen = false;

  $effect(() => {
    if (!open) {
      wasOpen = false;
      return;
    }
    if (!wasOpen) {
      wasOpen = true;
      queueMicrotask(() => closeBtn?.focus());
    }
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

  async function pick(catalogId: string) {
    close();
    await onPick(catalogId);
  }
</script>

{#if open}
  <div
    class="play-picker-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="play-picker-title"
    tabindex="-1"
    onkeydown={onKeydown}
    onclick={(e) => {
      if (e.currentTarget === e.target) close();
    }}
  >
    <div class="play-picker pixel-frame confirm">
      <header class="play-picker-header">
        <h2 id="play-picker-title" class="confirm-title pixel-text">玩遊戲</h2>
        <button
          type="button"
          class="pixel-btn play-picker-close"
          bind:this={closeBtn}
          onclick={close}
        >
          關閉
        </button>
      </header>
      <p class="confirm-body muted">選一款掛上大螢幕。人數不夠會無法開局。</p>
      {#if games.length === 0}
        <p class="confirm-body" role="status">目前沒有可開的遊戲</p>
      {:else}
        <ul class="play-picker-list">
          {#each games as g (g.catalogId)}
            <li>
              <button
                type="button"
                class="play-picker-item pixel-btn"
                onclick={() => void pick(g.catalogId)}
              >
                <span class="play-picker-item-title">{g.title}</span>
                <span class="play-picker-item-meta">需 {g.seatCount} 人</span>
                {#if g.blurb}
                  <span class="play-picker-item-blurb">{g.blurb}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .play-picker-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0.75rem;
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
    background: color-mix(in oklab, rgb(var(--ink)) 45%, transparent);
  }
  .play-picker {
    width: min(28rem, 100%);
    max-height: min(70vh, 32rem);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow: hidden;
    background: var(--panel, #fff);
  }
  .play-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .play-picker-header .confirm-title {
    margin: 0;
  }
  .play-picker-close {
    min-height: 44px;
    min-width: 44px;
    flex: 0 0 auto;
  }
  .muted {
    color: color-mix(in oklab, currentColor 62%, transparent);
  }
  .play-picker-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-height: 0;
  }
  .play-picker-item {
    width: 100%;
    min-height: 44px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    text-align: left;
    padding: 0.65rem 0.75rem;
  }
  .play-picker-item-title {
    font-weight: 700;
  }
  .play-picker-item-meta {
    font-size: 0.85rem;
    opacity: 0.85;
  }
  .play-picker-item-blurb {
    font-size: 0.8rem;
    opacity: 0.7;
    line-height: 1.35;
  }
  @media (min-width: 40rem) {
    .play-picker-overlay {
      align-items: center;
    }
  }
</style>
