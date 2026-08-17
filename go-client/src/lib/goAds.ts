/**
 * Go shell ad slot config (DEC-054 / PG-GO-ADS-PLAN Phase 1 = house).
 */

export type GoAdsProvider = "house" | "ethical";

/** Narrow / default IAB large mobile banner. */
export const GO_AD_SLOT_NARROW = { width: 320, height: 100 } as const;
/** Wide leaderboard (min-width media query). */
export const GO_AD_SLOT_WIDE = { width: 728, height: 90 } as const;

/**
 * Ads master switch. Unset → enabled (Phase 1 house default on).
 * Set `VITE_GO_ADS_ENABLED=0` or `false` to disable.
 */
export function goAdsEnabled(): boolean {
  const raw = import.meta.env.VITE_GO_ADS_ENABLED as string | undefined;
  if (raw == null || raw === "") return true;
  const v = String(raw).trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

/**
 * Provider id. Phase 1 always resolves to house; standalone also forces house
 * even when Phase 2 ethical is configured.
 */
export function goAdsProvider(
  opts: { standalone?: boolean } = {}
): GoAdsProvider {
  if (opts.standalone) return "house";
  const raw = (import.meta.env.VITE_GO_ADS_PROVIDER as string | undefined)
    ?.trim()
    .toLowerCase();
  if (raw === "ethical" || raw === "ethicalads" || raw === "carbon") {
    // Phase 2 not wired yet — fall back to house until ethical provider ships.
    return "house";
  }
  return "house";
}

/** True when running as installed PWA / iOS home-screen. */
export function isStandaloneDisplay(
  win: Pick<Window, "matchMedia"> & {
    navigator: Navigator & { standalone?: boolean };
  } = typeof window !== "undefined"
    ? window
    : ({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: false },
      } as never)
): boolean {
  try {
    if (win.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* ignore */
  }
  return win.navigator.standalone === true;
}

/** Whether the shell should render an ad slot on allowlisted surfaces. */
export function shouldShowGoAdSlot(opts?: {
  enabled?: boolean;
  canvasActive?: boolean;
}): boolean {
  if (opts?.canvasActive) return false;
  if (opts?.enabled === false) return false;
  return goAdsEnabled();
}
