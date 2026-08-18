<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    GO_HOME_DESCRIPTION,
    GO_HOME_DOCUMENT_TITLE,
    goOgMeta,
    goWebsiteJsonLd,
  } from "$lib/goShareMeta";
  import {
    claimBossWelcome,
    pickBossWelcome,
    readRecentBossWelcomes,
    rememberBossWelcome,
  } from "$lib/goBossWelcome";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { goAuth } from "$lib/goAuth.svelte";
  import GoAdSlot from "$lib/GoAdSlot.svelte";
  import GoShopLobby from "$lib/GoShopLobby.svelte";
  import GoShopHotspotNav from "$lib/GoShopHotspotNav.svelte";
  import {
    dismissBulletin,
    filterActiveBulletins,
    GO_BULLETIN_FIXTURE,
    readDismissedBulletins,
  } from "$lib/goBulletin";
  import {
    resolveShopHotspotAction,
    type ShopHotspotId,
  } from "$lib/goShopHotspots";
  import { GO_LISTED_CATALOG, recommendHome, type GoCatalogEntry } from "$lib/goCatalog";
  import {
    cabinetStandPoint,
    lobbyDayKey,
    readLobbyCabinetStore,
    resolveCabinetHotspotAction,
    resolveLobbyCabinetGames,
    writeLobbyCabinetIds,
    writeLobbyReturnStand,
  } from "$lib/goLobbyCabinets";
  import { getLobbySfxPlayer } from "$lib/goLobbySfx";
  import { formatGoBuildStamp, GO_BUILD_ISO } from "$lib/goBuildStamp";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";

  const buildStamp = formatGoBuildStamp(GO_BUILD_ISO);

  let bossDialogOpen = $state(false);
  let helpDeskOpen = $state(false);
  let cabinetOpen = $state(false);
  let bulletinBoardOpen = $state(false);
  let sfxEnabled = $state(true);
  let cabinetGames = $state<GoCatalogEntry[]>([]);
  const cabinetTitles = $derived(cabinetGames.map((g) => g.title));
  let dismissedBulletins = $state<Record<string, number>>({});
  let activeBulletins = $derived(
    filterActiveBulletins(GO_BULLETIN_FIXTURE, { dismissed: dismissedBulletins })
  );
  const og = goOgMeta({
    title: GO_HOME_DOCUMENT_TITLE,
    description: GO_HOME_DESCRIPTION,
    url: `${PLAYGROUNDS_GO_ORIGIN}/`,
  });
  const websiteLd = goWebsiteJsonLd();
  const websiteLdJson = JSON.stringify(websiteLd);
  onMount(() => {
    dismissedBulletins = readDismissedBulletins(localStorage);
    sfxEnabled = getLobbySfxPlayer().isEnabled();
    const listed = GO_LISTED_CATALOG.filter((e) => e.kind === "game");
    const stored = readLobbyCabinetStore(sessionStorage);
    const today = lobbyDayKey();
    cabinetGames = resolveLobbyCabinetGames({
      storedIds: stored.ids,
      storedDay: stored.day,
      today,
      listed,
      pick: (limit) => recommendHome(limit),
    });
    writeLobbyCabinetIds(
      sessionStorage,
      cabinetGames.map((g) => g.id),
      today
    );

    let authChecks = 0;
    let timer: ReturnType<typeof setTimeout>;

    function welcomeWhenAuthSettles() {
      // Provision/login feedback owns the shared flash channel. Wait for auth
      // to settle, then stay quiet if it produced a more important message.
      if (goAuth.busy) {
        if (authChecks < 50) {
          authChecks += 1;
          timer = setTimeout(welcomeWhenAuthSettles, 100);
        } else {
          // Auth feedback keeps priority even if its network request is slow.
          claimBossWelcome(sessionStorage);
        }
        return;
      }

      if (!claimBossWelcome(sessionStorage)) return;
      if (chromeSession.flash) return;

      const welcome = pickBossWelcome({
        recentIndices: readRecentBossWelcomes(localStorage),
        offline: navigator.onLine === false,
        signedIn: goAuth.loggedIn,
      });
      rememberBossWelcome(localStorage, welcome.index);
      chromeSession.setFlash(welcome.text, 3800);
    }

    // Let the root layout start goAuth.initFromLocation() before deciding
    // whether the welcome or login feedback should use the flash channel.
    timer = setTimeout(welcomeWhenAuthSettles, 250);
    return () => clearTimeout(timer);
  });

  function showBossBanter() {
    const line = pickBossWelcome({
      recentIndices: readRecentBossWelcomes(localStorage),
      offline: navigator.onLine === false,
      signedIn: goAuth.loggedIn,
    });
    rememberBossWelcome(localStorage, line.index);
    chromeSession.setFlash(line.text, 3800);
  }

  function listedGames() {
    return GO_LISTED_CATALOG.filter((e) => e.kind === "game");
  }

  function persistFloorCabinets(games: readonly GoCatalogEntry[]) {
    writeLobbyCabinetIds(
      sessionStorage,
      games.map((g) => g.id),
      lobbyDayKey()
    );
  }

  function reshuffleFloorCabinets() {
    cabinetGames = resolveLobbyCabinetGames({
      storedIds: [],
      listed: listedGames(),
      pick: (limit) => recommendHome(limit),
      force: true,
    });
    persistFloorCabinets(cabinetGames);
  }

  function rememberCabinetStand(index: number | null | undefined) {
    if (index == null) return;
    writeLobbyReturnStand(sessionStorage, cabinetStandPoint(index));
  }

  function openCabinets() {
    helpDeskOpen = false;
    bossDialogOpen = false;
    bulletinBoardOpen = false;
    cabinetOpen = true;
  }

  function openHelpDesk() {
    cabinetOpen = false;
    bossDialogOpen = false;
    bulletinBoardOpen = false;
    helpDeskOpen = true;
  }

  function handleHotspot(
    id: ShopHotspotId,
    detail?: { cabinetIndex?: number | null }
  ) {
    const sfx = getLobbySfxPlayer();
    sfx.unlock();
    const action = resolveShopHotspotAction(id);
    if (action.type === "toggle-sfx") {
      sfxEnabled = sfx.toggleEnabled();
      return;
    }
    sfx.playInteract(id);
    switch (action.type) {
      case "boss-menu":
        cabinetOpen = false;
        helpDeskOpen = false;
        bulletinBoardOpen = false;
        bossDialogOpen = true;
        break;
      case "open-cabinets": {
        const cab = resolveCabinetHotspotAction({
          cabinetIndex: detail?.cabinetIndex ?? null,
          games: cabinetGames,
        });
        if (cab.type === "play-cabinet") {
          rememberCabinetStand(detail?.cabinetIndex);
          void goto(`/s/${encodeURIComponent(cab.catalogId)}`);
          break;
        }
        openCabinets();
        break;
      }
      case "open-bulletin":
        cabinetOpen = false;
        helpDeskOpen = false;
        bossDialogOpen = false;
        bulletinBoardOpen = true;
        break;
      case "navigate":
        void goto(action.href);
        break;
    }
  }

  function handleBossMenu(choice: "banter" | "cabinets" | "help") {
    if (choice === "banter") showBossBanter();
    else if (choice === "cabinets") openCabinets();
    else openHelpDesk();
  }

  function handleBulletinDismiss(bulletin: (typeof activeBulletins)[number]) {
    dismissedBulletins = dismissBulletin(localStorage, bulletin);
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
  {@html `<script type="application/ld+json">${websiteLdJson}</script>`}
</svelte:head>

<h1 class="sr-only">純玩</h1>

<GoShopLobby
  onHotspot={handleHotspot}
  bind:helpDeskOpen
  bind:cabinetOpen
  bind:bossOpen={bossDialogOpen}
  bind:bulletinOpen={bulletinBoardOpen}
  {cabinetTitles}
  floorGames={cabinetGames}
  onReshuffleCabinets={reshuffleFloorCabinets}
  bulletins={activeBulletins}
  onBulletinDismiss={handleBulletinDismiss}
  onBossChoose={handleBossMenu}
/>
<GoShopHotspotNav onSelect={handleHotspot} sfxEnabled={sfxEnabled} />

<div class="home-ad" id="go-home-ad">
  <GoAdSlot />
</div>

<footer class="home-footer">
  <p>
    建置
    <time datetime={GO_BUILD_ISO}>{buildStamp}</time>
  </p>
</footer>

<style>
  .sr-only {
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
  .home-ad {
    margin: 0;
  }
  .home-ad:has(:global(.go-ad-slot)) {
    margin: 0 0 1.15rem;
  }
  .home-ad :global(.go-ad-slot) {
    margin-top: 0;
  }
  .home-footer {
    margin: 1.75rem 0 0;
    padding-top: 0.85rem;
    border-top: var(--pixel-edge) solid
      color-mix(in oklab, rgb(var(--ink)) 18%, transparent);
    text-align: center;
  }
  .home-footer p {
    margin: 0;
    font-size: 0.75rem;
    letter-spacing: 0.02em;
    color: color-mix(in oklab, rgb(var(--muted)) 92%, transparent);
  }
  .home-footer time {
    font-variant-numeric: tabular-nums;
  }
</style>
