import { describe, expect, it } from "vitest";
import encodeQR from "qr";
import decodeQR from "qr/decode.js";
import { encodeRosterQrPng, encodeRosterQrPngDataUrl } from "./rosterQr";

describe("rosterQr", () => {
  it("raw modules round-trip via decodeQR", () => {
    const text = "roster-wire-test";
    const raw = encodeQR(text, "raw", { scale: 1, border: 2 });
    const h = raw.length;
    const w = raw[0]!.length;
    const scale = 4;
    const data = new Uint8ClampedArray(w * scale * h * scale * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const on = raw[y]![x]!;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const i = ((y * scale + dy) * w * scale + (x * scale + dx)) * 4;
            const v = on ? 0 : 255;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
          }
        }
      }
    }
    const decoded = decodeQR({
      width: w * scale,
      height: h * scale,
      data,
    });
    expect(decoded).toBe(text);
  });

  it("encodeRosterQrPng produces PNG bytes when OffscreenCanvas exists", async () => {
    if (typeof OffscreenCanvas === "undefined") {
      // jsdom / node without OffscreenCanvas — skip runtime png
      expect(true).toBe(true);
      return;
    }
    const bytes = await encodeRosterQrPng("hello");
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x4e); // N
    expect(bytes[3]).toBe(0x47); // G
    const url = await encodeRosterQrPngDataUrl("hello");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
