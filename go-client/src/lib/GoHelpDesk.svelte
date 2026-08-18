<script lang="ts">
  import { helpDeskIsLast, helpDeskLineAt, nextHelpDeskIndex } from "$lib/goHelpDesk";

  let {
    open = $bindable(false),
  }: {
    open?: boolean;
  } = $props();

  let index = $state(0);
  let nextBtn = $state<HTMLButtonElement | null>(null);
  let wasOpen = false;
  let line = $derived(helpDeskLineAt(index));
  let last = $derived(helpDeskIsLast(index));

  $effect(() => {
    if (!open) {
      wasOpen = false;
      return;
    }
    if (!wasOpen) {
      index = 0;
      wasOpen = true;
    }
    nextBtn?.focus();
  });

  function close() {
    open = false;
  }

  function next() {
    if (last) {
      close();
      return;
    }
    index = nextHelpDeskIndex(index);
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
    class="help-desk-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="help-desk-speaker"
    aria-describedby="help-desk-text"
    tabindex="-1"
    onkeydown={onKeydown}
  >
    <div class="help-desk pixel-box">
      <p id="help-desk-speaker" class="help-desk-speaker pixel-text">{line.speaker}</p>
      <p id="help-desk-text" class="help-desk-text">{line.text}</p>
      <div class="help-desk-actions">
        <button
          bind:this={nextBtn}
          type="button"
          class="pixel-btn help-desk-next"
          onclick={next}
        >
          {last ? "知道了" : "下一則"}
        </button>
        {#if !last}
          <button type="button" class="pixel-btn help-desk-leave" onclick={close}>
            先走了
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .help-desk-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    z-index: 2;
    background: color-mix(in oklab, rgb(var(--ink)) 22%, transparent);
    border-radius: var(--radius);
  }
  .help-desk {
    width: 100%;
    padding: 0.7rem 0.8rem 0.8rem;
    background: rgb(var(--card));
    border-radius: 0 0 var(--radius) var(--radius);
    border-top: var(--pixel-edge) solid rgb(var(--ink));
  }
  .help-desk-speaker {
    margin: 0 0 0.35rem;
    font-family: var(--pixel);
    font-size: 0.85rem;
    font-weight: 700;
  }
  .help-desk-text {
    margin: 0 0 0.7rem;
    font-size: 0.9rem;
    line-height: 1.4;
    min-height: 3.6em;
  }
  .help-desk-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .help-desk-next,
  .help-desk-leave {
    min-height: 44px;
    flex: 1 1 7rem;
  }
  .help-desk-leave {
    opacity: 0.9;
  }
</style>
