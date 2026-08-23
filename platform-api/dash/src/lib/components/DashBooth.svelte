<script lang="ts">
  import { onMount } from "svelte";
  import { dash } from "$lib/dash.svelte";

  let loading = $state(true);
  let online = $state(false);
  let deviceLabel = $state<string | null>(null);
  let guestCount = $state(0);
  let presence = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function refresh() {
    loading = true;
    error = null;
    try {
      const res = await fetch("/v1/booth/anchors/active", {
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        online?: boolean;
        deviceLabel?: string;
        guestCount?: number;
        presence?: string;
        error?: string;
      };
      if (!res.ok) {
        error = data.error ?? "無法讀取狀態";
        online = false;
        return;
      }
      online = Boolean(data.online);
      deviceLabel = data.deviceLabel ?? null;
      guestCount = data.guestCount ?? 0;
      presence = data.presence ?? null;
    } catch {
      error = "無法連線";
      online = false;
    } finally {
      loading = false;
    }
  }

  async function connectRemote() {
    busy = true;
    try {
      const res = await fetch("/v1/booth/operator-caps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        remoteUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.remoteUrl) {
        const msg =
          data.error === "anchor_degraded"
            ? "家裡包廂連線不穩，請確認包廂分頁仍開啟後再試"
            : (data.error ?? "無法連回包廂");
        dash.flash(msg, "err");
        return;
      }
      window.open(data.remoteUrl, "_blank", "noopener,noreferrer");
    } finally {
      busy = false;
    }
  }

  function askEndBooth() {
    dash.askConfirm({
      title: "結束常駐包廂",
      message: "這會撤銷雲端錨點；家裡包廂分頁仍須自行關閉。",
      action: async () => {
        const res = await fetch("/v1/booth/anchors/active", {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          dash.flash("結束失敗", "err");
          return;
        }
        dash.flash("已撤銷錨點", "ok");
        await refresh();
      },
    });
  }

  onMount(() => {
    const VISIBLE_MS = 60_000;
    const HIDDEN_MS = 300_000;
    let timer: ReturnType<typeof setInterval> | null = null;

    function schedulePoll(): void {
      if (timer) clearInterval(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const ms = document?.hidden ? HIDDEN_MS : VISIBLE_MS;
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        void refresh();
      }, ms);
    }

    void refresh();
    schedulePoll();

    const onVis = () => {
      if (!document.hidden) void refresh();
      schedulePoll();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  });
</script>

<section class="dash-booth pixel-frame" aria-labelledby="dash-booth-title">
  <h2 id="dash-booth-title" class="dash-section-title">常駐包廂</h2>

  {#if loading}
    <p class="muted">讀取中…</p>
  {:else if error}
    <p class="muted">{error}</p>
  {:else if online}
    <p class="dash-booth-status">
      <span class="dash-booth-dot" aria-hidden="true"></span>
      在線
      {#if deviceLabel}
        · {deviceLabel}
      {/if}
      · {guestCount} 人在
      {#if presence === "degraded"}
        <span class="warn">（連線不穩）</span>
      {/if}
    </p>
    <div class="dash-booth-actions">
      <button
        type="button"
        class="pixel-btn pixel-btn--primary"
        disabled={busy || presence === "degraded"}
        onclick={() => void connectRemote()}
      >
        連回包廂
      </button>
      <button type="button" class="pixel-btn" onclick={askEndBooth}>結束常駐包廂</button>
    </div>
  {:else}
    <p class="muted">目前沒有常駐包廂。在家裡開啟包廂並在設定中允許「遠端連回」。</p>
  {/if}
</section>

<style>
  .dash-booth {
    padding: 1rem;
    margin-top: 1rem;
  }
  .dash-section-title {
    font-size: 1rem;
    margin: 0 0 0.75rem;
  }
  .dash-booth-status {
    margin: 0 0 0.75rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }
  .dash-booth-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #3a5;
    display: inline-block;
  }
  .dash-booth-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .muted {
    opacity: 0.8;
    font-size: 0.9rem;
  }
  .warn {
    color: #a60;
  }
</style>
