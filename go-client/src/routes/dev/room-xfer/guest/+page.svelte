<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import {
    ROOM_XFER_CONCURRENT,
    ROOM_XFER_IO_DELAY_MS,
    ROOM_XFER_SCHED_IO_DELAY_MS,
    ROOM_XFER_SCRUB_SEEKS,
    createRoomXferHarness,
    type RoomXferDirectDlReport,
    type RoomXferHarness,
    type RoomXferScrubReport,
    type RoomXferStressReport,
  } from "$lib/goRoomXferHarness";
  import { ROOM_FILE_JOB_MAX_TASKS } from "$lib/goRoomFileJobs";
  import { roomFilePath } from "$lib/goRoomPlayRegistry";

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
  let report = $state<RoomXferStressReport | null>(null);
  let scrubReport = $state<RoomXferScrubReport | null>(null);
  let directDlReport = $state<RoomXferDirectDlReport | null>(null);
  let busy = $state(false);
  let previewUrl = $state<string | null>(null);
  let unsub: (() => void) | null = null;

  function sync() {
    const s = harness?.getState();
    if (!s) return;
    phase = s.phase;
    dcOpen = s.dcOpen;
    swReady = s.swReady;
    entries = s.entries.map((e) => ({ id: e.id, name: e.name, size: e.size }));
    log = s.log;
    report = s.lastReport;
    scrubReport = s.lastScrubReport;
    directDlReport = s.lastDirectDlReport;
  }

  async function onRun() {
    if (!harness || busy) return;
    busy = true;
    try {
      const r = await harness.runStress();
      report = r;
      if (r.previewOk) {
        previewUrl = roomFilePath("xf-image", { purpose: "play" });
      }
    } finally {
      busy = false;
      sync();
    }
  }

  async function onScrub() {
    if (!harness || busy) return;
    busy = true;
    try {
      scrubReport = await harness.runVideoScrub();
    } finally {
      busy = false;
      sync();
    }
  }

  async function onDirectDl() {
    if (!harness || busy) return;
    busy = true;
    try {
      directDlReport = await harness.runDirectDownloadSched();
    } finally {
      busy = false;
      sync();
    }
  }

  onMount(() => {
    harness = createRoomXferHarness({ role: "guest", room });
    unsub = harness.subscribe(sync);
    (window as unknown as { __roomXferGuest?: RoomXferHarness }).__roomXferGuest =
      harness;
    void harness.start();
    return () => {
      unsub?.();
      harness?.dispose();
      delete (window as unknown as { __roomXferGuest?: RoomXferHarness })
        .__roomXferGuest;
    };
  });

  onDestroy(() => {
    unsub?.();
    harness?.dispose();
  });
</script>

<svelte:head>
  <title>room-xfer guest · 索取</title>
</svelte:head>

<section class="xfer" data-testid="room-xfer-guest">
  <h1>包廂傳檔測試 · 索取端</h1>
  <p class="lede">
    <strong>旅程：</strong>①預覽圖 ②下載文件 ③單路下載 ④隧道{ROOM_XFER_CONCURRENT}×GET。<br
    />
    <strong>大影片（獨立）：</strong>play＋{ROOM_XFER_SCRUB_SEEKS} 段隨機快轉；Host
    每 slice 模擬 I/O {ROOM_XFER_IO_DELAY_MS} ms（不掛 &lt;video&gt;）。<br />
    <strong>Direct DL sched：</strong>跳過 SW／fetch，對
    <code>sched.bin</code>（1 MiB＋每 slice I/O
    {ROOM_XFER_SCHED_IO_DELAY_MS} ms）直接 admit
    {ROOM_FILE_JOB_MAX_TASKS} 路下載，等齊全部 DC 泵滿才算通過（第
    {ROOM_FILE_JOB_MAX_TASKS + 1} 路必須 reject）。
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

  <div class="actions">
    <button
      type="button"
      data-testid="run-stress"
      disabled={!dcOpen || busy || entries.length < 4}
      onclick={() => void onRun()}
    >
      跑真實旅程測試
    </button>
    <button
      type="button"
      data-testid="run-scrub"
      disabled={!dcOpen || busy || !entries.some((e) => e.id === "xf-movie")}
      onclick={() => void onScrub()}
    >
      大影片隨機快轉
    </button>
    <button
      type="button"
      data-testid="run-direct-dl"
      disabled={!dcOpen || busy || !entries.some((e) => e.id === "xf-sched")}
      onclick={() => void onDirectDl()}
    >
      Direct DL ×{ROOM_FILE_JOB_MAX_TASKS}（1 MiB／跳過 SW）
    </button>
  </div>

  <h2>目錄</h2>
  <ul data-testid="file-list">
    {#each entries as e (e.id)}
      <li data-testid={`file-${e.id}`}>
        {e.name} · {e.size} B · <code>{roomFilePath(e.id)}</code>
      </li>
    {:else}
      <li data-testid="file-list-empty">等待 Host 掛檔…</li>
    {/each}
  </ul>

  {#if previewUrl}
    <h2>預覽（SW）</h2>
    <img data-testid="preview-img" src={previewUrl} alt="SW preview" width="64" height="64" />
  {/if}

  <h2>旅程結果</h2>
  {#if report}
    <p
      data-testid="stress-result"
      data-ok={report.ok ? "1" : "0"}
      class={report.ok ? "pass" : "fail"}
    >
      {report.message}
    </p>
    <pre data-testid="stress-json">{JSON.stringify(report, null, 2)}</pre>
  {:else}
    <p data-testid="stress-result" data-ok="">尚未跑</p>
  {/if}

  <h2>大影片 scrub</h2>
  {#if scrubReport}
    <p
      data-testid="scrub-result"
      data-ok={scrubReport.ok ? "1" : "0"}
      class={scrubReport.ok ? "pass" : "fail"}
    >
      {scrubReport.message}
    </p>
    <pre data-testid="scrub-json">{JSON.stringify(scrubReport, null, 2)}</pre>
  {:else}
    <p data-testid="scrub-result" data-ok="">尚未跑</p>
  {/if}

  <h2>Direct DL sched（skip SW）</h2>
  {#if directDlReport}
    <p
      data-testid="direct-dl-result"
      data-ok={directDlReport.ok ? "1" : "0"}
      class={directDlReport.ok ? "pass" : "fail"}
    >
      {directDlReport.message}
    </p>
    <pre data-testid="direct-dl-json">{JSON.stringify(directDlReport, null, 2)}</pre>
  {:else}
    <p data-testid="direct-dl-result" data-ok="">尚未跑</p>
  {/if}

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
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0 0 1rem;
  }
  @media (min-width: 40rem) {
    .actions {
      flex-direction: row;
      flex-wrap: wrap;
    }
  }
  button {
    min-height: 44px;
    padding: 0.5rem 1rem;
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .pass {
    color: #0a7a2f;
  }
  .fail {
    color: #b00020;
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
