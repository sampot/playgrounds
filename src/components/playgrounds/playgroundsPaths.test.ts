import { afterEach, describe, expect, it } from "vitest";
import {
  PLAYGROUNDS_CANONICAL_ORIGIN,
  applyPlaygroundsPathsFromLocation,
  buildCanonicalOpenUrl,
  configurePlaygroundsPaths,
  detectPlaygroundsBasePath,
  isPlaygroundsCanvasPathname,
  isPlaygroundsFieldHost,
  isPlaygroundsLegacyMount,
  isPlaygroundsShellPathname,
  playgroundsCanvasPrefix,
  playgroundsHomePath,
  playgroundsWasiUrl,
  resetPlaygroundsPathsForTests,
} from "./playgroundsPaths";

afterEach(() => {
  resetPlaygroundsPathsForTests();
});

describe("detectPlaygroundsBasePath", () => {
  it("detects blog mount", () => {
    expect(detectPlaygroundsBasePath("/playgrounds/", "samkuo.me")).toEqual({
      basePath: "/playgrounds",
      mode: "blog",
    });
    expect(
      detectPlaygroundsBasePath("/playgrounds/canvas/x", "localhost")
    ).toEqual({ basePath: "/playgrounds", mode: "blog" });
  });

  it("detects field hosts (play + wildcard)", () => {
    expect(detectPlaygroundsBasePath("/", "play.samkuo.me")).toEqual({
      basePath: "",
      mode: "standalone",
    });
    expect(detectPlaygroundsBasePath("/", "alice.samkuo.me")).toEqual({
      basePath: "",
      mode: "standalone",
    });
    expect(detectPlaygroundsBasePath("/", "localhost")).toEqual({
      basePath: "",
      mode: "standalone",
    });
  });

  it("does not treat reserved subdomains as fields", () => {
    expect(isPlaygroundsFieldHost("www.samkuo.me")).toBe(false);
    expect(isPlaygroundsFieldHost("blog.samkuo.me")).toBe(false);
    expect(isPlaygroundsFieldHost("api.samkuo.me")).toBe(false);
    expect(isPlaygroundsFieldHost("docs.samkuo.me")).toBe(false);
    expect(isPlaygroundsFieldHost("old-blog.samkuo.me")).toBe(false);
    expect(isPlaygroundsFieldHost("play.samkuo.me")).toBe(true);
  });
});

describe("path builders", () => {
  it("blog home and canvas prefix", () => {
    expect(playgroundsHomePath()).toBe("/playgrounds/");
    expect(playgroundsCanvasPrefix()).toBe("/playgrounds/canvas/");
  });

  it("standalone home and canvas prefix", () => {
    configurePlaygroundsPaths({ basePath: "", mode: "standalone" });
    expect(playgroundsHomePath()).toBe("/");
    expect(playgroundsCanvasPrefix()).toBe("/canvas/");
  });

  it("applies from location", () => {
    const cfg = applyPlaygroundsPathsFromLocation({
      pathname: "/",
      hostname: "play.samkuo.me",
    });
    expect(cfg.mode).toBe("standalone");
    expect(playgroundsHomePath()).toBe("/");
  });
});

describe("pathname classifiers", () => {
  it("recognizes both canvas prefixes", () => {
    expect(isPlaygroundsCanvasPathname("/playgrounds/canvas/p/x")).toBe(true);
    expect(isPlaygroundsCanvasPathname("/canvas/p/x")).toBe(true);
    expect(isPlaygroundsCanvasPathname("/playgrounds/")).toBe(false);
  });

  it("classifies shell vs canvas for blog and standalone", () => {
    expect(isPlaygroundsShellPathname("/playgrounds/", "/playgrounds")).toBe(
      true
    );
    expect(
      isPlaygroundsShellPathname("/playgrounds/canvas/p", "/playgrounds")
    ).toBe(false);
    expect(isPlaygroundsShellPathname("/", "")).toBe(true);
    expect(isPlaygroundsShellPathname("/canvas/p", "")).toBe(false);
  });

  it("flags legacy mount for migrate banner", () => {
    expect(isPlaygroundsLegacyMount("/playgrounds/", "samkuo.me")).toBe(true);
    expect(isPlaygroundsLegacyMount("/", "play.samkuo.me")).toBe(false);
  });
});

describe("canonical open URL", () => {
  it("defaults to play.samkuo.me root", () => {
    expect(buildCanonicalOpenUrl("sampot/demo")).toBe(
      `${PLAYGROUNDS_CANONICAL_ORIGIN}/?open=sampot%2Fdemo`
    );
    expect(
      buildCanonicalOpenUrl("acme/demo", { as: "agent", fresh: true })
    ).toBe(
      `${PLAYGROUNDS_CANONICAL_ORIGIN}/?open=acme%2Fdemo&as=agent&fresh=1`
    );
  });
});

describe("static assets", () => {
  it("keeps WASI under /playgrounds/wasi/", () => {
    configurePlaygroundsPaths({ basePath: "", mode: "standalone" });
    expect(playgroundsWasiUrl("jq.wasm")).toBe("/playgrounds/wasi/jq.wasm");
  });
});
