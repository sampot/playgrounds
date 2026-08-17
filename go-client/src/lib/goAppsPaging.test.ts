import { describe, expect, it } from "vitest";
import {
  APPS_PAGE_SIZE,
  appsPageCount,
  appsPageSlice,
  clampAppsPage,
  parseAppsPageParam,
} from "./goAppsPaging";

describe("goAppsPaging", () => {
  it("uses page size 5", () => {
    expect(APPS_PAGE_SIZE).toBe(5);
  });

  it("counts pages", () => {
    expect(appsPageCount(0)).toBe(0);
    expect(appsPageCount(1)).toBe(1);
    expect(appsPageCount(5)).toBe(1);
    expect(appsPageCount(6)).toBe(2);
    expect(appsPageCount(27)).toBe(6);
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
    const ids = Array.from({ length: 12 }, (_, i) => `g${i + 1}`);
    expect(appsPageSlice(ids, 1)).toEqual(ids.slice(0, 5));
    expect(appsPageSlice(ids, 2)).toEqual(ids.slice(5, 10));
    expect(appsPageSlice(ids, 3)).toEqual(ids.slice(10, 12));
    expect(appsPageSlice(ids, 99)).toEqual(ids.slice(10, 12));
    expect(appsPageSlice([], 1)).toEqual([]);
  });
});
