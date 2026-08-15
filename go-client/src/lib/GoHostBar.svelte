<script lang="ts">
   /**
   * Go 主場「邀請對弈」條（GO-INVITE §6.6）。
   *
   * - 閒置（未開場）：正常排版邀請條，點擊→開場＋鑄邀請。
   * - 開場後：顯示階段（等待對手／對局中…）＋「開始」「再來一局」「結束」。
   *
   * 未登入點擊 → `onLoginNeeded()`（頁面轉登入，不 alert）。
   * 不再使用浮動 FAB（移除「登入後邀請對弈」chip）。
   */

  import type { HostInviteController } from "./hostInviteBind.svelte";

  type Props = {
    loggedIn: boolean;
    controller: HostInviteController | null;
    busy: boolean;
    onInvite: () => void;
    onLoginNeeded: () => void;
    onStart: () => void;
    onReset: () => void;
    onClose: () => void;
  };

  let {
    loggedIn,
    controller,
    busy,
    onInvite,
    onLoginNeeded,
    onStart,
    onReset,
    onClose,
  }: Props = $props();

  let phase = $state("idle");
  let busySelf = $state(false);

  $effect(() => {
    const c = controller;
    if (!c) return;
    return c.subscribe(s => {
      phase = s.phase;
      busySelf = false;
    });
  });

  const live = $derived(
    phase !== "idle" && phase !== "error" && phase !== "closed"
  );

  function onPrimary() {
    if (busySelf) return;
    if (!loggedIn) {
      onLoginNeeded();
      return;
    }
    busySelf = true;
    onInvite();
  }

  const busyAll = $derived(busySelf || busy);
</script>

<div class="hostbar {live ? 'hostbar--live' : ''}" role="region" aria-label="邀請對弈狀態">
  {#if live}
    <p class="hostbar-msg" role="status">
      {#if phase === "waiting" || phase === "open"}
        已開場 — 按「邀請對弈」取得短網址
      {:else if phase === "active"}
        對局進行中
      {:else if phase === "ended"}
        對局已結束
      {:else if phase === "ready"}
        對手已入座 — 可開始下棋
      {:else}
        等待對手入座…
      {/if}
    </p>
  {:else}
    <p class="hostbar-msg" role="status">
      {loggedIn ? "想找人對弈？開一局並取得邀請短網址" : "登入後可開局邀請對弈"}
    </p>
  {/if}
  <div class="hostbar-actions">
    {#if phase === "active" || phase === "ended"}
      <button
        type="button"
        class="hostbtn"
        disabled={busyAll}
        onclick={onReset}
      >
        再來一局
      </button>
    {:else if phase === "ready"}
      <button
        type="button"
        class="hostbtn hostbtn--primary"
        disabled={busyAll}
        onclick={onStart}
      >
        開始
      </button>
    {:else if live}
      <button
        type="button"
        class="hostbtn hostbtn--primary"
        disabled={busyAll}
        onclick={onPrimary}
      >
        {busyAll ? "產生中…" : "邀請對手"}
      </button>
    {:else}
      <button
        type="button"
        class="hostbtn hostbtn--primary"
        disabled={busyAll}
        onclick={onPrimary}
      >
        {busyAll ? "產生中…" : loggedIn ? "邀請對弈" : "登入後邀請對弈"}
      </button>
    {/if}
    {#if live}
      <button type="button" class="hostbtn" disabled={busyAll} onclick={onClose}>
        結束
      </button>
    {/if}
  </div>
</div>

<style>
  .hostbar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.45rem;
    width: 100%;
    max-width: 40rem;
    margin: 0 auto 0.5rem;
    padding: 0.85rem 1rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background:
      linear-gradient(
        180deg,
        color-mix(in oklab, rgb(var(--gold-soft)) 16%, transparent) 0,
        transparent 55%
      ),
      rgb(var(--card));
    box-shadow: var(--pixel-shadow);
  }
  .hostbar--live {
    gap: 0.65rem;
    border-color: rgb(var(--accent));
  }
  .hostbar-msg {
    margin: 0;
    font-family: var(--pixel);
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: rgb(var(--ink));
    text-align: center;
  }
  .hostbar-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .hostbtn {
    min-height: 2.75rem;
    min-width: 2.75rem;
    padding: 0.4rem 0.9rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--pixel-shadow);
    -webkit-tap-highlight-color: color-mix(
      in oklab,
      rgb(var(--accent)) 24%,
      transparent
    );
    transition:
      transform 0.06s steps(2),
      box-shadow 0.06s steps(2),
      border-color 0.12s steps(2);
  }
  .hostbtn:hover:not(:disabled),
  .hostbtn:focus-visible:not(:disabled) {
    border-color: rgb(var(--accent));
    color: rgb(var(--accent));
    outline: none;
    animation: pixel-blink 0.9s steps(2) infinite;
  }
  .hostbtn:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 0 0 0 rgb(var(--ink));
  }
  .hostbtn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .hostbtn--primary {
    background: rgb(var(--accent));
    border-color: rgb(var(--ink));
    color: #fff;
  }
  :global(html[data-theme="dark"]) .hostbtn--primary {
    color: #042f2e;
  }
  .hostbtn--primary:hover:not(:disabled),
  .hostbtn--primary:focus-visible:not(:disabled) {
    color: #fff;
    background: color-mix(in oklab, rgb(var(--accent)) 86%, #000);
    animation: none;
  }
  :global(html[data-theme="dark"]) .hostbtn--primary:hover:not(:disabled),
  :global(html[data-theme="dark"]) .hostbtn--primary:focus-visible:not(:disabled) {
    color: #042f2e;
  }
</style>