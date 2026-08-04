/**
 * Playgrounds URL / path helpers (DEC-041).
 * Blog mount: base `/playgrounds`; standalone subdomain: base `` (root `/`).
 * Canvas: `${base}/canvas/` → blog `/playgrounds/canvas/`, standalone `/canvas/`.
 * Static WASI assets stay under `/playgrounds/wasi/` in both deploys (public folder).
 */

export {
  PLAYGROUNDS_CANONICAL_ORIGIN,
  buildCanonicalOpenUrl,
  playgroundsCanonicalHomeUrl,
} from "../../utils/playgroundsUrls";
import { PLAYGROUNDS_CANONICAL_ORIGIN } from "../../utils/playgroundsUrls";

/** Legacy blog mount (transition; do not delete until Phase 7). */
export const PLAYGROUNDS_LEGACY_ORIGIN = "https://samkuo.me";
export const PLAYGROUNDS_LEGACY_BASE_PATH = "/playgrounds";

export type PlaygroundsDeployMode = "blog" | "standalone";

export type PlaygroundsPathConfig = {
  /** App mount without trailing slash. Blog: `/playgrounds`; standalone: ``. */
  basePath: string;
  mode: PlaygroundsDeployMode;
};

function initialPathConfig(): PlaygroundsPathConfig {
  try {
    const envBase = (
      import.meta as ImportMeta & {
        env?: Record<string, string | undefined>;
      }
    ).env?.PUBLIC_PLAYGROUNDS_BASE_PATH;
    if (typeof envBase === "string") {
      const basePath = normalizeBasePath(envBase);
      return { basePath, mode: basePath ? "blog" : "standalone" };
    }
  } catch {
    /* vitest / non-vite */
  }
  return {
    basePath: PLAYGROUNDS_LEGACY_BASE_PATH,
    mode: "blog",
  };
}

let config: PlaygroundsPathConfig = initialPathConfig();

/** Normalize to `` or `/foo` (no trailing slash). */
export function normalizeBasePath(raw: string | undefined | null): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s || s === "/") return "";
  if (!s.startsWith("/")) s = `/${s}`;
  return s.replace(/\/+$/, "");
}

export function getPlaygroundsPathConfig(): Readonly<PlaygroundsPathConfig> {
  return config;
}

export function configurePlaygroundsPaths(
  next: Partial<PlaygroundsPathConfig>
): PlaygroundsPathConfig {
  if (next.basePath !== undefined) {
    config = {
      ...config,
      basePath: normalizeBasePath(next.basePath),
    };
  }
  if (next.mode !== undefined) {
    config = { ...config, mode: next.mode };
  } else if (next.basePath !== undefined) {
    config = {
      ...config,
      mode: config.basePath ? "blog" : "standalone",
    };
  }
  return config;
}

/** Reset to blog defaults (tests). */
export function resetPlaygroundsPathsForTests(): void {
  config = {
    basePath: PLAYGROUNDS_LEGACY_BASE_PATH,
    mode: "blog",
  };
}

/**
 * Infer deploy mode from location.
 * - Host `playgrounds.samkuo.me` / `playgrounds.*` → standalone root.
 * - Path under `/playgrounds` → blog mount.
 * - Else → standalone (local preview at `/`).
 */
export function detectPlaygroundsBasePath(
  pathname: string,
  hostname = ""
): { basePath: string; mode: PlaygroundsDeployMode } {
  const host = hostname.toLowerCase();
  if (
    host === "playgrounds.samkuo.me" ||
    host.startsWith("playgrounds.") ||
    host === "playgrounds.localhost"
  ) {
    return { basePath: "", mode: "standalone" };
  }
  if (
    pathname === "/playgrounds" ||
    pathname === "/playgrounds/" ||
    pathname.startsWith("/playgrounds/")
  ) {
    return { basePath: "/playgrounds", mode: "blog" };
  }
  return { basePath: "", mode: "standalone" };
}

/** Apply detection from a Location-like object (browser boot). */
export function applyPlaygroundsPathsFromLocation(loc: {
  pathname: string;
  hostname: string;
}): PlaygroundsPathConfig {
  const detected = detectPlaygroundsBasePath(loc.pathname, loc.hostname);
  return configurePlaygroundsPaths(detected);
}

export function playgroundsBasePath(): string {
  return config.basePath;
}

export function playgroundsDeployMode(): PlaygroundsDeployMode {
  return config.mode;
}

/** App home with trailing slash: `/playgrounds/` or `/`. */
export function playgroundsHomePath(): string {
  return config.basePath ? `${config.basePath}/` : "/";
}

/**
 * Canvas virtual-origin prefix with trailing slash.
 * Blog: `/playgrounds/canvas/`; standalone: `/canvas/`.
 */
export function playgroundsCanvasPrefix(): string {
  return config.basePath
    ? `${config.basePath}/canvas/`
    : "/canvas/";
}

/** Both prefixes the SW must recognize (blog + standalone). */
export const PLAYGROUNDS_CANVAS_PREFIXES = [
  "/playgrounds/canvas/",
  "/canvas/",
] as const;

export function isPlaygroundsCanvasPathname(pathname: string): boolean {
  for (const prefix of PLAYGROUNDS_CANVAS_PREFIXES) {
    if (pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Shell document paths (not canvas). Uses active config base, plus always
 * recognizes the blog mount so shared SW logic stays correct.
 */
export function isPlaygroundsShellPathname(
  pathname: string,
  basePath = config.basePath
): boolean {
  if (isPlaygroundsCanvasPathname(pathname)) return false;
  const base = normalizeBasePath(basePath);
  if (base) {
    if (pathname === base || pathname === `${base}/`) return true;
    if (pathname.startsWith(`${base}/`)) return true;
    return false;
  }
  // Standalone root shell
  return pathname === "/" || pathname === "/index.html";
}

/** True when this page is the transitional blog mount (show migrate banner). */
export function isPlaygroundsLegacyMount(
  pathname: string,
  hostname: string
): boolean {
  const { mode } = detectPlaygroundsBasePath(pathname, hostname);
  if (mode !== "blog") return false;
  // Local blog-style mount also shows the tip (same empty-OPFS story when moving).
  return true;
}

/** Canonical share origin for `?open=` links (formal field). */
export function playgroundsShareOrigin(): string {
  return PLAYGROUNDS_CANONICAL_ORIGIN;
}

/** Static WASI / public assets under `public/playgrounds/…` (both deploys). */
export function playgroundsStaticAssetUrl(relPath: string): string {
  const clean = relPath.replace(/^\/+/, "");
  return `/playgrounds/${clean}`;
}

export function playgroundsWasiUrl(filename: string): string {
  return playgroundsStaticAssetUrl(`wasi/${filename.replace(/^\/+/, "")}`);
}
