<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { goAuth } from "$lib/goAuth.svelte";
  import GoRoomSurface from "$lib/GoRoomSurface.svelte";
  import {
    createRoomRuntime,
    type RoomStatus,
  } from "$lib/roomRuntime";
  import {
    GO_ROOM_DESCRIPTION,
    GO_ROOM_DOCUMENT_TITLE,
    goOgMeta,
    goWebPageJsonLd,
  } from "$lib/goShareMeta";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";

  const og = goOgMeta({
    title: GO_ROOM_DOCUMENT_TITLE,
    description: GO_ROOM_DESCRIPTION,
    url: `${PLAYGROUNDS_GO_ORIGIN}/room`,
  });
  const pageLdJson = JSON.stringify(
    goWebPageJsonLd({
      title: og.title,
      description: og.description,
      url: og.url,
    })
  );

  let status = $state<RoomStatus | null>(null);
  const runtime = createRoomRuntime();

  onMount(() => {
    const unsub = runtime.subscribe((s) => {
      status = s;
    });
    if (goAuth.loggedIn) void runtime.openBooth();
    return () => {
      unsub();
      void runtime.close();
    };
  });

  $effect(() => {
    if (!browser) return;
    if (goAuth.loggedIn) void runtime.openBooth();
  });

  async function mint() {
    try {
      await runtime.mintInviteAndAnswer();
    } catch {
      /* status.error already set */
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
  <meta property="og:image:width" content={String(og.imageWidth)} />
  <meta property="og:image:height" content={String(og.imageHeight)} />
  <meta property="og:image:alt" content={og.imageAlt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content={og.twitterSite} />
  <meta name="twitter:title" content={og.title} />
  <meta name="twitter:description" content={og.description} />
  <meta name="twitter:image" content={og.image} />
  <meta name="twitter:image:alt" content={og.imageAlt} />
  {@html `<script type="application/ld+json">${pageLdJson}</script>`}
</svelte:head>

<GoRoomSurface
  role="host"
  phase={status?.phase ?? "idle"}
  message={status?.message ?? ""}
  error={status?.error ?? null}
  loggedIn={goAuth.loggedIn}
  shortUrl={status?.shortUrl ?? null}
  inviteExpiresAt={status?.inviteExpiresAt ?? null}
  inviteDoor={status?.inviteDoor ?? "none"}
  peerName={status?.peerName ?? null}
  guestCount={status?.guestCount ?? 0}
  occupantNames={status?.occupantNames ?? []}
  occupantPeers={status?.occupantPeers ?? []}
  onLogin={() => goAuth.login()}
  onInvite={() => void mint()}
  onEnd={() => runtime.close()}
  onKick={(peerId) => runtime.kickPeer(peerId)}
  onReissue={() => void runtime.openBooth({ afterEnd: true })}
  playCatalogId={status?.playCatalogId ?? null}
  playCanvasUrl={status?.playCanvasUrl ?? null}
  playCanvasSrcdoc={status?.playCanvasSrcdoc ?? null}
  playCanvasGeneration={status?.playCanvasGeneration ?? 0}
  onStartPlay={() => void runtime.startAutoPlay("pg-gomoku")}
  onEndPlay={() => void runtime.endPlay()}
/>
