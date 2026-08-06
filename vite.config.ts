import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  envPrefix: ["PUBLIC_"],
  define: {
    __PLAYGROUNDS_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
});
