/**
 * QR generate / decode via npm `qr` (paulmillr/qr).
 * Output is PNG only — never SVG (DEC-045 / plan).
 */

import encodeQR from "qr";
import decodeQR from "qr/decode.js";

export class RosterQrError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "RosterQrError";
  }
}

/** Encode text to PNG bytes via raw modules → canvas (no SVG). */
export async function encodeRosterQrPng(
  text: string,
  opts?: { scale?: number; border?: number }
): Promise<Uint8Array> {
  const scale = opts?.scale ?? 4;
  const border = opts?.border ?? 2;
  const raw = encodeQR(text, "raw", { scale: 1, border, ecc: "medium" });
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RosterQrError("encode_failed", "QR 編碼失敗");
  }
  const modules = raw.length;
  const px = modules * scale;

  if (typeof document === "undefined") {
    // Node tests: build a minimal PNG via canvas polyfill absence — use gif path? No — use OffscreenCanvas if available
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(px, px);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new RosterQrError("no_canvas", "無法建立 canvas");
      paintRaw(ctx, raw, scale);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await blob.arrayBuffer());
    }
    throw new RosterQrError(
      "no_canvas",
      "目前環境無法產生 PNG QR（需要 canvas）"
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new RosterQrError("no_canvas", "無法建立 canvas");
  paintRaw(ctx, raw, scale);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function paintRaw(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  raw: boolean[][],
  scale: number
): void {
  const modules = raw.length;
  const px = modules * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < modules; y++) {
    const row = raw[y]!;
    for (let x = 0; x < modules; x++) {
      if (!row[x]) continue;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}

export async function encodeRosterQrPngDataUrl(
  text: string,
  opts?: { scale?: number; border?: number }
): Promise<string> {
  const bytes = await encodeRosterQrPng(text, opts);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 =
    typeof btoa === "function"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return `data:image/png;base64,${b64}`;
}

/** Decode QR from ImageData / RGBA image (camera frame or file). */
export function decodeRosterQrFromImage(img: {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray | number[];
}): string {
  try {
    return decodeQR(img);
  } catch (e) {
    throw new RosterQrError(
      "decode_failed",
      e instanceof Error ? e.message : String(e)
    );
  }
}

/** Decode QR from a PNG/JPEG File or Blob via canvas. */
export async function decodeRosterQrFromBlob(blob: Blob): Promise<string> {
  if (typeof createImageBitmap === "undefined" && typeof document === "undefined") {
    throw new RosterQrError("no_bitmap", "無法解碼影像");
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new RosterQrError("no_canvas", "無法建立 canvas");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decodeRosterQrFromImage(imageData);
  } finally {
    bitmap.close();
  }
}
