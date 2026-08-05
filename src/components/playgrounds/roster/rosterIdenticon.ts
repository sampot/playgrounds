/**
 * Deterministic identicon from a stable id (DEC-045). No external images.
 */

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h % 360} ${s}% ${l}%)`;
}

/** Draw identicon onto an existing canvas (size = canvas width). */
export function drawIdenticon(
  canvas: HTMLCanvasElement,
  id: string,
  opts?: { cells?: number }
): void {
  const cells = opts?.cells ?? 5;
  const size = canvas.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const seed = hash32(id || "anon");
  const hue = seed % 360;
  const bg = hsl(hue, 18, 92);
  const fg = hsl(hue, 55, 42);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  const cell = size / cells;
  const mid = Math.ceil(cells / 2);
  let bit = seed;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < mid; x++) {
      bit = (Math.imul(bit, 1103515245) + 12345) >>> 0;
      const on = (bit & 0x10000) !== 0;
      if (!on) continue;
      ctx.fillStyle = fg;
      const mirrorX = cells - 1 - x;
      ctx.fillRect(x * cell, y * cell, cell, cell);
      if (mirrorX !== x) {
        ctx.fillRect(mirrorX * cell, y * cell, cell, cell);
      }
    }
  }
}

/** PNG data URL for list thumbnails. Falls back to empty if no canvas. */
export function identiconDataUrl(
  id: string,
  opts?: { size?: number; cells?: number }
): string {
  const size = opts?.size ?? 40;
  if (typeof document === "undefined") {
    // Node / SSR: return 1x1 transparent PNG
    return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  drawIdenticon(canvas, id, { cells: opts?.cells });
  return canvas.toDataURL("image/png");
}
