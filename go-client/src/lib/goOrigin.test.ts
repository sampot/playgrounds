import { describe, expect, it } from "vitest";
import {
  goPageOrigin,
  isLoopbackPageOrigin,
  localizeInviteShortUrl,
} from "./goOrigin";

describe("localizeInviteShortUrl", () => {
  it("rewrites production short URLs onto the local go origin", () => {
    expect(
      localizeInviteShortUrl(
        "https://go.samkuo.me/i/abc_12",
        "http://localhost:5174"
      )
    ).toBe("http://localhost:5174/i/abc_12");
    expect(
      localizeInviteShortUrl(
        "https://go.samkuo.me/i/abc_12",
        "http://127.0.0.1:5174"
      )
    ).toBe("http://127.0.0.1:5174/i/abc_12");
  });

  it("leaves production short URLs alone on the official go origin", () => {
    expect(
      localizeInviteShortUrl(
        "https://go.samkuo.me/i/abc_12",
        "https://go.samkuo.me"
      )
    ).toBe("https://go.samkuo.me/i/abc_12");
  });

  it("returns the original string when the short URL is unusable", () => {
    expect(
      localizeInviteShortUrl("not-a-url", "http://localhost:5174")
    ).toBe("not-a-url");
  });
});

describe("isLoopbackPageOrigin", () => {
  it("detects localhost-style origins used in go:dev", () => {
    expect(isLoopbackPageOrigin("http://localhost:5174")).toBe(true);
    expect(isLoopbackPageOrigin("https://go.samkuo.me")).toBe(false);
  });
});

describe("goPageOrigin", () => {
  it("uses the page origin on loopback and official go otherwise", () => {
    expect(
      goPageOrigin({ origin: "http://localhost:5174", hostname: "localhost" })
    ).toBe("http://localhost:5174");
    expect(
      goPageOrigin({ origin: "https://go.samkuo.me", hostname: "go.samkuo.me" })
    ).toBe("https://go.samkuo.me");
  });
});
