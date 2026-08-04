import { describe, expect, it, beforeEach } from "vitest";
import {
  appendWorkNetworkEntry,
  clearWorkNetworkBuffer,
  listWorkNetworkEntries,
  resetWorkNetworkBufferForTests,
  workNetworkBufferSize,
} from "./workNetworkBuffer";

describe("workNetworkBuffer", () => {
  beforeEach(() => {
    resetWorkNetworkBufferForTests();
  });

  it("appends and lists with monotonic indices", () => {
    appendWorkNetworkEntry({
      method: "GET",
      url: "/api/x",
      status: 200,
      ok: true,
      durationMs: 12,
    });
    appendWorkNetworkEntry({
      method: "POST",
      url: "/api/y",
      status: 500,
      ok: false,
      durationMs: 3,
    });
    const all = listWorkNetworkEntries();
    expect(all).toHaveLength(2);
    expect(all[0].index).toBe(0);
    expect(all[1].method).toBe("POST");
  });

  it("filters with since cursor", () => {
    appendWorkNetworkEntry({
      method: "GET",
      url: "/a",
      status: 200,
      ok: true,
      durationMs: 1,
    });
    const mid = appendWorkNetworkEntry({
      method: "GET",
      url: "/b",
      status: 200,
      ok: true,
      durationMs: 1,
    });
    appendWorkNetworkEntry({
      method: "GET",
      url: "/c",
      status: 200,
      ok: true,
      durationMs: 1,
    });
    expect(listWorkNetworkEntries(mid.index).map(e => e.url)).toEqual(["/c"]);
  });

  it("clears contents but keeps index counter", () => {
    appendWorkNetworkEntry({
      method: "GET",
      url: "/a",
      status: 200,
      ok: true,
      durationMs: 1,
    });
    clearWorkNetworkBuffer();
    expect(workNetworkBufferSize()).toBe(0);
    const next = appendWorkNetworkEntry({
      method: "GET",
      url: "/b",
      status: 200,
      ok: true,
      durationMs: 1,
    });
    expect(next.index).toBe(1);
  });
});
