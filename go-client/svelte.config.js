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
      fallback: "index.html",
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
