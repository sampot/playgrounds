<script lang="ts">
  import type { RoomPlayableGame } from "$lib/goRoomPlayBootstrap";
  import type { RoomPlaySeatPick } from "$lib/goRoomPlaySeats";
  import {
    expandRoomPlaySeatSlots,
    formatRoomPlaySeatFail,
    roomPlaySeatDraftComplete,
    roomPlaySeatDraftToPicks,
    type RoomPlaySeatSlot,
  } from "$lib/goRoomPlaySeatDraft";

  export type PlayPickerOccupant = {
    peerId: string;
    name: string;
  };

  let {
    open = $bindable(false),
    games,
    occupants = [],
    onAutoStart,
    onManualStart,
  }: {
    open?: boolean;
    games: RoomPlayableGame[];
    /** Host + guests with wire peer ids（Host = localPeerId）. */
    occupants?: PlayPickerOccupant[];
    onAutoStart: (
      catalogId: string
    ) =>
      | void
      | Promise<
          | { ok: true }
          | { ok: false; reason: string; missingRoles?: string[] }
          | undefined
        >;
    onManualStart: (
      catalogId: string,
      picks: RoomPlaySeatPick[]
    ) =>
      | void
      | Promise<
          | { ok: true }
          | { ok: false; reason: string; missingRoles?: string[] }
          | undefined
        >;
  } = $props();

  let closeBtn = $state<HTMLButtonElement | null>(null);
  let wasOpen = false;
  let step = $state<"games" | "start" | "seats">("games");
  let selected = $state<RoomPlayableGame | null>(null);
  let slots = $state<RoomPlaySeatSlot[]>([]);
  /** peerId per slot index；null = empty. */
  let draft = $state<(string | null)[]>([]);
  let seatError = $state("");
  let busy = $state(false);

  $effect(() => {
    if (!open) {
      wasOpen = false;
      return;
    }
    if (!wasOpen) {
      wasOpen = true;
      resetSheet();
      queueMicrotask(() => closeBtn?.focus());
    }
  });

  function resetSheet() {
    step = "games";
    selected = null;
    slots = [];
    draft = [];
    seatError = "";
    busy = false;
  }

  function close() {
    open = false;
    resetSheet();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (step === "seats") {
        backToStart();
        return;
      }
      if (step === "start") {
        backToGames();
        return;
      }
      close();
    }
  }

  function pickGame(game: RoomPlayableGame) {
    selected = game;
    seatError = "";
    step = "start";
  }

  function openManualSeats() {
    const game = selected;
    if (!game) return;
    slots = expandRoomPlaySeatSlots(game.roles);
    draft = slots.map(() => null);
    const hostOcc = occupants[0];
    const hostSlot = slots.findIndex((s) => s.role === "host");
    if (hostSlot >= 0 && hostOcc) {
      draft[hostSlot] = hostOcc.peerId;
    }
    seatError = "";
    step = "seats";
  }

  function backToGames() {
    step = "games";
    selected = null;
    slots = [];
    draft = [];
    seatError = "";
  }

  function backToStart() {
    step = "start";
    slots = [];
    draft = [];
    seatError = "";
  }

  function assignSeat(slotIndex: number, peerId: string | null) {
    const next = [...draft];
    if (peerId) {
      for (let i = 0; i < next.length; i++) {
        if (i !== slotIndex && next[i] === peerId) next[i] = null;
      }
    }
    next[slotIndex] = peerId;
    draft = next;
    seatError = "";
  }

  function takenExcept(slotIndex: number): Set<string> {
    const taken = new Set<string>();
    for (let i = 0; i < draft.length; i++) {
      if (i === slotIndex) continue;
      const id = draft[i];
      if (id) taken.add(id);
    }
    return taken;
  }

  async function startAuto() {
    const id = selected?.catalogId;
    if (!id || busy) return;
    busy = true;
    seatError = "";
    try {
      const out = await onAutoStart(id);
      if (out && out.ok === false) {
        seatError = formatRoomPlaySeatFail(out.reason, out.missingRoles);
        return;
      }
      close();
    } finally {
      busy = false;
    }
  }

  async function startManual() {
    const game = selected;
    if (!game || busy) return;
    const picks = roomPlaySeatDraftToPicks(slots, draft);
    if (!picks) {
      seatError = formatRoomPlaySeatFail(
        "seats_short",
        slots.filter((_, i) => !draft[i]).map((s) => s.role)
      );
      return;
    }
    busy = true;
    seatError = "";
    try {
      const out = await onManualStart(game.catalogId, picks);
      if (!out || out.ok === false) {
        seatError = formatRoomPlaySeatFail(
          out && "reason" in out ? out.reason : "not_playable",
          out && "missingRoles" in out ? out.missingRoles : undefined
        );
        return;
      }
      close();
    } finally {
      busy = false;
    }
  }

  const draftReady = $derived(roomPlaySeatDraftComplete(slots, draft));
</script>

{#if open}
  <div
    class="play-picker-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="play-picker-title"
    tabindex="-1"
    onkeydown={onKeydown}
    onclick={(e) => {
      if (e.currentTarget === e.target) close();
    }}
  >
    <div class="play-picker pixel-frame confirm">
      <header class="play-picker-header">
        <h2 id="play-picker-title" class="confirm-title pixel-text">
          {#if step === "games"}
            玩遊戲
          {:else if step === "start"}
            開局
          {:else}
            指定席次
          {/if}
        </h2>
        <button
          type="button"
          class="pixel-btn play-picker-close"
          bind:this={closeBtn}
          onclick={close}
        >
          關閉
        </button>
      </header>

      {#if step === "games"}
        <p class="confirm-body muted">選一款掛上大螢幕。人數不夠會無法開局。</p>
        {#if games.length === 0}
          <p class="confirm-body" role="status">目前沒有可開的遊戲</p>
        {:else}
          <ul class="play-picker-list">
            {#each games as g (g.catalogId)}
              <li>
                <button
                  type="button"
                  class="play-picker-item pixel-btn"
                  onclick={() => pickGame(g)}
                >
                  <span class="play-picker-item-title">{g.title}</span>
                  <span class="play-picker-item-meta">需 {g.seatCount} 人</span>
                  {#if g.blurb}
                    <span class="play-picker-item-blurb">{g.blurb}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if step === "start" && selected}
        <p class="confirm-body">
          <strong>{selected.title}</strong> · 需 {selected.seatCount} 人
        </p>
        <p class="confirm-body muted">
          自動入座：主持佔主持席，其餘依進門順序；同一人的兩台不會佔兩席。未入座的人觀戰。
        </p>
        {#if seatError}
          <p class="play-seat-error" role="status">{seatError}</p>
        {/if}
        <div class="play-seat-actions play-seat-actions--start">
          <button
            type="button"
            class="pixel-btn play-seat-btn"
            onclick={backToGames}
            disabled={busy}
          >
            返回
          </button>
          <button
            type="button"
            class="pixel-btn pixel-btn--primary play-seat-btn play-seat-btn-primary"
            onclick={() => void startAuto()}
            disabled={busy}
          >
            自動入座開局
          </button>
          <button
            type="button"
            class="pixel-btn play-seat-btn play-seat-btn-manual"
            onclick={openManualSeats}
            disabled={busy}
          >
            手動指定席次
          </button>
        </div>
      {:else if selected}
        <p class="confirm-body muted">
          {selected.title} · 點席次選人；未入座的人觀戰。
        </p>
        <ul class="play-seat-list">
          {#each slots as slot, i (slot.index)}
            {@const taken = takenExcept(i)}
            <li class="play-seat-row">
              <span class="play-seat-role">{slot.label}</span>
              <label class="play-seat-pick">
                <span class="sr-only">{slot.label}席次</span>
                <select
                  class="play-seat-select"
                  value={draft[i] ?? ""}
                  onchange={(e) => {
                    const v = (e.currentTarget as HTMLSelectElement).value;
                    assignSeat(i, v || null);
                  }}
                >
                  <option value="">尚未指定</option>
                  {#each occupants as occ (occ.peerId)}
                    <option
                      value={occ.peerId}
                      disabled={taken.has(occ.peerId) && draft[i] !== occ.peerId}
                    >
                      {occ.name}
                    </option>
                  {/each}
                </select>
              </label>
            </li>
          {/each}
        </ul>
        {#if seatError}
          <p class="play-seat-error" role="status">{seatError}</p>
        {/if}
        <div class="play-seat-actions">
          <button
            type="button"
            class="pixel-btn play-seat-btn"
            onclick={backToStart}
            disabled={busy}
          >
            返回
          </button>
          <button
            type="button"
            class="pixel-btn pixel-btn--primary play-seat-btn play-seat-btn-primary"
            onclick={() => void startManual()}
            disabled={busy || !draftReady}
          >
            開局
          </button>
        </div>
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
  .play-picker-overlay {
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
  .play-picker {
    width: min(28rem, 100%);
    max-height: min(78vh, 36rem);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    overflow: hidden;
    background: var(--panel, #fff);
  }
  .play-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .play-picker-header .confirm-title {
    margin: 0;
  }
  .play-picker-close {
    min-height: 44px;
    min-width: 44px;
    flex: 0 0 auto;
  }
  .muted {
    color: color-mix(in oklab, currentColor 62%, transparent);
  }
  .play-picker-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-height: 0;
  }
  .play-picker-item {
    width: 100%;
    min-height: 44px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    text-align: left;
    padding: 0.65rem 0.75rem;
  }
  .play-picker-item-title {
    font-weight: 700;
  }
  .play-picker-item-meta {
    font-size: 0.85rem;
    opacity: 0.85;
  }
  .play-picker-item-blurb {
    font-size: 0.8rem;
    opacity: 0.7;
    line-height: 1.35;
  }
  .play-seat-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    min-height: 0;
  }
  .play-seat-row {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .play-seat-role {
    font-weight: 700;
    font-size: 0.9rem;
  }
  .play-seat-pick {
    display: block;
    width: 100%;
  }
  .play-seat-select {
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    padding: 0.55rem 0.65rem;
    font: inherit;
    border: 2px solid color-mix(in oklab, currentColor 28%, transparent);
    background: var(--panel, #fff);
    color: inherit;
  }
  .play-seat-error {
    margin: 0;
    color: color-mix(in oklab, #b00020 85%, currentColor);
    font-size: 0.9rem;
  }
  .play-seat-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.25rem;
  }
  .play-seat-actions--start {
    flex-direction: column;
  }
  .play-seat-btn {
    min-height: 44px;
    flex: 1 1 auto;
  }
  .play-seat-btn-primary {
    flex: 1 1 100%;
  }
  .play-seat-btn-manual {
    flex: 1 1 100%;
    font-size: 0.9rem;
  }
  @media (min-width: 40rem) {
    .play-picker-overlay {
      align-items: center;
    }
    .play-seat-actions--start {
      flex-direction: row;
    }
    .play-seat-btn-primary,
    .play-seat-btn-manual {
      flex: 1 1 auto;
    }
  }
</style>
