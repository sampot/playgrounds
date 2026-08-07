import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      "/v1": "http://127.0.0.1:8787",
      "/auth": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
      "/favicon.svg": "http://127.0.0.1:8787",
    },
  },
});
