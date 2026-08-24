<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import GoRoomSurface from "$lib/GoRoomSurface.svelte";
  import {
    createBoothOperatorShell,
    type BoothOperatorShell,
    type OperatorShellStatus,
  } from "$lib/boothOperatorShell";
  import {
    GO_ROOM_DESCRIPTION,
    goOgMeta,
    goWebPageJsonLd,
  } from "$lib/goShareMeta";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import { chromeSession } from "$lib/chromeSession.svelte";

  const og = goOgMeta({
    title: "遠端連回包廂 · 山姆鍋遊樂場",
    description: GO_ROOM_DESCRIPTION,
    url: `${PLAYGROUNDS_GO_ORIGIN}/room/remote`,
  });
  const pageLdJson = JSON.stringify(
    goWebPageJsonLd({
      title: og.title,
      description: og.description,
      url: og.url,
    })
  );

  let operatorCap = $state("");
  let status = $state<OperatorShellStatus | null>(null);
  let remoteShell: BoothOperatorShell | null = null;

  const uiPhase = $derived.by(() => {
    const p = status?.phase ?? "idle";
    if (p === "open") return "open" as const;
    if (p === "connecting") return "connecting" as const;
    if (p === "error") return "error" as const;
    return "idle" as const;
  });

  onMount(() => {
    const cap = browser
      ? page.url.searchParams.get("cap")?.trim() ?? ""
      : "";
    operatorCap = cap;
    if (!cap) return;
    remoteShell = createBoothOperatorShell({ operatorCap: cap });
    const unsub = remoteShell.subscribe((s) => {
      status = s;
    });
    void remoteShell.connect();
    return () => {
      unsub();
      remoteShell?.disconnect();
      remoteShell = null;
    };
  });
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

{#if !operatorCap}
  <main class="remote-fallback">
    <p role="alert">請從後台「連回包廂」開啟此頁，或使用有效連結。</p>
  </main>
{:else if status}
  {#if status.anchorHint}
    <p class="remote-anchor-hint" role="status">{status.anchorHint}</p>
  {/if}
  {#if status.lastAck}
    <p class="remote-ack muted" role="status">{status.lastAck}</p>
  {/if}
  <GoRoomSurface
    role="operator"
    phase={uiPhase}
    message={status.message}
    error={status.error}
    loggedIn={true}
    shortUrl={status.shortUrl}
    inviteExpiresAt={status.inviteExpiresAt}
    inviteDoor={status.inviteDoor}
    peerName={status.peerName}
    guestCount={status.guestCount}
    occupantNames={status.occupantNames}
    occupantPeers={status.occupantPeers}
    playCatalogId={status.playCatalogId}
    playLoadProgress={status.playLoadProgress}
    playLocalPeerId={status.hostPeerId}
    playHostName={status.hostDisplayName}
    operatorTvOn={status.tvOn}
    operatorTvLabel={status.tvLabel}
    operatorTvStream={status.tvOn ? status.tvStream : null}
    operatorCanDirect={status.canDirect}
    operatorProgramTransport={status.programTransport}
    operatorProgramPaused={status.programPaused}
    operatorProgramTime={status.programTime}
    operatorProgramDuration={status.programDuration}
    operatorRemoteLives={status.remoteLives}
    operatorLocalCamera={status.localCamera}
    operatorLocalMic={status.localMic}
    operatorLocalPeerId={remoteShell?.getOperatorPeerId()}
    onInvite={() => remoteShell?.mintInvite()}
    onRevokeInvite={() => remoteShell?.revokeInvite()}
    onEnd={() => remoteShell?.endBooth()}
    onKick={(peerId) => remoteShell?.kickPeer(peerId)}
    onCastLive={(peerId, name) => remoteShell?.putLiveOnTv(peerId, name)}
    onOperatorCastFile={(fileId, scope) =>
      remoteShell?.putFileOnTv(fileId, scope ?? "share")}
    onOperatorStopTv={() => remoteShell?.stopTv()}
    onOperatorHaltLive={(peerId, layer) => remoteShell?.haltLive(peerId, layer)}
    onOperatorCastState={(payload) => remoteShell?.sendCastState(payload)}
    onStartPlay={(catalogId) => remoteShell?.startAutoPlay(catalogId)}
    onStartManualPlay={(catalogId, picks) =>
      remoteShell?.startManualPlay(catalogId, picks)}
    onEndPlay={() => void remoteShell?.endPlay()}
    onOperatorToggleCamera={async () => {
      const err = await remoteShell?.toggleCamera();
      if (err) chromeSession.setFlash(err, 2800);
    }}
    onOperatorToggleMic={async () => {
      const err = await remoteShell?.toggleMic();
      if (err) chromeSession.setFlash(err, 2800);
    }}
  />
{/if}

<style>
  .remote-fallback {
    max-width: 28rem;
    margin: 0 auto;
    padding: 1.5rem 1rem;
  }
  .remote-anchor-hint {
    text-align: center;
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
    color: rgb(var(--accent, 180 80 40));
  }
  .remote-ack {
    text-align: center;
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }
  .muted {
    opacity: 0.75;
  }
</style>
