import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";

// Standalone Playgrounds host (DEC-041): root `/`, canvas `/canvas/`.
export default defineConfig({
  site: "https://play.samkuo.me",
  trailingSlash: "always",
  devToolbar: { enabled: false },
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
    envPrefix: ["PUBLIC_"],
    define: {
      __PLAYGROUNDS_BUILT_AT__: JSON.stringify(new Date().toISOString()),
    },
  },
});
