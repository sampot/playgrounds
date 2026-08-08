import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      // SPA shell for `/i/*` etc. Named 200.html so prerendered `/`（index.html）keeps OG.
      // Cloudflare `not_found_handling: single-page-application` still serves index.html
      // for unknown paths — listed `/s/<id>` are static `s/<id>.html` with per-entry meta.
      fallback: "200.html",
      precompress: false,
      strict: true,
    }),
    alias: {
      "@pg": "../src/components/playgrounds",
      "@data": "../src/data",
      "@utils": "../src/utils",
    },
    prerender: {
      handleHttpError: "warn",
    },
  },
};

export default config;
