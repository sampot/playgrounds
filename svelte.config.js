import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // DEC-005: Svelte 5 runes only
    runes: true,
  },
  kit: {
    files: {
      assets: "public",
    },
    adapter: adapter({
      pages: "dist",
      assets: "dist",
      fallback: "index.html",
      precompress: false,
      strict: true,
    }),
    alias: {
      "@components": "src/components",
      "@styles": "src/styles",
      "@utils": "src/utils",
    },
    prerender: {
      handleHttpError: "warn",
    },
  },
};

export default config;
