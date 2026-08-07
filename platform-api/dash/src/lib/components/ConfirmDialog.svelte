<script lang="ts">
  type Props = {
    open: boolean;
    title?: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    requireCheck?: boolean;
    checkLabel?: string;
    oncancel: () => void;
    onconfirm: () => void;
  };

  let {
    open,
    title = "確認",
    message,
    confirmLabel = "確認",
    danger = true,
    requireCheck = false,
    checkLabel = "我了解後果",
    oncancel,
    onconfirm,
  }: Props = $props();

  let checked = $state(false);

  $effect(() => {
    if (open) checked = false;
  });
</script>

{#if open}
  <div
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
  >
    <div class="dialog">
      <h3 id="confirm-title">{title}</h3>
      <p>{message}</p>
      {#if requireCheck}
        <label class="check">
          <input type="checkbox" bind:checked />
          <span>{checkLabel}</span>
        </label>
      {/if}
      <div class="row">
        <button type="button" class="secondary" onclick={oncancel}>取消</button>
        <button
          type="button"
          class={danger ? "danger" : ""}
          disabled={requireCheck && !checked}
          onclick={onconfirm}>{confirmLabel}</button
        >
      </div>
    </div>
  </div>
{/if}
