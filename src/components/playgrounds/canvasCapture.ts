/**
 * Best-effort same-origin work-canvas → PNG.
 *
 * Do NOT use SVG foreignObject for layout: stylesheet cascade inside SVG-as-image
 * reflows poorly (labels jump). Do NOT use parent `instanceof HTMLCanvasElement`
 * on iframe nodes (cross-realm instanceof is false → canvases were skipped).
 *
 * Paint onto a canvas directly:
 * 1) page background
 * 2) approximate HTML boxes / text from getBoundingClientRect
 * 3) live <canvas> bitmaps on top (duck-typed)
 */

import { HostBridgeError } from "./hostBridge";

export interface CanvasCaptureResult {
  base64: string;
  mime: "image/png";
}

export interface CaptureWorkCanvasOptions {
  maxWidth?: number;
}

/** Duck-type: iframe canvases fail `instanceof HTMLCanvasElement` in the parent realm. */
export function isCanvasElement(el: Element): el is HTMLCanvasElement {
  return (
    el.tagName === "CANVAS" &&
    typeof (el as HTMLCanvasElement).toDataURL === "function" &&
    typeof (el as HTMLCanvasElement).getContext === "function"
  );
}

function isTransparentColor(color: string): boolean {
  const c = color.trim().toLowerCase();
  return (
    !c ||
    c === "transparent" ||
    c === "rgba(0, 0, 0, 0)" ||
    c === "rgba(0,0,0,0)"
  );
}

function pageSize(doc: Document): { w: number; h: number } {
  const root = doc.documentElement;
  const body = doc.body;
  const w = Math.max(
    root?.scrollWidth || 0,
    body?.scrollWidth || 0,
    root?.clientWidth || 0,
    1
  );
  const h = Math.max(
    root?.scrollHeight || 0,
    body?.scrollHeight || 0,
    root?.clientHeight || 0,
    1
  );
  return { w, h };
}

function scrollOffset(doc: Document): { x: number; y: number } {
  const win = doc.defaultView;
  return {
    x: win?.scrollX || doc.documentElement.scrollLeft || 0,
    y: win?.scrollY || doc.documentElement.scrollTop || 0,
  };
}

/** Direct text nodes only (avoid painting every ancestor's aggregated text). */
export function directTextContent(el: Element): string {
  let out = "";
  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      out += node.textContent ?? "";
    }
  }
  return out.replace(/\s+/gu, " ").trim();
}

function paintRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (radius < 0.5) {
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}

/**
 * Paint visible HTML (non-canvas) using live geometry.
 * Best-effort: backgrounds + direct text / button labels.
 */
export function paintHtmlApprox(
  doc: Document,
  ctx: CanvasRenderingContext2D,
  scale: number
): void {
  const body = doc.body;
  if (!body) return;
  const { x: scrollX, y: scrollY } = scrollOffset(doc);
  const elements = body.querySelectorAll("*");

  for (const el of elements) {
    if (
      el.tagName === "SCRIPT" ||
      el.tagName === "STYLE" ||
      el.tagName === "LINK" ||
      el.tagName === "NOSCRIPT" ||
      el.tagName === "HEAD" ||
      el.tagName === "META" ||
      el.tagName === "TITLE"
    ) {
      continue;
    }
    if (isCanvasElement(el)) continue;

    const cs = getComputedStyle(el);
    if (
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      Number(cs.opacity) === 0
    ) {
      continue;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 0.5 || rect.height < 0.5) continue;

    const x = (rect.left + scrollX) * scale;
    const y = (rect.top + scrollY) * scale;
    const rw = rect.width * scale;
    const rh = rect.height * scale;

    const bg = cs.backgroundColor;
    if (!isTransparentColor(bg)) {
      ctx.fillStyle = bg;
      const radius = parseFloat(cs.borderRadius) || 0;
      paintRoundedRect(ctx, x, y, rw, rh, radius * scale);
    }

    const borderW = parseFloat(cs.borderTopWidth) || 0;
    if (borderW > 0 && !isTransparentColor(cs.borderTopColor)) {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = Math.max(1, borderW * scale);
      ctx.strokeRect(x, y, rw, rh);
    }

    let text = directTextContent(el);
    if (
      !text &&
      (el.tagName === "BUTTON" ||
        el.tagName === "A" ||
        el.tagName === "LABEL" ||
        el.tagName === "H1" ||
        el.tagName === "H2" ||
        el.tagName === "H3" ||
        el.tagName === "P" ||
        el.tagName === "SPAN") &&
      el.childElementCount === 0
    ) {
      text = (el.textContent || "").replace(/\s+/gu, " ").trim();
    }
    if (!text) continue;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, rw, rh);
    ctx.clip();
    ctx.fillStyle = cs.color || "#000";
    ctx.font = cs.font || `${cs.fontSize || "16px"} sans-serif`;
    const align = cs.textAlign;
    ctx.textAlign =
      align === "center" || align === "right" || align === "left"
        ? align
        : "left";
    ctx.textBaseline = "middle";
    const padL = (parseFloat(cs.paddingLeft) || 0) * scale;
    const padR = (parseFloat(cs.paddingRight) || 0) * scale;
    let tx = x + padL;
    if (ctx.textAlign === "center") tx = x + rw / 2;
    if (ctx.textAlign === "right") tx = x + rw - padR;
    ctx.fillText(text, tx, y + rh / 2, Math.max(0, rw - padL - padR));
    ctx.restore();
  }
}

/** Draw iframe canvases using duck-typing (cross-realm safe). */
export function paintLiveCanvases(
  doc: Document,
  ctx: CanvasRenderingContext2D,
  scale: number
): number {
  const { x: scrollX, y: scrollY } = scrollOffset(doc);
  let painted = 0;
  for (const el of doc.querySelectorAll("canvas")) {
    if (!isCanvasElement(el)) continue;
    if (el.width < 1 || el.height < 1) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 0.5 || rect.height < 0.5) continue;
    const x = (rect.left + scrollX) * scale;
    const y = (rect.top + scrollY) * scale;
    try {
      ctx.drawImage(el, x, y, rect.width * scale, rect.height * scale);
      painted += 1;
    } catch {
      /* cross-origin / tainted source */
    }
  }
  return painted;
}

/**
 * Capture a same-origin iframe document to PNG base64.
 */
export async function captureDocumentToPng(
  doc: Document,
  opts?: CaptureWorkCanvasOptions & { baseUrl?: string }
): Promise<CanvasCaptureResult> {
  const root = doc.documentElement;
  if (!root || !doc.body) {
    throw new HostBridgeError("no_target", "工作畫布尚未載入");
  }
  // baseUrl reserved for future asset inlining; compositor path does not need it.
  void opts?.baseUrl;

  const maxWidth = Math.min(Math.max(opts?.maxWidth ?? 1280, 320), 2400);
  const { w, h } = pageSize(doc);
  const scale = Math.min(1, maxWidth / w);
  const cw = Math.max(1, Math.floor(w * scale));
  const ch = Math.max(1, Math.floor(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new HostBridgeError("capture_failed", "無法建立 canvas context");
  }

  const bodyBg = getComputedStyle(doc.body).backgroundColor;
  ctx.fillStyle = isTransparentColor(bodyBg) ? "#ffffff" : bodyBg;
  ctx.fillRect(0, 0, cw, ch);

  try {
    paintHtmlApprox(doc, ctx, scale);
  } catch (e) {
    throw new HostBridgeError(
      "capture_failed",
      e instanceof Error ? e.message : String(e)
    );
  }

  const painted = paintLiveCanvases(doc, ctx, scale);
  if (painted === 0 && doc.querySelector("canvas")) {
    // Canvases exist but none painted — still return HTML approx; surface hint in empty case only when page is blank-ish.
  }

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/taint|SecurityError/iu.test(msg) || e instanceof DOMException) {
      throw new HostBridgeError(
        "capture_failed",
        "截圖失敗：無法匯出像素（來源 canvas 可能受污染）"
      );
    }
    throw new HostBridgeError("capture_failed", msg);
  }

  const base64 = dataUrl.replace(/^data:image\/png;base64,/u, "");
  if (!base64) {
    throw new HostBridgeError("capture_failed", "截圖結果為空");
  }
  return { base64, mime: "image/png" };
}

/* ---- retained helpers for unit tests / prep utilities ---- */

export function ensureXhtmlNamespace(root: Element): void {
  if (!root.getAttribute("xmlns")) {
    root.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  }
}
