<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { joinBoothAsPeer } from "$lib/booth/boothPeerClient";
  import type { RosterPeerSession } from "@pg/roster/rosterPeer";
  import {
    GO_ROOM_DESCRIPTION,
    goOgMeta,
    goWebPageJsonLd,
  } from "$lib/goShareMeta";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import { BOOTH_LOCAL_DEFAULT_PORT } from "$lib/booth/boothLocalEngine";

  const og = goOgMeta({
    title: "監控 Peer · 山姆鍋遊樂場",
    description: GO_ROOM_DESCRIPTION,
    url: `${PLAYGROUNDS_GO_ORIGIN}/room/peer`,
  });
  const pageLdJson = JSON.stringify(
    goWebPageJsonLd({
      title: og.title,
      description: og.description,
      url: og.url,
    })
  );

  type PeerPhase = "idle" | "connecting" | "open" | "error";

  let peerCap = $state("");
  let hubSessionId = $state("");
  let hubUrl = $state("");
  let label = $state("");
  let displayName = $state("監控 Peer");
  let phase = $state<PeerPhase>("idle");
  let message = $state("");
  let error = $state<string | null>(null);
  let peerId = $state<string | null>(null);
  let session: RosterPeerSession | null = null;

  const canConnect = $derived(Boolean(peerCap.trim()) && phase !== "connecting");

  onMount(() => {
    if (!browser) return;
    peerCap = page.url.searchParams.get("peerCap")?.trim() ??
      page.url.searchParams.get("cap")?.trim() ??
      "";
    hubSessionId = page.url.searchParams.get("hub")?.trim() ?? "";
    hubUrl = page.url.searchParams.get("hubUrl")?.trim() ?? "";
    label = page.url.searchParams.get("label")?.trim() ?? "";
    if (label) displayName = label;
    if (peerCap) void connect();
    return () => {
      try {
        session?.close();
      } catch {
        /* ignore */
      }
      session = null;
    };
  });

  async function connect() {
    const cap = peerCap.trim();
    if (!cap || phase === "connecting") return;
    phase = "connecting";
    error = null;
    message = "連線中…";
    try {
      session?.close();
      const agentId = `peer-${crypto.randomUUID().slice(0, 8)}`;
      const out = await joinBoothAsPeer({
        peerCap: cap,
        hubBaseUrl:
          hubUrl.trim() ||
          `http://127.0.0.1:${BOOTH_LOCAL_DEFAULT_PORT}`,
        embeddedHubSessionId: hubSessionId.trim() || undefined,
        label: label.trim() || displayName.trim() || undefined,
        localPresence: {
          agentId,
          name: displayName.trim() || "Peer",
        },
        handlers: {
          onChannelOpen: () => {
            phase = "open";
            message = "已加入包廂 roster";
          },
          onChannelClose: () => {
            if (phase === "open") {
              phase = "error";
              error = "連線已關閉";
            }
          },
          onConnectionState: (state) => {
            if (state === "failed" || state === "disconnected") {
              phase = "error";
              error = "WebRTC 連線失敗";
            }
          },
        },
      });
      session = out.session;
      peerId = out.peerId;
      if (phase !== "open") {
        phase = "open";
        message = "已加入包廂 roster";
      }
    } catch (e) {
      phase = "error";
      error = e instanceof Error ? e.message : "無法加入";
      message = "";
    }
  }
</script>

<svelte:head>
  <title>{og.title}</title>
  <meta name="description" content={og.description} />
  <link rel="canonical" href={og.url} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content={og.siteName} />
  <meta property="og:title" content={og.title} />
  <meta property="og:description" content={og.description} />
  <meta property="og:url" content={og.url} />
  <meta property="og:image" content={og.image} />
  {@html `<script type="application/ld+json">${pageLdJson}</script>`}
</svelte:head>

<main class="peer-page">
  <header class="peer-header">
    <h1>監控 Peer</h1>
    <p>以 peerCap 加入包廂 roster（網頁或 pg-boothd CLI）。</p>
  </header>

  {#if !peerCap}
    <p class="peer-alert" role="alert">
      請從主持端「監控 Peer」複製連結，或帶入有效的 peerCap 參數。
    </p>
  {/if}

  <form
    class="peer-form"
    onsubmit={(ev) => {
      ev.preventDefault();
      void connect();
    }}
  >
    <label>
      <span>顯示名稱</span>
      <input type="text" bind:value={displayName} maxlength="32" />
    </label>
    {#if !page.url.searchParams.get("peerCap")}
      <label>
        <span>peerCap</span>
        <input type="text" bind:value={peerCap} autocomplete="off" />
      </label>
    {/if}
    <button type="submit" disabled={!canConnect}>
      {phase === "connecting" ? "連線中…" : "加入"}
    </button>
  </form>

  {#if message}
    <p class="peer-status" role="status">{message}</p>
  {/if}
  {#if error}
    <p class="peer-error" role="alert">{error}</p>
  {/if}
  {#if peerId && phase === "open"}
    <p class="peer-meta">peerId: {peerId}</p>
  {/if}
</main>

<style>
  .peer-page {
    max-width: 28rem;
    margin: 0 auto;
    padding: 1.25rem 1rem 2rem;
  }
  .peer-header h1 {
    margin: 0 0 0.35rem;
    font-size: 1.15rem;
  }
  .peer-header p {
    margin: 0 0 1rem;
    font-size: 0.88rem;
    opacity: 0.85;
    line-height: 1.45;
  }
  .peer-alert {
    padding: 0.65rem 0.75rem;
    border-radius: 0.45rem;
    background: rgb(var(--warn-bg, 80 40 20) / 0.25);
    font-size: 0.88rem;
    margin: 0 0 1rem;
  }
  .peer-form {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .peer-form label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
  }
  .peer-form input {
    min-height: 2.75rem;
    padding: 0.5rem 0.65rem;
    border-radius: 0.45rem;
    border: 1px solid rgb(var(--border, 80 80 80) / 0.5);
    background: rgb(var(--bg, 10 10 12));
    color: inherit;
  }
  .peer-form button {
    min-height: 2.85rem;
    margin-top: 0.25rem;
    border: none;
    border-radius: 0.45rem;
    background: rgb(var(--accent, 180 80 40));
    color: rgb(var(--accent-fg, 255 255 255));
    font-size: 0.95rem;
    cursor: pointer;
  }
  .peer-form button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .peer-status {
    margin: 1rem 0 0;
    font-size: 0.9rem;
  }
  .peer-error {
    margin: 0.75rem 0 0;
    color: rgb(var(--danger, 220 80 80));
    font-size: 0.88rem;
  }
  .peer-meta {
    margin: 0.5rem 0 0;
    font-size: 0.78rem;
    opacity: 0.7;
    word-break: break-all;
  }
</style>
