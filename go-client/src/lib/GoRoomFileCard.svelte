<script lang="ts">
  import {
    GO_ROOM_FILE_MORE,
    GO_ROOM_FILE_ON_AIR,
    fileShareIcon,
    type FileShareKind,
    type RoomFileMenuItem,
  } from "$lib/goRoomFileShare";

  type Owner = {
    name: string;
    avatarUrl?: string | null;
    avatarInitial: string;
  };

  type Props = {
    fileId: string;
    name: string;
    kind: FileShareKind;
    meta: string;
    onAir?: boolean;
    owner?: Owner | null;
    menu: RoomFileMenuItem[];
    menuOpen?: boolean;
    onMenuToggle?: () => void;
    onAction?: (action: RoomFileMenuItem["action"]) => void;
  };

  let {
    fileId,
    name,
    kind,
    meta,
    onAir = false,
    owner = null,
    menu,
    menuOpen = false,
    onMenuToggle,
    onAction,
  }: Props = $props();

  const label = $derived.by(() => {
    const bits = [name, meta];
    if (onAir) bits.push(GO_ROOM_FILE_ON_AIR);
    if (owner) bits.push(owner.name);
    return bits.filter(Boolean).join(" · ");
  });
</script>

<div class="file-item" data-file-id={fileId}>
  <div
    class={["file-card", onAir && "file-card--on-air"].filter(Boolean).join(" ")}
    role="group"
    aria-label={label}
  >
    <span class="file-type" aria-hidden="true">{fileShareIcon(kind)}</span>
    <span class="file-body">
      <span class="file-name-row">
        <span class="file-name">{name}</span>
        {#if onAir}
          <span class="file-live">{GO_ROOM_FILE_ON_AIR}</span>
        {/if}
      </span>
      {#if meta}
        <span class="file-meta muted">{meta}</span>
      {/if}
    </span>
    {#if owner}
      <span class="file-owner" title={owner.name}>
        <span class="file-owner-avatar" aria-hidden="true">
          {#if owner.avatarUrl}
            <img
              class="file-owner-img"
              src={owner.avatarUrl}
              alt=""
              width="28"
              height="28"
              referrerpolicy="no-referrer"
            />
          {:else}
            <span class="file-owner-letter">{owner.avatarInitial}</span>
          {/if}
        </span>
      </span>
    {/if}
    {#if menu.length > 0}
      <button
        type="button"
        class={["file-more", "pixel-btn", menuOpen && "pixel-btn--primary"]
          .filter(Boolean)
          .join(" ")}
        aria-label={`${GO_ROOM_FILE_MORE} · ${name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => onMenuToggle?.()}
      >
        ···
      </button>
    {/if}
  </div>
  {#if menuOpen && menu.length > 0}
    <div class="file-menu" role="menu" aria-label={GO_ROOM_FILE_MORE}>
      {#each menu as item (item.action)}
        <button
          type="button"
          class={[
            "file-menu-item",
            "pixel-btn",
            item.danger && "pixel-btn--danger",
          ]
            .filter(Boolean)
            .join(" ")}
          role="menuitem"
          disabled={!item.enabled}
          onclick={() => onAction?.(item.action)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .file-item {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 0.25rem;
    margin: 0.2rem 0;
  }
  .file-card {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
    padding: 0.3rem 0.35rem 0.3rem 0.4rem;
    border: 2px solid color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
    border-radius: var(--radius);
    background: rgb(var(--card));
    box-sizing: border-box;
  }
  .file-card--on-air {
    border-color: #3dff8a;
    box-shadow: 0 0 0 2px color-mix(in oklab, #3dff8a 55%, transparent);
  }
  .file-type {
    flex: 0 0 auto;
    font-size: 1.15rem;
    line-height: 1;
  }
  .file-body {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 0.05rem;
  }
  .file-name-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }
  .file-name {
    overflow: hidden;
    font-weight: 700;
    font-size: 0.9rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-live {
    flex: 0 0 auto;
    padding: 0.05rem 0.28rem;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    background: #3dff8a;
    color: #0a2e18;
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    line-height: 1.2;
  }
  .file-meta {
    overflow: hidden;
    font-size: 0.75rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .muted {
    color: color-mix(in oklab, rgb(var(--ink)) 72%, transparent);
  }
  .file-owner {
    flex: 0 0 auto;
  }
  .file-owner-avatar {
    display: block;
    width: 28px;
    height: 28px;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
    overflow: hidden;
    background: rgb(var(--fill));
  }
  .file-owner-img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .file-owner-letter {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-family: var(--pixel);
    font-weight: 700;
    font-size: 0.75rem;
  }
  .file-more {
    flex: 0 0 auto;
    min-width: 44px;
    min-height: 44px;
    width: 44px;
    padding: 0;
    font-weight: 800;
    letter-spacing: 0.05em;
  }
  .file-menu {
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
  .file-menu-item {
    min-height: 44px;
    justify-content: flex-start;
  }
</style>
