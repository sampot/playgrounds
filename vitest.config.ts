import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
