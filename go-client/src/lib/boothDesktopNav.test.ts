import { describe, expect, it } from "vitest";
import {
  boothDesktopExternalPlaygroundUrl,
  boothDesktopScopeRedirect,
  isBoothDesktopInAppPath,
} from "./boothDesktopNav";

describe("boothDesktopNav", () => {
  it("allows only /room routes in the shell", () => {
    expect(isBoothDesktopInAppPath("/room")).toBe(true);
    expect(isBoothDesktopInAppPath("/room/")).toBe(true);
    expect(isBoothDesktopInAppPath("/room/remote")).toBe(true);
    expect(isBoothDesktopInAppPath("/")).toBe(false);
    expect(isBoothDesktopInAppPath("/s/pg-gomoku")).toBe(false);
    expect(isBoothDesktopInAppPath("/apps")).toBe(false);
  });

  it("redirects out-of-scope paths to /room", () => {
    expect(boothDesktopScopeRedirect("/")).toBe("/room");
    expect(boothDesktopScopeRedirect("/s/pg-gomoku")).toBe("/room");
    expect(boothDesktopScopeRedirect("/room")).toBeNull();
  });

  it("maps playground links to the public go origin", () => {
    expect(
      boothDesktopExternalPlaygroundUrl("/", "tauri://localhost")
    ).toBe("https://go.samkuo.me/");
    expect(
      boothDesktopExternalPlaygroundUrl(
        "/s/pg-gomoku",
        "tauri://localhost"
      )
    ).toBe("https://go.samkuo.me/s/pg-gomoku");
    expect(
      boothDesktopExternalPlaygroundUrl(
        "https://play.samkuo.me/sam/",
        "tauri://localhost"
      )
    ).toBe("https://play.samkuo.me/sam/");
  });

  it("keeps dash login and booth paths in the WebView", () => {
    expect(
      boothDesktopExternalPlaygroundUrl(
        "https://dash.samkuo.me/go/login?field=tauri://localhost",
        "tauri://localhost"
      )
    ).toBeNull();
    expect(
      boothDesktopExternalPlaygroundUrl("/room", "tauri://localhost")
    ).toBeNull();
  });
});
