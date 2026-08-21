<script lang="ts">
  let {
    phase,
    peerCount,
    inviteDoor = "none",
    doorUrl = null,
  }: {
    phase: string;
    peerCount: number;
    inviteDoor?: "none" | "live" | "expired";
    doorUrl?: string | null;
  } = $props();
</script>

<div class="go-room-dev-probe" aria-hidden="true">
  <span data-testid="room-dev-phase">{phase}</span>
  <span data-testid="room-peer-count">{peerCount}</span>
  <span data-testid="room-invite-door">{inviteDoor}</span>
  {#if doorUrl}
    <span data-testid="room-door-url">{doorUrl}</span>
  {/if}
</div>

<style>
  .go-room-dev-probe {
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
</style>
