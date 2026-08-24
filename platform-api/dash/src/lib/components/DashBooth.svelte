<script lang="ts">
  import { onMount } from "svelte";
  import { dash } from "$lib/dash.svelte";
  import { copyText, formatTime } from "$lib/api";

  type BoothDevice = {
    id: string;
    label: string;
    prefix: string;
    createdAt: number;
    lastUsedAt: number | null;
  };

  let loading = $state(true);
  let online = $state(false);
  let deviceLabel = $state<string | null>(null);
  let guestCount = $state(0);
  let presence = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  let devices = $state<BoothDevice[]>([]);
  let devicesLoading = $state(true);
  let newDeviceLabel = $state("");
  let mintBusy = $state(false);
  let mintedToken = $state<string | null>(null);
  let mintedOwnerId = $state<string | null>(null);

  async function refreshDevices() {
    devicesLoading = true;
    try {
      const res = await fetch("/v1/booth/devices", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        devices?: BoothDevice[];
      };
      if (res.ok) devices = data.devices ?? [];
    } catch {
      devices = [];
    } finally {
      devicesLoading = false;
    }
  }

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

  async function mintDevice() {
    mintBusy = true;
    mintedToken = null;
    mintedOwnerId = null;
    try {
      const res = await fetch("/v1/booth/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: newDeviceLabel.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        deviceToken?: string;
        ownerUserId?: string;
        error?: string;
      };
      if (!res.ok || !data.deviceToken) {
        dash.flash(data.error ?? "無法產生裝置憑證", "err");
        return;
      }
      mintedToken = data.deviceToken;
      mintedOwnerId = data.ownerUserId ?? null;
      newDeviceLabel = "";
      await refreshDevices();
      dash.flash("已產生裝置憑證，請立即複製保存", "ok");
    } finally {
      mintBusy = false;
    }
  }

  async function copyMintedToken() {
    if (!mintedToken) return;
    const ok = await copyText(mintedToken);
    dash.flash(ok ? "已複製裝置憑證" : "無法複製，請手動選取", ok ? "ok" : "warn");
  }

  function askRevokeDevice(device: BoothDevice) {
    dash.askConfirm({
      title: "撤銷裝置",
      message: `撤銷「${device.label}」（${device.prefix}…）後，該裝置上的 pg-boothd 將無法再連上錨點，須重新產生憑證。`,
      action: async () => {
        const res = await fetch(`/v1/booth/devices/${encodeURIComponent(device.id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          dash.flash("撤銷失敗", "err");
          return;
        }
        dash.flash("已撤銷裝置", "ok");
        await refreshDevices();
      },
    });
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
      timer = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        void refresh();
      }, VISIBLE_MS);
    }

    void refresh();
    void refreshDevices();
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
    <p class="muted">
      目前沒有常駐包廂。在伺服器或桌面安裝 pg-boothd／pg-booth-desktop，並用下方裝置憑證連上錨點。
    </p>
  {/if}

  <div class="dash-booth-devices" aria-labelledby="dash-booth-devices-title">
    <h3 id="dash-booth-devices-title" class="dash-subtitle">包廂裝置</h3>
    <p class="muted">
      產生裝置憑證供 pg-boothd 連上 BoothAnchor。憑證只顯示一次，請妥善保存。
    </p>

    <form
      class="dash-device-mint"
      onsubmit={(e) => {
        e.preventDefault();
        void mintDevice();
      }}
    >
      <label class="dash-device-label" for="device-label">裝置名稱</label>
      <input
        id="device-label"
        class="dash-device-input"
        type="text"
        bind:value={newDeviceLabel}
        placeholder="例：客廳伺服器"
        maxlength="64"
        autocomplete="off"
      />
      <button type="submit" class="pixel-btn pixel-btn--primary" disabled={mintBusy}>
        {mintBusy ? "產生中…" : "產生裝置憑證"}
      </button>
    </form>

    {#if mintedToken}
      <div class="dash-device-reveal" role="status">
        <p class="warn">請立即複製；關閉後無法再次查看完整憑證。</p>
        <code class="dash-device-token">{mintedToken}</code>
        {#if mintedOwnerId}
          <p class="muted mono">帳號 ID：{mintedOwnerId}</p>
        {/if}
        <p class="muted mono">
          pg-boothd login --device-token &lt;憑證&gt; --owner {mintedOwnerId ?? "&lt;帳號 ID&gt;"}
        </p>
        <div class="dash-booth-actions">
          <button type="button" class="pixel-btn" onclick={() => void copyMintedToken()}>
            複製憑證
          </button>
          <button
            type="button"
            class="pixel-btn"
            onclick={() => {
              mintedToken = null;
              mintedOwnerId = null;
            }}
          >
            關閉
          </button>
        </div>
      </div>
    {/if}

    {#if devicesLoading}
      <p class="muted">讀取裝置列表…</p>
    {:else if devices.length === 0}
      <p class="muted">尚無已綁定裝置</p>
    {:else}
      <ul class="dash-device-list">
        {#each devices as device (device.id)}
          <li class="dash-device-row">
            <div class="dash-device-meta">
              <span class="dash-device-name">{device.label}</span>
              <span class="muted mono">{device.prefix}…</span>
              <span class="muted">{formatTime(device.createdAt)}</span>
              {#if device.lastUsedAt}
                <span class="muted">最近使用 {formatTime(device.lastUsedAt)}</span>
              {/if}
            </div>
            <button
              type="button"
              class="pixel-btn dash-device-revoke"
              onclick={() => askRevokeDevice(device)}
            >
              撤銷
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
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
  .dash-subtitle {
    font-size: 0.95rem;
    margin: 1.25rem 0 0.5rem;
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
  .dash-booth-devices {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  }
  .dash-device-mint {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }
  .dash-device-label {
    font-size: 0.85rem;
  }
  .dash-device-input {
    width: 100%;
    max-width: 24rem;
    padding: 0.5rem 0.65rem;
    font: inherit;
    border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    border-radius: 4px;
    background: transparent;
  }
  .dash-device-reveal {
    margin: 0.75rem 0;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, #a60 40%, transparent);
    border-radius: 4px;
  }
  .dash-device-token {
    display: block;
    word-break: break-all;
    font-size: 0.85rem;
    margin: 0.5rem 0;
  }
  .dash-device-list {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .dash-device-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
  }
  .dash-device-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .dash-device-name {
    font-weight: 600;
  }
  .dash-device-revoke {
    align-self: flex-start;
    min-height: 2.75rem;
  }
  .muted {
    opacity: 0.8;
    font-size: 0.9rem;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
  }
  .warn {
    color: #a60;
  }

  @media (min-width: 480px) {
    .dash-device-row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
    .dash-device-mint {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: flex-end;
    }
    .dash-device-input {
      flex: 1 1 12rem;
    }
  }
</style>
