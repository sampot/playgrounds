<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    ROOM_XFER_IO_DELAY_MS,
    ROOM_XFER_SCHED_IO_DELAY_MS,
    createRoomXferHarness,
    type RoomXferHarness,
  } from "$lib/goRoomXferHarness";

  // Prerender forbids `url.searchParams` — only read query after hydrate.
  const room = $derived(
    (browser ? page.url.searchParams.get("room")?.trim() : null) || "default"
  );

  let harness: RoomXferHarness | null = null;
  let phase = $state("idle");
  let dcOpen = $state(false);
  let swReady = $state(false);
  let entries = $state<{ id: string; name: string; size: number }[]>([]);
  let log = $state<string[]>([]);
  let unsub: (() => void) | null = null;

  function sync() {
    const s = harness?.getState();
    if (!s) return;
    phase = s.phase;
    dcOpen = s.dcOpen;
    swReady = s.swReady;
    entries = s.entries.map((e) => ({ id: e.id, name: e.name, size: e.size }));
    log = s.log;
  }

  onMount(() => {
    harness = createRoomXferHarness({ role: "host", room });
    unsub = harness.subscribe(sync);
    (window as unknown as { __roomXferHost?: RoomXferHarness }).__roomXferHost =
      harness;
    void harness.start();
    return () => {
      unsub?.();
      harness?.dispose();
      delete (window as unknown as { __roomXferHost?: RoomXferHarness })
        .__roomXferHost;
    };
  });

  onDestroy(() => {
    unsub?.();
    harness?.dispose();
  });
</script>

<svelte:head>
  <title>room-xfer host · 掛檔</title>
</svelte:head>

<section class="xfer" data-testid="room-xfer-host">
  <h1>包廂傳檔測試 · 掛檔端</h1>
  <p class="lede">
    掛上 5 個檔（burst／圖／文字／500 MB 假影片／1 MiB
    <code>sched.bin</code>；影片與 sched 每 slice 模擬 I/O
    {ROOM_XFER_IO_DELAY_MS} ms／{ROOM_XFER_SCHED_IO_DELAY_MS} ms）。對端只能經
    Service Worker <code>/room-file/&lt;id&gt;</code> 索取；本頁不提供 blob:
    捷徑。
  </p>
  <dl class="status">
    <div>
      <dt>room</dt>
      <dd data-testid="room-id">{room}</dd>
    </div>
    <div>
      <dt>phase</dt>
      <dd data-testid="phase">{phase}</dd>
    </div>
    <div>
      <dt>SW</dt>
      <dd data-testid="sw-ready">{swReady ? "controlling" : "missing"}</dd>
    </div>
    <div>
      <dt>DC</dt>
      <dd data-testid="dc-open">{dcOpen ? "open" : "closed"}</dd>
    </div>
  </dl>
  <p>
    Guest：
    <a
      data-testid="guest-link"
      href={`/dev/room-xfer/guest?room=${encodeURIComponent(room)}`}
      target="_blank"
      rel="noopener">開索取端</a
    >
  </p>
  <h2>已掛檔</h2>
  <ul data-testid="file-list">
    {#each entries as e (e.id)}
      <li data-testid={`file-${e.id}`}>{e.name} · {e.size} B · {e.id}</li>
    {:else}
      <li data-testid="file-list-empty">尚未掛上（等 DataChannel）</li>
    {/each}
  </ul>
  <h2>log</h2>
  <pre data-testid="log">{log.join("\n")}</pre>
</section>

<style>
  .xfer {
    max-width: 40rem;
    margin: 1rem auto;
    padding: 1rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.875rem;
    line-height: 1.45;
  }
  h1 {
    font-size: 1.15rem;
    margin: 0 0 0.5rem;
  }
  .lede {
    margin: 0 0 1rem;
    color: #333;
  }
  .status {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 1rem;
    margin: 0 0 1rem;
  }
  .status dt {
    font-weight: 600;
  }
  .status dd {
    margin: 0;
  }
  pre {
    white-space: pre-wrap;
    background: #f4f4f4;
    padding: 0.75rem;
    max-height: 16rem;
    overflow: auto;
  }
  ul {
    padding-left: 1.25rem;
  }
</style>
