import { describe, expect, it, vi, afterEach } from "vitest";
import {
  directTextContent,
  isCanvasElement,
  paintLiveCanvases,
} from "./canvasCapture";

describe("canvasCapture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("duck-types canvas without parent-realm instanceof", () => {
    const iframeCanvas = {
      tagName: "CANVAS",
      toDataURL: () => "data:image/png;base64,AA",
      getContext: () => null,
    };
    expect(isCanvasElement(iframeCanvas as unknown as Element)).toBe(true);
    expect(isCanvasElement({ tagName: "DIV" } as unknown as Element)).toBe(
      false
    );
  });

  it("reads direct text nodes only", () => {
    const el = {
      childNodes: [
        { nodeType: 3, textContent: "  hello  " },
        {
          nodeType: 1,
          textContent: "nested",
          childNodes: [],
        },
        { nodeType: 3, textContent: " world" },
      ],
    };
    expect(directTextContent(el as unknown as Element)).toBe("hello world");
  });

  it("paintLiveCanvases draws duck-typed canvases", () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    const canvasEl = {
      tagName: "CANVAS",
      width: 100,
      height: 100,
      toDataURL: () => "data:image/png;base64,AA",
      getContext: () => ({}),
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 100,
        height: 100,
        right: 110,
        bottom: 120,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    };

    const doc = {
      defaultView: { scrollX: 0, scrollY: 0 },
      documentElement: { scrollLeft: 0, scrollTop: 0 },
      querySelectorAll: () => [canvasEl],
    };

    const n = paintLiveCanvases(doc as unknown as Document, ctx, 1);
    expect(n).toBe(1);
    expect(drawImage).toHaveBeenCalledWith(canvasEl, 10, 20, 100, 100);
  });
});
