import { describe, expect, it } from "vitest";
import {
  isGoCanvasHostPath,
  pickGoShellApiClients,
} from "./goShellClientPick";

describe("pickGoShellApiClients", () => {
  it("prefers a focused /s/ page over the home tab", () => {
    const picked = pickGoShellApiClients([
      { url: "https://go.samkuo.me/", focused: true, visibilityState: "visible" },
      {
        url: "https://go.samkuo.me/s/pg-breakout",
        focused: true,
        visibilityState: "visible",
      },
    ]);
    expect(picked.map(c => new URL(c.url).pathname)).toEqual([
      "/s/pg-breakout",
      "/",
    ]);
  });

  it("skips canvas iframe clients", () => {
    const picked = pickGoShellApiClients([
      { url: "https://go.samkuo.me/canvas/go-abc/index.html?v=1" },
      { url: "https://go.samkuo.me/s/pg-breakout" },
    ]);
    expect(picked).toHaveLength(1);
    expect(new URL(picked[0]!.url).pathname).toBe("/s/pg-breakout");
  });

  it("ranks focused host ahead of hidden host", () => {
    const picked = pickGoShellApiClients([
      {
        url: "https://go.samkuo.me/s/pg-gomoku",
        focused: false,
        visibilityState: "hidden",
      },
      {
        url: "https://go.samkuo.me/s/pg-breakout",
        focused: true,
        visibilityState: "visible",
      },
    ]);
    expect(new URL(picked[0]!.url).pathname).toBe("/s/pg-breakout");
  });
});

describe("isGoCanvasHostPath", () => {
  it("accepts solo and invite paths", () => {
    expect(isGoCanvasHostPath("/s/pg-breakout")).toBe(true);
    expect(isGoCanvasHostPath("/i/abc")).toBe(true);
    expect(isGoCanvasHostPath("/")).toBe(false);
  });
});
