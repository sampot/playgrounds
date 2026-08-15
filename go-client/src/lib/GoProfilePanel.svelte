<script lang="ts">
  import { goAuth } from "$lib/goAuth.svelte";
  import { goDashOrigin } from "$lib/platformClient";

  type Props = {
    open: boolean;
    onClose: () => void;
  };

  let { open, onClose }: Props = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let wasOpen = false;

  const profile = $derived.by(() => goAuth.profile);

  function label() {
    return profile?.label ?? "";
  }

  const identityLine = $derived.by(() => {
    if (!profile) return "";
    return profile.role === "admin" ? "管理員" : "玩家";
  });

  const accountHref = $derived.by(() => {
    const dash = goDashOrigin();
    return `${dash.replace(/\/$/, "")}/account`;
  });

  let busy = $state(false);

  async function logout() {
    if (busy) return;
    busy = true;
    onClose();
    goAuth.logout();
    busy = false;
  }

  $effect(() => {
    const el = dialogEl;
    if (!el) return;
    if (open) {
      if (!el.open) {
        try {
          el.showModal();
        } catch {
          el.setAttribute("open", "");
        }
      }
      if (!wasOpen) {
        wasOpen = true;
        queueMicrotask(() => {
          el.querySelector<HTMLButtonElement>(".go-profile-close")?.focus();
        });
      }
      return;
    }
    wasOpen = false;
    if (el.open) el.close();
  });

  function onDialogCancel(e: Event) {
    e.preventDefault();
    onClose();
  }
</script>

<dialog
  bind:this={dialogEl}
  class="go-profile"
  aria-labelledby="go-profile-title"
  oncancel={onDialogCancel}
  onclick={e => {
    if (e.target === dialogEl) onClose();
  }}
>
  <div class="go-profile-panel">
    <header class="go-profile-head">
      <h2 id="go-profile-title" class="go-profile-title">我的身分</h2>
      <button
        type="button"
        class="go-profile-close"
        onclick={onClose}
        aria-label="關閉"
      >
        關閉
      </button>
    </header>

    <div class="go-profile-body">
      <div class="go-profile-card">
        {#if profile?.avatar_url}
          <img
            class="go-profile-avatar"
            src={profile.avatar_url}
            alt=""
            width="48"
            height="48"
            referrerpolicy="no-referrer"
          />
        {:else}
          <span class="go-profile-avatar go-profile-avatar--fallback" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5" />
            </svg>
          </span>
        {/if}
        <div class="go-profile-meta">
          <p class="go-profile-label">{label()}</p>
          <p class="go-profile-role">{identityLine}</p>
          {#if profile?.user_id}
            <details class="go-profile-support">
              <summary>支援用代號</summary>
              <p class="go-profile-id">{profile.user_id}</p>
            </details>
          {/if}
        </div>
      </div>

      <div class="go-profile-actions">
        <a
          class="go-profile-btn go-profile-link"
          href={accountHref}
          target="_blank"
          rel="noopener noreferrer"
          onclick={onClose}
        >
          個人檔案
        </a>
        <button
          type="button"
          class="go-profile-btn"
          disabled={busy}
          onclick={() => void logout()}
        >
          登出
        </button>
      </div>

      <p class="go-profile-note">
        登入只辨識你的身分，不影響遊玩。未登入仍可隨時加入與遊玩。
      </p>
    </div>
  </div>
</dialog>

<style>
  .go-profile {
    --gp-fill: var(--fill, 248 250 249);
    --gp-ink: var(--ink, 28 35 33);
    --gp-accent: var(--accent, 15 118 110);
    --gp-line: var(--line, 214 222 219);
    --gp-muted: var(--muted, 100 116 112);
    --gp-radius: 0.5rem;
    margin: 0;
    padding: 0;
    border: none;
    max-width: none;
    width: 100%;
    max-height: min(92svh, 40rem);
    background: transparent;
    color: rgb(var(--gp-ink));
  }
  .go-profile::backdrop {
    background: color-mix(in oklab, rgb(var(--gp-ink)) 45%, transparent);
  }
  .go-profile[open] {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: 100vw;
    height: 100%;
    max-height: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }
  .go-profile-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 28rem;
    margin: 0 auto;
    flex: 0 1 auto;
    min-height: 0;
    max-height: min(88svh, 30rem);
    border: var(--pixel-edge) solid rgb(var(--gp-ink));
    border-bottom: none;
    border-radius: calc(var(--gp-radius) + 0.35rem)
      calc(var(--gp-radius) + 0.35rem) 0 0;
    background:
      linear-gradient(
        180deg,
        color-mix(in oklab, rgb(var(--gold-soft)) 14%, transparent) 0,
        transparent 28%
      ),
      rgb(var(--gp-fill));
    box-shadow: 0 -6px 0 0 rgb(var(--gp-ink)),
      0 -12px 24px color-mix(in oklab, rgb(var(--gp-ink)) 22%, transparent);
    overflow: hidden;
  }
  .go-profile-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    min-width: 0;
    padding: 1rem 1rem 0.5rem;
    border-bottom: 2px solid color-mix(in oklab, rgb(var(--gp-ink)) 18%, transparent);
  }
  .go-profile-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
    padding: 0.5rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .go-profile-title {
    margin: 0;
    flex: 1;
    font-family: var(--pixel);
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.3;
    text-shadow: var(--pixel-text-shadow);
  }
  .go-profile-close {
    flex-shrink: 0;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.35rem 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--gp-ink));
    border-radius: var(--gp-radius);
    background: rgb(var(--gp-fill));
    color: rgb(var(--gp-ink));
    font-family: var(--pixel);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 3px 0 0 rgb(var(--gp-ink));
  }
  .go-profile-close:hover,
  .go-profile-close:focus-visible {
    border-color: rgb(var(--gp-accent));
    color: rgb(var(--gp-accent));
    outline: none;
  }
  .go-profile-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem;
    border: 2px solid rgb(var(--gp-ink));
    border-radius: var(--gp-radius);
    background: color-mix(in oklab, rgb(var(--card)) 70%, rgb(var(--gp-fill)));
    box-shadow: 0 2px 0 0 rgb(var(--gp-ink));
  }
  .go-profile-avatar {
    flex-shrink: 0;
    width: 3rem;
    height: 3rem;
    border-radius: var(--gp-radius);
    object-fit: cover;
    border: var(--pixel-edge) solid rgb(var(--gp-ink));
    background: rgb(var(--gp-fill));
  }
  .go-profile-avatar--fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgb(var(--gp-muted));
  }
  .go-profile-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .go-profile-label {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .go-profile-role {
    margin: 0;
    font-size: 0.8rem;
    color: rgb(var(--gp-accent));
  }
  .go-profile-support {
    margin: 0.15rem 0 0;
    font-size: 0.75rem;
    color: rgb(var(--gp-muted));
  }
  .go-profile-support summary {
    cursor: pointer;
    list-style: none;
    min-height: 1.75rem;
    display: inline-flex;
    align-items: center;
  }
  .go-profile-support summary::-webkit-details-marker {
    display: none;
  }
  .go-profile-support summary::before {
    content: "▸ ";
  }
  .go-profile-support[open] summary::before {
    content: "▾ ";
  }
  .go-profile-id {
    margin: 0.25rem 0 0;
    font-size: 0.7rem;
    color: rgb(var(--gp-muted));
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    overflow-wrap: anywhere;
    word-break: break-all;
  }
  .go-profile-actions {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .go-profile-btn {
    min-height: 2.75rem;
    width: 100%;
    padding: 0.45rem 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--gp-ink));
    border-radius: var(--gp-radius);
    background: rgb(var(--gp-fill));
    color: rgb(var(--gp-ink));
    font-family: var(--pixel);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    box-sizing: border-box;
    text-align: start;
    box-shadow: 0 3px 0 0 rgb(var(--gp-ink));
    transition:
      transform 0.06s steps(2),
      box-shadow 0.06s steps(2);
  }
  .go-profile-link {
    display: flex;
    align-items: center;
    text-decoration: none;
  }
  .go-profile-btn:hover:not(:disabled),
  .go-profile-btn:focus-visible:not(:disabled) {
    border-color: rgb(var(--gp-accent));
    color: rgb(var(--gp-accent));
    outline: none;
    animation: pixel-blink 0.9s steps(2) infinite;
  }
  .go-profile-btn:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 0 0 0 rgb(var(--gp-ink));
  }
  .go-profile-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .go-profile-note {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: rgb(var(--gp-muted));
  }
</style>
