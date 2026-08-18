<script lang="ts">
  type BossMenuChoice = "banter" | "cabinets" | "help";

  let {
    open = $bindable(false),
    onChoose,
  }: {
    open?: boolean;
    onChoose: (choice: BossMenuChoice) => void;
  } = $props();

  let firstBtn = $state<HTMLButtonElement | null>(null);
  let wasOpen = false;

  $effect(() => {
    if (!open) {
      wasOpen = false;
      return;
    }
    if (!wasOpen) wasOpen = true;
    firstBtn?.focus();
  });

  function close() {
    open = false;
  }

  function pick(choice: BossMenuChoice) {
    onChoose(choice);
    close();
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
    class="boss-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="boss-dialog-title"
    tabindex="-1"
    onkeydown={onKeydown}
  >
    <div class="boss-dialog pixel-box">
      <p id="boss-dialog-title" class="boss-dialog-title pixel-text">老闆</p>
      <ul class="boss-dialog-list">
        <li>
          <button
            bind:this={firstBtn}
            type="button"
            class="pixel-btn"
            onclick={() => pick("banter")}
          >
            隨便說說
          </button>
        </li>
        <li>
          <button type="button" class="pixel-btn" onclick={() => pick("cabinets")}>
            今日有什麼
          </button>
        </li>
        <li>
          <button type="button" class="pixel-btn" onclick={() => pick("help")}>
            怎麼玩
          </button>
        </li>
      </ul>
      <button type="button" class="boss-dialog-cancel pixel-btn" onclick={close}>
        先不用
      </button>
    </div>
  </div>
{/if}

<style>
  .boss-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    z-index: 3;
    background: color-mix(in oklab, rgb(var(--ink)) 22%, transparent);
    border-radius: var(--radius);
  }
  .boss-dialog {
    width: 100%;
    padding: 0.85rem 1rem 1rem;
    background: rgb(var(--card));
    border-radius: 0 0 var(--radius) var(--radius);
    border-top: var(--pixel-edge) solid rgb(var(--ink));
  }
  .boss-dialog-title {
    margin: 0 0 0.65rem;
    font-family: var(--pixel);
    font-size: 0.95rem;
    font-weight: 700;
  }
  .boss-dialog-list {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }
  .boss-dialog-list button,
  .boss-dialog-cancel {
    width: 100%;
    min-height: 44px;
  }
  .boss-dialog-cancel {
    opacity: 0.9;
  }
</style>
