import { describe, expect, it, vi } from "vitest";
import {
  byteToOpenProgress,
  fileListToOpenProgress,
  readResponseBytes,
} from "./transferProgress";

describe("byteToOpenProgress / fileListToOpenProgress", () => {
  it("formats known byte ratio", () => {
    expect(
      byteToOpenProgress({ loaded: 50, total: 100, ratio: 0.5 })
    ).toEqual({ ratio: 0.5, detail: "50%" });
  });

  it("formats indeterminate loaded bytes", () => {
    expect(
      byteToOpenProgress({ loaded: 2048, total: null, ratio: null })
    ).toEqual({ ratio: null, detail: "2 KB" });
  });

  it("formats file list progress", () => {
    expect(
      fileListToOpenProgress({ done: 3, total: 12, ratio: 0.25 })
    ).toEqual({ ratio: 0.25, detail: "3/12" });
  });
});

describe("readResponseBytes", () => {
  it("streams with Content-Length progress", async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]);
    const chunk2 = new Uint8Array([5, 6]);
    let step = 0;
    const reader = {
      read: vi.fn(async () => {
        step += 1;
        if (step === 1) return { done: false, value: chunk1 };
        if (step === 2) return { done: false, value: chunk2 };
        return { done: true, value: undefined };
      }),
      cancel: vi.fn(),
    };
    const response = {
      headers: new Headers({ "content-length": "6" }),
      body: { getReader: () => reader },
      arrayBuffer: vi.fn(),
    } as unknown as Response;

    const reports: number[] = [];
    const bytes = await readResponseBytes(response, {
      onProgress: p => {
        if (p.ratio != null) reports.push(p.ratio);
      },
    });
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(reports.at(-1)).toBe(1);
    expect(reports.some(r => r > 0 && r < 1)).toBe(true);
  });

  it("falls back to arrayBuffer when body is null", async () => {
    const payload = new Uint8Array([9, 8, 7]);
    const response = {
      headers: new Headers(),
      body: null,
      arrayBuffer: async () => payload.buffer.slice(
        payload.byteOffset,
        payload.byteOffset + payload.byteLength
      ),
    } as unknown as Response;

    const last: { loaded: number }[] = [];
    const bytes = await readResponseBytes(response, {
      onProgress: p => last.push({ loaded: p.loaded }),
    });
    expect(Array.from(bytes)).toEqual([9, 8, 7]);
    expect(last.at(-1)?.loaded).toBe(3);
  });

  it("rejects when maxBytes exceeded during stream", async () => {
    const reader = {
      read: vi.fn(async () => ({
        done: false,
        value: new Uint8Array(10),
      })),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const response = {
      headers: new Headers(),
      body: { getReader: () => reader },
    } as unknown as Response;

    await expect(
      readResponseBytes(response, { maxBytes: 5 })
    ).rejects.toThrow(/上限/);
    expect(reader.cancel).toHaveBeenCalled();
  });
});
