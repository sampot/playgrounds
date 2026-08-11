<script lang="ts">
  /**
   * Go 主場「邀請對弈」條（GO-INVITE §6.6）。
   *
   * - 閒置（未開場）：浮動 chip（不佔版面、不破壞全屏畫布），點擊→開場＋鑄邀請。
   * - 開場後：切回正常排版，顯示階段（等待對手／對局中…）＋「開始」「再來一局」「結束」。
   *
   * 未登入點擊 → `onLoginNeeded()`（頁面轉登入，不 alert）。
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

{#if live}
  <div class="hostbar hostbar--live" role="region" aria-label="邀請對弈狀態">
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
      {:else}
        <button
          type="button"
          class="hostbtn hostbtn--primary"
          disabled={busyAll}
          onclick={onPrimary}
        >
          {busyAll ? "產生中…" : "邀請對手"}
        </button>
      {/if}
      <button type="button" class="hostbtn" disabled={busyAll} onclick={onClose}>
        結束
      </button>
    </div>
  </div>
{:else}
  <button
    type="button"
    class="hostchip"
    disabled={busyAll}
    onclick={onPrimary}
  >
    {busyAll ? "產生中…" : loggedIn ? "邀請對弈" : "登入後邀請對弈"}
  </button>
{/if}

<style>
  .hostbar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.45rem;
    width: 100%;
    max-width: 40rem;
    margin: 0 auto;
    padding: 0.9rem 1rem 0.5rem;
  }
  .hostbar--live {
    gap: 0.65rem;
  }
  .hostbar-msg {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
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
    border: 1px solid rgb(var(--line));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    color: rgb(var(--ink));
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    -webkit-tap-highlight-color: color-mix(
      in oklab,
      rgb(var(--accent)) 18%,
      transparent
    );
  }
  .hostbtn:hover:not(:disabled),
  .hostbtn:focus-visible:not(:disabled) {
    border-color: rgb(var(--accent));
    color: rgb(var(--accent));
    outline: none;
  }
  .hostbtn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .hostbtn--primary {
    background: rgb(var(--accent));
    border-color: rgb(var(--accent));
    color: #fff;
  }
  .hostbtn--primary:hover:not(:disabled),
  .hostbtn--primary:focus-visible:not(:disabled) {
    color: #fff;
    background: color-mix(in oklab, rgb(var(--accent)) 86%, #000);
  }
  /* Float: 不佔版面，留在全屏畫布角落（mobile-first）。 */
  .hostchip {
    position: fixed;
    right: 0.75rem;
    bottom: calc(0.9rem + env(safe-area-inset-bottom, 0px));
    z-index: 30;
    min-height: 2.9rem;
    max-width: min(18rem, calc(100vw - 1.5rem));
    padding: 0.5rem 1.05rem;
    border: 1px solid color-mix(in oklab, rgb(var(--accent)) 55%, rgb(var(--line)));
    border-radius: 999px;
    background: color-mix(in oklab, rgb(var(--fill)) 92%, transparent);
    backdrop-filter: blur(8px);
    color: rgb(var(--accent));
    font: inherit;
    font-size: 0.925rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 6px 18px color-mix(in oklab, rgb(var(--ink)) 24%, transparent);
    -webkit-tap-highlight-color: color-mix(
      in oklab,
      rgb(var(--accent)) 24%,
      transparent
    );
  }
  .hostchip:hover:not(:disabled),
  .hostchip:focus-visible:not(:disabled) {
    background: color-mix(in oklab, rgb(var(--accent)) 10%, rgb(var(--fill)));
    outline: none;
  }
  .hostchip:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  @media (min-width: 40rem) {
    .hostchip {
      right: 1.25rem;
      bottom: 1.25rem;
    }
  }
</style>