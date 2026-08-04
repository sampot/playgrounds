/**
 * Layout / viewport metrics for the work-canvas iframe (HOST.getCanvasStatus).
 * Helps agents detect overflow / clipped <canvas> that screenshots can hide
 * (capture often paints the full scrollable document, not only the folded view).
 */

export interface CanvasElementViewport {
  id: string;
  backingWidth: number;
  backingHeight: number;
  clientWidth: number;
  clientHeight: number;
  /** Fraction of the element box visible inside the iframe viewport (0–1). */
  visibleWidthRatio: number;
  visibleHeightRatio: number;
  clipped: boolean;
}

export interface WorkCanvasViewport {
  iframeWidth: number;
  iframeHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  scrollX: number;
  scrollY: number;
  overflowX: boolean;
  overflowY: boolean;
  canvases: CanvasElementViewport[];
  /** True when page overflows or any measured canvas is clipped in the default view. */
  clipped: boolean;
  note: string;
}

function isCanvasElement(el: Element): el is HTMLCanvasElement {
  return (
    el.tagName === "CANVAS" &&
    typeof (el as HTMLCanvasElement).getContext === "function"
  );
}

/**
 * Measure iframe viewport vs document scroll size and visible fractions of canvases.
 * `iframe` is the work preview iframe element in the shell page.
 */
export function measureWorkCanvasViewport(
  iframe: HTMLIFrameElement | null | undefined
): WorkCanvasViewport | null {
  const doc = iframe?.contentDocument;
  const win = iframe?.contentWindow;
  if (!iframe || !doc?.documentElement || !win) return null;

  const root = doc.documentElement;
  const body = doc.body;
  const iframeWidth = Math.max(1, Math.round(iframe.clientWidth || 0));
  const iframeHeight = Math.max(1, Math.round(iframe.clientHeight || 0));
  const scrollWidth = Math.max(
    root.scrollWidth || 0,
    body?.scrollWidth || 0,
    iframeWidth
  );
  const scrollHeight = Math.max(
    root.scrollHeight || 0,
    body?.scrollHeight || 0,
    iframeHeight
  );
  const scrollX = Math.round(win.scrollX || root.scrollLeft || 0);
  const scrollY = Math.round(win.scrollY || root.scrollTop || 0);
  const overflowX = scrollWidth > iframeWidth + 1;
  const overflowY = scrollHeight > iframeHeight + 1;

  const canvases: CanvasElementViewport[] = [];
  for (const el of doc.querySelectorAll("canvas")) {
    if (!isCanvasElement(el)) continue;
    const rect = el.getBoundingClientRect();
    const visibleLeft = Math.max(0, rect.left);
    const visibleTop = Math.max(0, rect.top);
    const visibleRight = Math.min(iframeWidth, rect.right);
    const visibleBottom = Math.min(iframeHeight, rect.bottom);
    const visibleW = Math.max(0, visibleRight - visibleLeft);
    const visibleH = Math.max(0, visibleBottom - visibleTop);
    const boxW = Math.max(1, rect.width);
    const boxH = Math.max(1, rect.height);
    const visibleWidthRatio = Math.min(1, visibleW / boxW);
    const visibleHeightRatio = Math.min(1, visibleH / boxH);
    const clipped = visibleWidthRatio < 0.98 || visibleHeightRatio < 0.98;
    canvases.push({
      id: el.id || "",
      backingWidth: el.width || 0,
      backingHeight: el.height || 0,
      clientWidth: Math.round(el.clientWidth || rect.width || 0),
      clientHeight: Math.round(el.clientHeight || rect.height || 0),
      visibleWidthRatio: Math.round(visibleWidthRatio * 1000) / 1000,
      visibleHeightRatio: Math.round(visibleHeightRatio * 1000) / 1000,
      clipped,
    });
  }

  const clipped = overflowX || overflowY || canvases.some(c => c.clipped);
  const note = clipped
    ? "Viewport clips content (overflow or canvas not fully visible without scrolling). capture_canvas may still show the full page — do not treat a screenshot alone as proof the default preview shows everything. Shrink layout / use max-width:100% + fluid canvas sizing so overflowX/Y are false."
    : "Default iframe viewport shows the measured document without overflow.";

  return {
    iframeWidth,
    iframeHeight,
    scrollWidth,
    scrollHeight,
    scrollX,
    scrollY,
    overflowX,
    overflowY,
    canvases,
    clipped,
    note,
  };
}
