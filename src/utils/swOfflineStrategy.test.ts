import { describe, expect, it } from "vitest";
import {
  extractShellAssetUrls,
  selectOfflineFetchStrategy,
  strategyPrefersNetworkWhileOnline,
} from "./swOfflineStrategy";

describe("selectOfflineFetchStrategy", () => {
  it("uses network-first for Playgrounds shell and /offline/", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/",
        requestMode: "navigate",
      })
    ).toBe("network-first-document");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/wasi/jq.wasm",
        requestMode: "cors",
      })
    ).toBe("network-first-document");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/offline/",
        requestMode: "navigate",
      })
    ).toBe("network-first-document");
  });

  it("does not cache-first /_app — network-first so online deploys win", () => {
    const strategy = selectOfflineFetchStrategy({
      pathname: "/_app/immutable/entry/app.abc123.js",
      requestMode: "cors",
    });
    expect(strategy).toBe("network-first-asset");
    expect(strategyPrefersNetworkWhileOnline(strategy)).toBe(true);
  });

  it("still network-first legacy /_astro for sticky caches", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/_astro/PlaygroundsApp.abc123.js",
        requestMode: "cors",
      })
    ).toBe("network-first-asset");
  });

  it("does not treat /tools as offline documents", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/tools/",
        requestMode: "navigate",
      })
    ).toBe("network-only-navigate");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/tools/base-encoding/",
        requestMode: "navigate",
      })
    ).toBe("network-only-navigate");
  });

  it("falls back other navigations to network-only → /offline/", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/",
        requestMode: "navigate",
      })
    ).toBe("network-only-navigate");
  });

  it("ignores canvas virtual paths, SW entry, and Vite dev paths", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/canvas/p/index.html",
        requestMode: "navigate",
      })
    ).toBe("passthrough");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/canvas/p/index.html",
        requestMode: "navigate",
      })
    ).toBe("passthrough");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/sw.js",
        requestMode: "cors",
      })
    ).toBe("passthrough");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/@vite/client",
        requestMode: "cors",
      })
    ).toBe("passthrough");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/node_modules/.vite/deps/foo.js",
        requestMode: "cors",
      })
    ).toBe("passthrough");
  });

  it("PG.libs paths are passthrough (no SW cache; PG-LIBS-SPEC G6)", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/libs/phaser-4.2.1.min.js",
        requestMode: "cors",
      })
    ).toBe("passthrough");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/libs/pixi-8.19.0.min.mjs",
        requestMode: "cors",
      })
    ).toBe("passthrough");
    // sdk.js itself remains a shell offline asset
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/sdk.js",
        requestMode: "cors",
      })
    ).toBe("network-first-document");
  });

  it("network-first caches register-sw.js (needed offline; not the SW entry)", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/register-sw.js",
        requestMode: "cors",
      })
    ).toBe("network-first-asset");
  });

  it("extracts /_app from Kit module tags (and legacy /_astro)", () => {
    const html = `
      <script type="module" src="/_app/immutable/entry/start.DZrbwJDl.js"></script>
      <link rel="modulepreload" href="/_app/immutable/chunks/page.uaEQKTED.js">
      <script src="/register-sw.js?v=12"></script>
      <link rel="modulepreload" href="/_astro/legacy.uaEQKTED.js">
    `;
    const urls = extractShellAssetUrls(html, "http://localhost:5173");
    expect(urls).toContain(
      "http://localhost:5173/_app/immutable/entry/start.DZrbwJDl.js"
    );
    expect(urls).toContain(
      "http://localhost:5173/_app/immutable/chunks/page.uaEQKTED.js"
    );
    expect(urls).toContain("http://localhost:5173/_astro/legacy.uaEQKTED.js");
    expect(urls).toContain("http://localhost:5173/register-sw.js");
  });

  it("allows Playgrounds offline caching on localhost-style paths (not host-gated)", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/",
        requestMode: "navigate",
      })
    ).toBe("network-first-document");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/_app/immutable/x.js",
        requestMode: "cors",
      })
    ).toBe("network-first-asset");
  });

  it("never selects a cache-first strategy", () => {
    const samples = [
      "/playgrounds/",
      "/_app/x.js",
      "/_astro/x.js",
      "/toggle-theme.js",
      "/icons/icon.png",
      "/",
      "/tools/",
    ];
    for (const pathname of samples) {
      const strategy = selectOfflineFetchStrategy({
        pathname,
        requestMode: pathname.endsWith(".js") ? "cors" : "navigate",
      });
      expect(strategy).not.toMatch(/cache-first/);
      if (strategy !== "passthrough") {
        expect(strategyPrefersNetworkWhileOnline(strategy)).toBe(true);
      }
    }
  });
});
