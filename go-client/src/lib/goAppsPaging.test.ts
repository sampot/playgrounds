import { describe, expect, it } from "vitest";
import {
  APPS_PAGE_SIZE,
  appsAdSplit,
  appsPageCount,
  appsPageSlice,
  clampAppsPage,
  parseAppsPageParam,
} from "./goAppsPaging";

describe("goAppsPaging", () => {
  it("uses page size 10", () => {
    expect(APPS_PAGE_SIZE).toBe(10);
  });

  it("counts pages", () => {
    expect(appsPageCount(0)).toBe(0);
    expect(appsPageCount(1)).toBe(1);
    expect(appsPageCount(10)).toBe(1);
    expect(appsPageCount(11)).toBe(2);
    expect(appsPageCount(27)).toBe(3);
  });

  it("clamps page into range", () => {
    expect(clampAppsPage(0, 3)).toBe(1);
    expect(clampAppsPage(-1, 3)).toBe(1);
    expect(clampAppsPage(2, 3)).toBe(2);
    expect(clampAppsPage(99, 3)).toBe(3);
    expect(clampAppsPage(1, 0)).toBe(1);
  });

  it("parses page query", () => {
    expect(parseAppsPageParam(null)).toBe(1);
    expect(parseAppsPageParam("")).toBe(1);
    expect(parseAppsPageParam("2")).toBe(2);
    expect(parseAppsPageParam("0")).toBe(1);
    expect(parseAppsPageParam("nope")).toBe(1);
  });

  it("slices the current page", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `g${i + 1}`);
    expect(appsPageSlice(ids, 1)).toEqual(ids.slice(0, 10));
    expect(appsPageSlice(ids, 2)).toEqual(ids.slice(10, 20));
    expect(appsPageSlice(ids, 3)).toEqual(ids.slice(20, 25));
    expect(appsPageSlice(ids, 99)).toEqual(ids.slice(20, 25));
    expect(appsPageSlice([], 1)).toEqual([]);
  });

  it("splits ad on the page length, not the full list", () => {
    expect(appsAdSplit(0)).toBe(0);
    expect(appsAdSplit(1)).toBe(1);
    expect(appsAdSplit(2)).toBe(1);
    expect(appsAdSplit(10)).toBe(5);
    expect(appsAdSplit(3)).toBe(1);
  });
});
