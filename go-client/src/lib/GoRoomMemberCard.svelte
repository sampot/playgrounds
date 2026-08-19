<script lang="ts">
  import {
    GO_ROOM_HAND_RAISE,
    GO_ROOM_MEMBER_MORE,
    GO_ROOM_ON_AIR,
    GO_ROOM_ROLE_HOST,
    GO_ROOM_ROLE_PRESENTER,
    type RoomHostMenuItem,
    type RoomMemberCardView,
  } from "$lib/goRoom";

  type Props = {
    card: RoomMemberCardView;
    selected?: boolean;
    onclick?: () => void;
    hostMenu?: RoomHostMenuItem[];
    hostMenuOpen?: boolean;
    onHostMenuToggle?: () => void;
    onHostAction?: (action: RoomHostMenuItem["action"]) => void;
  };

  let {
    card,
    selected = false,
    onclick,
    hostMenu,
    hostMenuOpen = false,
    onHostMenuToggle,
    onHostAction,
  }: Props = $props();

  const label = $derived.by(() => {
    const bits = [card.name];
    if (card.host) bits.push(GO_ROOM_ROLE_HOST);
    if (card.presenter) bits.push(GO_ROOM_ROLE_PRESENTER);
    bits.push(card.micOn ? "麥克風開啟" : "麥克風靜音");
    bits.push(card.cameraOn ? "鏡頭開啟" : "鏡頭關閉");
    if (card.speaking) bits.push("發言中");
    if (card.onAir) bits.push("播送中");
    if (card.handRaised) bits.push(GO_ROOM_HAND_RAISE);
    return bits.join(" · ");
  });
</script>

<div class="member-item" data-member-peer={card.peerId}>
<button
  type="button"
  class={[
    "member-card",
    card.onAir && "member-card--on-air",
    selected && "member-card--selected",
  ]
    .filter(Boolean)
    .join(" ")}
  aria-label={label}
  aria-pressed={selected}
  {onclick}
>
  <span class="member-avatar-wrap">
    {#if card.avatarUrl}
      <img
        class="member-avatar"
        src={card.avatarUrl}
        alt=""
        width="40"
        height="40"
        referrerpolicy="no-referrer"
      />
    {:else}
      <span class="member-avatar member-avatar--letter" aria-hidden="true">
        {card.avatarInitial}
      </span>
    {/if}
    {#if card.handRaised}
      <span class="member-hand" title={GO_ROOM_HAND_RAISE}>
        <svg
          class="member-hand-icon"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M11 13.5V5.5a1.5 1.5 0 0 1 3 0V12"
          />
          <path d="M14 12V7a1.5 1.5 0 0 1 3 0v6" />
          <path d="M8 12V8.5a1.5 1.5 0 1 1 3 0V13" />
          <path d="M17 13v2.5a5 5 0 0 1-10 0V12" />
          <path d="M8 12.5V11a1.5 1.5 0 0 0-3 0v3.5" />
        </svg>
        <span class="member-hand-text">{GO_ROOM_HAND_RAISE}</span>
      </span>
    {/if}
  </span>
  <span class="member-body">
    <span class="member-name-row">
      <span class="member-name">{card.name}</span>
      {#if card.onAir}
        <span class="member-live">{GO_ROOM_ON_AIR}</span>
      {/if}
    </span>
    {#if card.host || card.presenter}
      <span class="member-roles">
        {#if card.host}
          <span class="member-role member-role--host">{GO_ROOM_ROLE_HOST}</span>
        {/if}
        {#if card.presenter}
          <span class="member-role member-role--presenter">{GO_ROOM_ROLE_PRESENTER}</span>
        {/if}
      </span>
    {/if}
  </span>
  <span class="member-media" aria-hidden="true">
    <span
      class={[
        "member-mic",
        card.micOn && "member-mic--on",
        card.speaking && "member-mic--speaking",
      ]
        .filter(Boolean)
        .join(" ")}
      title={card.micOn ? (card.speaking ? "發言中" : "麥克風開啟") : "麥克風靜音"}
    >
      <svg
        class="member-ico"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M6 11a6 6 0 0 0 12 0" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <line x1="8" y1="21" x2="16" y2="21" />
        {#if !card.micOn}
          <line x1="4" y1="4" x2="20" y2="20" />
        {/if}
      </svg>
      {#if card.speaking}
        <span class="member-waves">
          <span class="member-wave"></span>
          <span class="member-wave"></span>
          <span class="member-wave"></span>
        </span>
      {/if}
    </span>
    <span
      class={["member-cam", card.cameraOn && "member-cam--on"].filter(Boolean).join(" ")}
      title={card.cameraOn ? "鏡頭開啟" : "鏡頭關閉"}
    >
      <svg
        class="member-ico"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="7" width="13" height="10" rx="2" />
        <polygon points="16 10 21 7 21 17 16 14" />
        {#if !card.cameraOn}
          <line x1="3" y1="3" x2="21" y2="21" />
        {/if}
      </svg>
    </span>
  </span>
</button>
  {#if hostMenu && hostMenu.length > 0}
    <button
      type="button"
      class={["member-more", "pixel-btn", hostMenuOpen && "pixel-btn--primary"]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${GO_ROOM_MEMBER_MORE} · ${card.name}`}
      aria-haspopup="menu"
      aria-expanded={hostMenuOpen}
      onclick={(e) => {
        e.stopPropagation();
        onHostMenuToggle?.();
      }}
    >
      ···
    </button>
    {#if hostMenuOpen}
      <div class="member-menu" role="menu" aria-label={GO_ROOM_MEMBER_MORE}>
        {#each hostMenu as item (item.action)}
          <button
            type="button"
            class={[
              "member-menu-item",
              "pixel-btn",
              item.danger && "pixel-btn--danger",
            ]
              .filter(Boolean)
              .join(" ")}
            role="menuitem"
            disabled={!item.enabled}
            onclick={() => onHostAction?.(item.action)}
          >
            {item.label}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .member-item {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 0.25rem;
    margin: 0.2rem 0;
  }
  .member-card {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    align-items: center;
    gap: 0.55rem;
    margin: 0;
    padding: 0.4rem 0.5rem;
    border: 2px solid color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
    border-radius: var(--radius);
    background: rgb(var(--card));
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .member-card--selected {
    border-color: rgb(var(--ink));
  }
  .member-card--on-air {
    border-color: rgb(var(--gold-soft));
    box-shadow:
      0 0 0 2px color-mix(in oklab, rgb(var(--gold)) 55%, transparent),
      var(--pixel-shadow);
  }
  .member-avatar-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .member-avatar {
    display: block;
    width: 40px;
    height: 40px;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    object-fit: cover;
    background: rgb(var(--fill));
  }
  .member-avatar--letter {
    display: grid;
    place-items: center;
    font-family: var(--pixel);
    font-weight: 700;
    font-size: 1rem;
  }
  .member-hand {
    position: absolute;
    top: -0.35rem;
    right: -0.4rem;
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
    min-height: 1.15rem;
    padding: 0.05rem 0.25rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--gold-soft));
    color: rgb(38 32 28);
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 1;
  }
  .member-hand-icon {
    flex: 0 0 auto;
  }
  .member-body {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 0.15rem;
  }
  .member-name-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }
  .member-name {
    overflow: hidden;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .member-live {
    flex: 0 0 auto;
    padding: 0.05rem 0.3rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--danger));
    color: #fff;
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.2;
  }
  .member-roles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .member-role {
    padding: 0.02rem 0.3rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.35;
  }
  .member-role--host {
    background: color-mix(in oklab, rgb(var(--gold)) 35%, rgb(var(--card)));
  }
  .member-role--presenter {
    background: color-mix(in oklab, rgb(var(--accent)) 28%, rgb(var(--card)));
  }
  .member-media {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.2rem;
  }
  .member-mic,
  .member-cam {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 28px;
    color: rgb(var(--muted));
  }
  .member-mic--on,
  .member-cam--on {
    color: rgb(var(--ink));
  }
  .member-mic--speaking {
    color: rgb(var(--accent));
  }
  .member-ico {
    display: block;
  }
  .member-waves {
    position: absolute;
    right: -0.15rem;
    bottom: 0.05rem;
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 10px;
  }
  .member-wave {
    display: block;
    width: 2px;
    height: 4px;
    background: rgb(var(--accent));
    animation: member-wave 0.7s ease-in-out infinite;
  }
  .member-wave:nth-child(2) {
    animation-delay: 0.12s;
    height: 7px;
  }
  .member-wave:nth-child(3) {
    animation-delay: 0.24s;
    height: 5px;
  }
  @keyframes member-wave {
    0%,
    100% {
      transform: scaleY(0.45);
    }
    50% {
      transform: scaleY(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .member-wave {
      animation: none;
    }
  }
  .member-more {
    flex: 0 0 auto;
    min-width: 44px;
    min-height: 44px;
    width: 44px;
    padding: 0;
    font-weight: 800;
    letter-spacing: 0.05em;
  }
  .member-menu {
    flex: 1 1 100%;
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.35rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
  }
  .member-menu-item {
    min-height: 44px;
    justify-content: flex-start;
  }
</style>
