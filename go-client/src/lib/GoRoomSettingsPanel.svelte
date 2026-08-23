<script lang="ts">
  import {
    GO_ROOM_SETTINGS_SECTION_DISPLAY,
    GO_ROOM_SETTINGS_SECTION_REMOTE,
    GO_ROOM_SETTINGS_REMOTE_ANCHOR_HINT,
    GO_ROOM_SETTINGS_REMOTE_ANCHOR_LABEL,
    GO_ROOM_SETTINGS_TITLE,
    GO_ROOM_SETTINGS_TV_SNOW_HINT,
    GO_ROOM_SETTINGS_TV_SNOW_LABEL,
    setRoomTvSnowEnabled,
  } from "$lib/goRoom";

  let {
    open = $bindable(false),
    tvSnowEnabled = $bindable(true),
    remoteAnchorEnabled = $bindable(false),
    showRemoteAnchor = true,
    onRemoteAnchorChange,
  }: {
    open?: boolean;
    tvSnowEnabled?: boolean;
    remoteAnchorEnabled?: boolean;
    showRemoteAnchor?: boolean;
    onRemoteAnchorChange?: (enabled: boolean) => void | Promise<void>;
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

  function setSnow(next: boolean) {
    tvSnowEnabled = next;
    setRoomTvSnowEnabled(next);
  }
</script>

{#if open}
  <div
    class="room-settings-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="room-settings-title"
    tabindex="-1"
    onkeydown={onKeydown}
    onclick={(e) => {
      if (e.currentTarget === e.target) close();
    }}
  >
    <div class="room-settings pixel-frame confirm">
      <header class="room-settings-header">
        <h2 id="room-settings-title" class="confirm-title pixel-text">
          {GO_ROOM_SETTINGS_TITLE}
        </h2>
        <button
          type="button"
          class="pixel-btn room-settings-close"
          bind:this={closeBtn}
          onclick={close}
        >
          關閉
        </button>
      </header>

      <p class="room-settings-lead muted">
        這些選項只影響你這台裝置上的包廂畫面。
      </p>

      <section class="room-settings-section" aria-labelledby="room-settings-display">
        <h3 id="room-settings-display" class="room-settings-section-title">
          {GO_ROOM_SETTINGS_SECTION_DISPLAY}
        </h3>
        <ul class="room-settings-list">
          <li class="room-setting-row">
            <div class="room-setting-copy">
              <p id="room-setting-snow-label" class="room-setting-label">
                {GO_ROOM_SETTINGS_TV_SNOW_LABEL}
              </p>
              <p class="room-setting-hint muted">{GO_ROOM_SETTINGS_TV_SNOW_HINT}</p>
            </div>
            <button
              type="button"
              class={[
                "room-setting-switch",
                !tvSnowEnabled && "room-setting-switch--on",
              ]
                .filter(Boolean)
                .join(" ")}
              role="switch"
              aria-checked={!tvSnowEnabled}
              aria-labelledby="room-setting-snow-label"
              onclick={() => setSnow(!tvSnowEnabled)}
            >
              <span class="room-setting-switch-track" aria-hidden="true">
                <span class="room-setting-switch-thumb"></span>
              </span>
              <span class="sr-only">
                {!tvSnowEnabled ? "開啟" : "關閉"}
              </span>
            </button>
          </li>
        </ul>
      </section>

      {#if showRemoteAnchor}
      <section class="room-settings-section" aria-labelledby="room-settings-remote">
        <h3 id="room-settings-remote" class="room-settings-section-title">
          {GO_ROOM_SETTINGS_SECTION_REMOTE}
        </h3>
        <ul class="room-settings-list">
          <li class="room-setting-row">
            <div class="room-setting-copy">
              <p id="room-setting-remote-label" class="room-setting-label">
                {GO_ROOM_SETTINGS_REMOTE_ANCHOR_LABEL}
              </p>
              <p class="room-setting-hint muted">{GO_ROOM_SETTINGS_REMOTE_ANCHOR_HINT}</p>
            </div>
            <button
              type="button"
              class={[
                "room-setting-switch",
                remoteAnchorEnabled && "room-setting-switch--on",
              ]
                .filter(Boolean)
                .join(" ")}
              role="switch"
              aria-checked={remoteAnchorEnabled}
              aria-labelledby="room-setting-remote-label"
              onclick={() => {
                const next = !remoteAnchorEnabled;
                remoteAnchorEnabled = next;
                void onRemoteAnchorChange?.(next);
              }}
            >
              <span class="room-setting-switch-track" aria-hidden="true">
                <span class="room-setting-switch-thumb"></span>
              </span>
              <span class="sr-only">
                {remoteAnchorEnabled ? "開啟" : "關閉"}
              </span>
            </button>
          </li>
        </ul>
      </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .room-settings-overlay {
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
  .room-settings {
    width: min(28rem, 100%);
    max-height: min(78vh, 32rem);
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    overflow: auto;
  }
  .room-settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .room-settings-header .confirm-title {
    margin: 0;
  }
  .room-settings-close {
    min-height: 44px;
    min-width: 44px;
    flex: 0 0 auto;
  }
  .room-settings-lead {
    margin: 0;
    line-height: 1.45;
    font-size: 0.88rem;
  }
  .room-settings-section {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .room-settings-section-title {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: color-mix(in oklab, rgb(var(--ink)) 68%, transparent);
  }
  .room-settings-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .room-setting-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.65rem;
    padding: 0.55rem 0.6rem;
    border: 2px solid color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
    border-radius: var(--radius);
    background: color-mix(in oklab, rgb(var(--fill)) 88%, rgb(var(--card)));
  }
  .room-setting-copy {
    flex: 1 1 auto;
    min-width: 0;
  }
  .room-setting-label {
    margin: 0;
    font-weight: 700;
    line-height: 1.35;
  }
  .room-setting-hint {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    line-height: 1.4;
  }
  .muted {
    color: color-mix(in oklab, rgb(var(--ink)) 72%, transparent);
  }
  .room-setting-switch {
    flex: 0 0 auto;
    min-width: 52px;
    min-height: 44px;
    margin: 0;
    padding: 0.35rem 0.2rem;
    border: none;
    background: transparent;
    cursor: pointer;
  }
  .room-setting-switch:focus-visible {
    outline: 2px solid rgb(var(--accent));
    outline-offset: 2px;
    border-radius: var(--radius);
  }
  .room-setting-switch-track {
    display: block;
    width: 2.75rem;
    height: 1.55rem;
    border: 2px solid rgb(var(--ink));
    border-radius: 999px;
    background: color-mix(in oklab, rgb(var(--ink)) 12%, rgb(var(--fill)));
    box-shadow: var(--pixel-inset);
    position: relative;
    transition: background 0.15s ease;
  }
  .room-setting-switch-thumb {
    position: absolute;
    top: 50%;
    left: 0.12rem;
    width: 1.05rem;
    height: 1.05rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--card));
    box-shadow: var(--pixel-shadow);
    transform: translateY(-50%);
    transition: transform 0.15s ease;
  }
  .room-setting-switch--on .room-setting-switch-track {
    background: color-mix(in oklab, rgb(var(--accent)) 42%, rgb(var(--fill)));
  }
  .room-setting-switch--on .room-setting-switch-thumb {
    transform: translate(1.15rem, -50%);
  }
  @media (min-width: 40rem) {
    .room-settings-overlay {
      align-items: center;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .room-setting-switch-track,
    .room-setting-switch-thumb {
      transition: none;
    }
  }
</style>
