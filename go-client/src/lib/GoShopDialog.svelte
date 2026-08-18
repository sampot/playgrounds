<script lang="ts">
  type BossMenuChoice = "banter" | "cabinets" | "help";

  let {
    open = $bindable(false),
    onChoose,
  }: {
    open?: boolean;
    onChoose: (choice: BossMenuChoice) => void;
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

  function pick(choice: BossMenuChoice) {
    onChoose(choice);
    close();
  }
</script>

<dialog
  bind:this={dialogEl}
  class="boss-dialog-wrap"
  aria-labelledby="boss-dialog-title"
  onclose={close}
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <div class="boss-dialog pixel-box">
    <p id="boss-dialog-title" class="boss-dialog-title pixel-text">老闆</p>
    <ul class="boss-dialog-list">
      <li>
        <button type="button" class="pixel-btn" onclick={() => pick("banter")}>
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
</dialog>

<style>
  .boss-dialog-wrap {
    border: none;
    padding: 0;
    max-width: min(100vw - 1.5rem, 18rem);
    background: transparent;
  }
  .boss-dialog-wrap::backdrop {
    background: color-mix(in oklab, rgb(var(--ink)) 35%, transparent);
  }
  .boss-dialog {
    width: 100%;
    padding: 0.85rem 1rem 1rem;
    background: rgb(var(--card));
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
