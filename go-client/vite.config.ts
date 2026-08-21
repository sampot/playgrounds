import path from "node:path";
import { fileURLToPath } from "node:url";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type Plugin } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * `adapter-static` writes prerendered HTML under `build/`. While `vite dev` is
 * running, those files must not be watched or served — otherwise:
 * - every `go:build`／deploy floods HMR with `page reload build/s/*.html`
 * - opening `/build/…` hits a Vite static-middleware bug → 500 Internal Server Error
 */
function ignoreAdapterBuild(): Plugin {
  return {
    name: "go-ignore-adapter-build",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        if (
          url === "/build" ||
          url.startsWith("/build/") ||
          (url.startsWith("/@fs/") && url.includes("/build/"))
        ) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [ignoreAdapterBuild(), sveltekit()],
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
    watch: {
      ignored: ["**/build/**", "**/.wrangler/**"],
    },
  },
});
