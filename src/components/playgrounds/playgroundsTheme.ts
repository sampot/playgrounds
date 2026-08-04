/**
 * Playgrounds chrome / iframe / xterm theme helpers.
 * Follows the blog `html[data-theme]` (not OS prefers-color-scheme alone).
 */

export function isPlaygroundsDarkTheme(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/**
 * Drive iframe `color-scheme` so project CSS `prefers-color-scheme` matches the
 * blog `data-theme` (not OS alone). Set on the frame element and, when
 * same-origin, on the document root — some engines only update media queries
 * after the inner root is explicit.
 */
export function applyIframeColorScheme(
  el: HTMLIFrameElement | null | undefined
): void {
  if (!el) return;
  const scheme = isPlaygroundsDarkTheme() ? "dark" : "light";
  el.style.colorScheme = scheme;
  try {
    const root = el.contentDocument?.documentElement;
    if (root) root.style.colorScheme = scheme;
  } catch {
    /* cross-origin — frame style only */
  }
}

function cssRgbChannels(varName: string, fallback: string): string {
  if (
    typeof document === "undefined" ||
    typeof getComputedStyle !== "function"
  ) {
    return fallback;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return raw || fallback;
}

/** xterm theme derived from current skin CSS variables. */
export function playgroundsXtermTheme(): {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
} {
  const fill = cssRgbChannels("--color-fill", "18 28 26");
  const text = cssRgbChannels("--color-text-base", "226 232 230");
  const accent = cssRgbChannels("--color-accent", "45 212 191");
  return {
    background: `rgb(${fill})`,
    foreground: `rgb(${text})`,
    cursor: `rgb(${accent})`,
    selectionBackground: isPlaygroundsDarkTheme()
      ? "rgb(45 74 68 / 0.55)"
      : "rgb(180 196 190 / 0.45)",
  };
}
