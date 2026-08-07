import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  envPrefix: ["PUBLIC_"],
  // Workers use dynamic import / shared chunks; IIFE cannot code-split.
  worker: { format: "es" },
  define: {
    __PLAYGROUNDS_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
});
