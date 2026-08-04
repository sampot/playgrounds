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

  it("does not cache-first /_astro — network-first so online deploys win", () => {
    const strategy = selectOfflineFetchStrategy({
      pathname: "/_astro/PlaygroundsApp.abc123.js",
      requestMode: "cors",
    });
    expect(strategy).toBe("network-first-asset");
    expect(strategyPrefersNetworkWhileOnline(strategy)).toBe(true);
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

  it("network-first caches register-sw.js (needed offline; not the SW entry)", () => {
    expect(
      selectOfflineFetchStrategy({
        pathname: "/register-sw.js",
        requestMode: "cors",
      })
    ).toBe("network-first-asset");
  });

  it("extracts /_astro from Astro island attrs and module tags", () => {
    const html = `
      <astro-island
        component-url="/_astro/PlaygroundsApp.DZrbwJDl.js"
        renderer-url="/_astro/client.svelte.Bod-1i0s.js"
      ></astro-island>
      <script src="/register-sw.js?v=12"></script>
      <link rel="modulepreload" href="/_astro/page.uaEQKTED.js">
    `;
    const urls = extractShellAssetUrls(html, "http://localhost:4321");
    expect(urls).toContain(
      "http://localhost:4321/_astro/client.svelte.Bod-1i0s.js"
    );
    expect(urls).toContain(
      "http://localhost:4321/_astro/PlaygroundsApp.DZrbwJDl.js"
    );
    expect(urls).toContain("http://localhost:4321/_astro/page.uaEQKTED.js");
    expect(urls).toContain("http://localhost:4321/register-sw.js");
  });

  it("allows Playgrounds offline caching on localhost-style paths (not host-gated)", () => {
    // Host is not part of strategy selection; preview on localhost can cache shell.
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/",
        requestMode: "navigate",
      })
    ).toBe("network-first-document");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/_astro/PlaygroundsApp.x.js",
        requestMode: "cors",
      })
    ).toBe("network-first-asset");
  });

  it("never selects a cache-first strategy", () => {
    const samples = [
      "/playgrounds/",
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
