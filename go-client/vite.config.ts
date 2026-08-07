import path from "node:path";
import { fileURLToPath } from "node:url";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      // Shared field-shell modules (DEC-050) — pure TS, no IDE shell.
      "@pg": path.resolve(root, "../src/components/playgrounds"),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [root, path.resolve(root, "..")],
    },
    proxy: {
      "/v1": "http://127.0.0.1:8787",
    },
  },
});
