<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import GoRoomSurface from "$lib/GoRoomSurface.svelte";
  import GoRoomDevKeyPanel from "$lib/GoRoomDevKeyPanel.svelte";
  import {
    createBoothOperatorShell,
    type BoothOperatorShell,
    type OperatorShellStatus,
  } from "$lib/boothOperatorShell";
  import { mintOperatorCap } from "$lib/boothPlatform";
  import { goAuth } from "$lib/goAuth.svelte";
  import { friendlyOperatorError } from "$lib/goFriendlyError";
  import {
    GO_ROOM_OPERATOR_CONNECTING_TITLE,
    operatorRemoteUiPhase,
    readOperatorCapFromSearch,
    shouldMintOperatorCapOnLogin,
    type OperatorMintPhase,
  } from "$lib/operatorRemote";
  import {
    goRoomDevPageEnabled,
    readGoRoomDevRememberedKey,
  } from "$lib/goRoomDev";
  import {
    GO_ROOM_DESCRIPTION,
    goOgMeta,
    goWebPageJsonLd,
  } from "$lib/goShareMeta";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import { chromeSession } from "$lib/chromeSession.svelte";

  const OPERATOR_ACK_FLASH_MS = 2400;
  const OPERATOR_ANCHOR_FLASH_MS = 3200;

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

  const devEnabled = $derived(browser && goRoomDevPageEnabled());

  let capFromUrl = $state(false);
  let operatorCap = $state("");
  let status = $state<OperatorShellStatus | null>(null);
  let remoteShell: BoothOperatorShell | null = null;
  let mintPhase = $state<OperatorMintPhase>("idle");
  let mintError = $state<string | null>(null);
  let mintStarted = $state(false);
  let lastAckFlashKey = $state("");
  let anchorHintFlashKey = $state("");

  const uiPhase = $derived(
    operatorRemoteUiPhase({
      mintPhase,
      shellPhase: status?.phase ?? null,
    })
  );
  const uiMessage = $derived(
    mintPhase === "minting"
      ? GO_ROOM_OPERATOR_CONNECTING_TITLE
      : (status?.message ?? "")
  );
  const uiError = $derived(mintError ?? status?.error ?? null);

  $effect(() => {
    const ack = status?.lastAck;
    if (!ack || ack === lastAckFlashKey) return;
    lastAckFlashKey = ack;
    chromeSession.setFlash(ack, OPERATOR_ACK_FLASH_MS);
  });

  $effect(() => {
    const hint = status?.anchorHint;
    if (!hint || hint === anchorHintFlashKey) return;
    anchorHintFlashKey = hint;
    if (uiPhase !== "open") {
      chromeSession.setFlash(hint, OPERATOR_ANCHOR_FLASH_MS);
    }
  });

  function detachShell(): void {
    remoteShell?.disconnect();
    remoteShell = null;
    status = null;
  }

  function attachShell(cap: string): void {
    detachShell();
    operatorCap = cap;
    remoteShell = createBoothOperatorShell({ operatorCap: cap });
    remoteShell.subscribe((s) => {
      status = s;
    });
    void remoteShell.connect();
  }

  async function mintAndConnect(): Promise<void> {
    mintPhase = "minting";
    mintError = null;
    try {
      const key = goAuth.getPlatformApiKeyForHostLoop();
      if (!key) {
        throw new Error("not_provisioned");
      }
      const minted = await mintOperatorCap(key);
      mintPhase = "idle";
      attachShell(minted.operatorCap);
    } catch (e) {
      mintPhase = "error";
      mintError = friendlyOperatorError(e);
      detachShell();
    }
  }

  function retryConnect(): void {
    mintStarted = false;
    mintPhase = "idle";
    mintError = null;
    detachShell();
    if (capFromUrl && operatorCap) {
      mintStarted = true;
      attachShell(operatorCap);
      return;
    }
    if (goAuth.loggedIn) {
      mintStarted = true;
      void mintAndConnect();
    }
  }

  onMount(() => {
    const cap = browser ? readOperatorCapFromSearch(page.url.searchParams) : "";
    capFromUrl = Boolean(cap);

    if (cap) {
      mintStarted = true;
      attachShell(cap);
    } else if (devEnabled && !goAuth.loggedIn) {
      const remembered = readGoRoomDevRememberedKey({ enabled: true });
      if (remembered) {
        void (async () => {
          try {
            await goAuth.applyFieldApiKey(remembered);
          } catch {
            /* invalid remembered key */
          }
        })();
      }
    }

    return () => {
      detachShell();
    };
  });

  $effect(() => {
    if (!browser || capFromUrl) return;
    if (!goAuth.loggedIn) {
      mintStarted = false;
      mintPhase = "idle";
      mintError = null;
      detachShell();
      operatorCap = "";
      return;
    }
    if (
      !shouldMintOperatorCapOnLogin({
        capFromUrl,
        loggedIn: goAuth.loggedIn,
        mintStarted,
      })
    ) {
      return;
    }
    mintStarted = true;
    void mintAndConnect();
  });

  async function onDevKeyApplied(): Promise<void> {
    mintStarted = false;
    mintPhase = "idle";
    mintError = null;
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

<GoRoomSurface
  role="operator"
  phase={uiPhase}
  message={uiMessage}
  error={uiError}
  loggedIn={capFromUrl ? true : goAuth.loggedIn}
  operatorCapFromUrl={capFromUrl}
  operatorAnchorHint={status?.anchorHint ?? null}
  shortUrl={status?.shortUrl ?? null}
  inviteExpiresAt={status?.inviteExpiresAt ?? null}
  inviteDoor={status?.inviteDoor ?? "none"}
  peerName={status?.peerName ?? null}
  guestCount={status?.guestCount ?? 0}
  occupantNames={status?.occupantNames ?? []}
  occupantPeers={status?.occupantPeers ?? []}
  playCatalogId={status?.playCatalogId ?? null}
  playLoadProgress={status?.playLoadProgress ?? null}
  playLocalPeerId={status?.hostPeerId ?? null}
  playHostName={status?.hostDisplayName ?? null}
  operatorTvOn={status?.tvOn ?? false}
  operatorTvLabel={status?.tvLabel ?? null}
  operatorTvStream={status?.tvStream ?? null}
  operatorCanDirect={status?.canDirect ?? false}
  operatorProgramTransport={status?.programTransport ?? false}
  operatorProgramPaused={status?.programPaused ?? true}
  operatorProgramTime={status?.programTime ?? 0}
  operatorProgramDuration={status?.programDuration ?? 0}
  operatorRemoteLives={status?.remoteLives ?? []}
  operatorLocalCamera={status?.localCamera ?? false}
  operatorLocalMic={status?.localMic ?? false}
  operatorLocalPeerId={remoteShell?.getOperatorPeerId()}
  onLogin={() => goAuth.login()}
  onInvite={() => retryConnect()}
  onRevokeInvite={() => remoteShell?.revokeInvite()}
  onEnd={() => remoteShell?.endBooth()}
  onKick={(peerId) => remoteShell?.kickPeer(peerId)}
  onCastLive={(peerId, name) => remoteShell?.putLiveOnTv(peerId, name)}
  onOperatorCastFile={(fileId, scope) =>
    remoteShell?.putFileOnTv(fileId, scope ?? "share")}
  onOperatorStopTv={() => remoteShell?.stopTv()}
  onOperatorHaltLive={(peerId, layer) => remoteShell?.haltLive(peerId, layer)}
  onOperatorStartRecord={(peerId, name) => remoteShell?.startRecord(peerId, name)}
  onOperatorStopRecord={(peerId) => remoteShell?.stopRecord(peerId)}
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

{#if devEnabled && !goAuth.loggedIn && !capFromUrl}
  <GoRoomDevKeyPanel onApplied={onDevKeyApplied} />
{/if}
