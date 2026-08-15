import path from "node:path";
import { fileURLToPath } from "node:url";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    // Prefer import.meta.env over a bare `__…__` global — Vite define truncates
    // trailing underscores in identifiers like `__GO_BUILD_ISO__`.
    "import.meta.env.GO_BUILD_ISO": JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      // Shared field-shell modules (DEC-050) — pure TS, no IDE shell.
      "@pg": path.resolve(root, "../src/components/playgrounds"),
      "@components": path.resolve(root, "../src/components"),
      // Embedded catalog + share helpers from host repo.
      "@data": path.resolve(root, "../src/data"),
      "@utils": path.resolve(root, "../src/utils"),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [root, path.resolve(root, "..")],
    },
  },
});
