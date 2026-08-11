import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    // DEC-005 runes: transform `*.svelte.ts` modules (e.g. goAuth / chromeSession)
    // in unit tests. Uses the root svelte config (runes: true).
    svelte(),
  ],
  resolve: {
    alias: {
      "@data": path.resolve(root, "src/data"),
      "@utils": path.resolve(root, "src/utils"),
      "@pg": path.resolve(root, "src/components/playgrounds"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "go-client/src/**/*.test.ts"],
    environment: "node",
  },
});