<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { goAuth } from "$lib/goAuth.svelte";
  import GoRoomSurface from "$lib/GoRoomSurface.svelte";
  import GoRoomDevProbe from "$lib/GoRoomDevProbe.svelte";
  import {
    createRoomRuntime,
    type RoomStatus,
  } from "$lib/roomRuntime";
  import {
    attachGoRoomDev,
    goRoomDevPageEnabled,
    goRoomDevPeerCount,
    parseGoRoomDevQuery,
    readGoRoomDevRememberedKey,
    writeGoRoomDevRememberedKey,
    type GoRoomDevHandle,
  } from "$lib/goRoomDev";
  import GoRoomDevKeyPanel from "$lib/GoRoomDevKeyPanel.svelte";
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
  const devEnabled = $derived(browser && goRoomDevPageEnabled());
  const devQuery = $derived(
    browser
      ? parseGoRoomDevQuery(page.url.searchParams)
      : { mint: false, join: false, login: false, name: null }
  );
  const peerCount = $derived(goRoomDevPeerCount(status?.guestCount ?? 0));

  let devHandle: GoRoomDevHandle | null = null;
  let autoMintStarted = false;

  onMount(() => {
    const unsub = runtime.subscribe((s) => {
      status = s;
      devHandle?.sync();
    });
    if (goAuth.loggedIn) void runtime.openBooth();

    if (devEnabled) {
      devHandle = attachGoRoomDev({
        enabled: true,
        role: "host",
        getSnapshot: () => {
          const s = runtime.getStatus();
          return {
            phase: s.phase,
            doorUrl: s.shortUrl,
            guestCount: s.guestCount,
            loggedIn: goAuth.loggedIn,
            inviteDoor: s.inviteDoor,
          };
        },
        mint: async () => {
          const r = await runtime.mintInviteAndAnswer();
          if (!r?.shortUrl) {
            throw new Error("mint failed");
          }
          return { shortUrl: r.shortUrl };
        },
        join: async () => {
          /* host does not join */
        },
        setApiKey: async (key, setOpts) => {
          await goAuth.applyFieldApiKey(key);
          if (setOpts?.remember !== false) {
            writeGoRoomDevRememberedKey(key, { enabled: true });
          }
          await runtime.openBooth();
        },
        getApiKey: () => goAuth.getPlatformApiKeyForHostLoop(),
      });

      if (!goAuth.loggedIn) {
        const remembered = readGoRoomDevRememberedKey({ enabled: true });
        if (remembered) {
          void (async () => {
            try {
              await goAuth.applyFieldApiKey(remembered);
              await runtime.openBooth();
              devHandle?.sync();
            } catch {
              /* invalid remembered key — leave login gate */
            }
          })();
        }
      }
    }

    return () => {
      unsub();
      devHandle?.dispose();
      devHandle = null;
      void runtime.close();
    };
  });

  $effect(() => {
    if (!browser) return;
    if (goAuth.loggedIn) {
      void runtime.openBooth();
      return;
    }
    const phase = status?.phase;
    if (phase === "open" || phase === "error") {
      void runtime.close({ landOn: "idle" });
    }
  });

  $effect(() => {
    if (!browser || !devEnabled || !devQuery.mint) return;
    if (!goAuth.loggedIn) return;
    if (autoMintStarted) return;
    const phase = status?.phase;
    if (phase !== "open" && phase !== "idle") return;
    autoMintStarted = true;
    void (async () => {
      try {
        await runtime.mintInviteAndAnswer();
        devHandle?.sync();
      } catch {
        /* status.error already set */
      }
    })();
  });

  async function mint() {
    try {
      await runtime.mintInviteAndAnswer();
      devHandle?.sync();
    } catch {
      /* status.error already set */
    }
  }

  function onDevKeyApplied() {
    void runtime.openBooth();
    devHandle?.sync();
    if (devQuery.mint && !autoMintStarted) {
      autoMintStarted = true;
      void (async () => {
        try {
          await runtime.mintInviteAndAnswer();
          devHandle?.sync();
        } catch {
          /* status.error already set */
        }
      })();
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

{#if devEnabled}
  <GoRoomDevProbe
    phase={status?.phase ?? "idle"}
    {peerCount}
    inviteDoor={status?.inviteDoor ?? "none"}
    doorUrl={status?.shortUrl ?? null}
  />
{/if}

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
  playLoadProgress={status?.playLoadProgress ?? null}
  playCanvasUrl={status?.playCanvasUrl ?? null}
  playCanvasSrcdoc={status?.playCanvasSrcdoc ?? null}
  playCanvasGeneration={status?.playCanvasGeneration ?? 0}
  playLocalPeerId={status?.localPeerId ?? null}
  onStartPlay={(catalogId) => runtime.startAutoPlay(catalogId)}
  onStartManualPlay={(catalogId, picks) =>
    runtime.startManualPlay(catalogId, picks)}
  onEndPlay={() => void runtime.endPlay()}
  onRemoteAnchorChange={(enabled) => runtime.setRemoteAnchorEnabled(enabled)}
/>

{#if devEnabled && !goAuth.loggedIn}
  <GoRoomDevKeyPanel onApplied={onDevKeyApplied} />
{/if}
