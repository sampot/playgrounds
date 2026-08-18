import { describe, expect, it } from "vitest";
import { isEscapeHomePath, shouldEscapeToHome } from "./goEscapeHome";

describe("isEscapeHomePath", () => {
  it("matches help and apps, including trailing slashes", () => {
    expect(isEscapeHomePath("/help")).toBe(true);
    expect(isEscapeHomePath("/help/")).toBe(true);
    expect(isEscapeHomePath("/apps")).toBe(true);
    expect(isEscapeHomePath("/apps/")).toBe(true);
    expect(isEscapeHomePath("/chat")).toBe(true);
    expect(isEscapeHomePath("/chat/")).toBe(true);
    expect(isEscapeHomePath("/room")).toBe(true);
    expect(isEscapeHomePath("/room/")).toBe(true);
  });

  it("does not match home, play, or invite routes", () => {
    expect(isEscapeHomePath("/")).toBe(false);
    expect(isEscapeHomePath("/s/pg-breakout")).toBe(false);
    expect(isEscapeHomePath("/i/abc")).toBe(false);
  });
});

describe("shouldEscapeToHome", () => {
  it("returns true for Escape on help and apps", () => {
    expect(shouldEscapeToHome({ key: "Escape", pathname: "/help" })).toBe(true);
    expect(shouldEscapeToHome({ key: "Escape", pathname: "/apps" })).toBe(true);
    expect(shouldEscapeToHome({ key: "Escape", pathname: "/chat" })).toBe(true);
    expect(shouldEscapeToHome({ key: "Escape", pathname: "/room" })).toBe(true);
  });

  it("ignores other keys, other routes, modals, and text entry", () => {
    expect(shouldEscapeToHome({ key: "Backspace", pathname: "/help" })).toBe(
      false
    );
    expect(shouldEscapeToHome({ key: "Escape", pathname: "/" })).toBe(false);
    expect(
      shouldEscapeToHome({ key: "Escape", pathname: "/apps", modalOpen: true })
    ).toBe(false);
    expect(
      shouldEscapeToHome({ key: "Escape", pathname: "/help", textEntry: true })
    ).toBe(false);
  });
});
