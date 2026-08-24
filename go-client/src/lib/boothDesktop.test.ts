import { describe, expect, it } from "vitest";
import { isBoothDesktopShell } from "./boothDesktop";
import {
  boothDesktopHomeRedirectPath,
  boothDesktopScopeRedirect,
} from "./boothDesktopNav";

describe("boothDesktop", () => {
  it("is false in vitest (no Tauri internals)", () => {
    expect(isBoothDesktopShell()).toBe(false);
  });

  it("redirects lobby paths to /room in the desktop shell", () => {
    expect(boothDesktopScopeRedirect("/")).toBe("/room");
    expect(boothDesktopScopeRedirect("/index.html")).toBe("/room");
    expect(boothDesktopScopeRedirect("/s/pg-gomoku")).toBe("/room");
    expect(boothDesktopHomeRedirectPath("/")).toBe("/room");
    expect(boothDesktopScopeRedirect("/room")).toBeNull();
    expect(boothDesktopScopeRedirect("/room/remote")).toBeNull();
  });
});
