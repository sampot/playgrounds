import { describe, expect, it } from "vitest";
import { boothAnchorStatusLabel } from "./boothSnapshotUi";

describe("boothAnchorStatusLabel", () => {
  it("is silent when anchor is online", () => {
    expect(boothAnchorStatusLabel("online")).toBeNull();
  });

  it("describes degraded and offline anchors", () => {
    expect(boothAnchorStatusLabel("registering")).toContain("連線");
    expect(boothAnchorStatusLabel("degraded")).toContain("不穩定");
    expect(boothAnchorStatusLabel("offline")).toContain("離線");
  });
});
