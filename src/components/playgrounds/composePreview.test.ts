import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  composePreview,
  extractHtmlTitle,
  playgroundModuleSpecifier,
  revokePreviewBlobs,
  rewriteJsImports,
} from "./composePreview";
import { createStarterFiles } from "./projectTypes";

function loadSamDir(root: string): Record<string, string | Uint8Array> {
  const out: Record<string, string | Uint8Array> = {};
  function walk(dir: string, base = "") {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = base ? `${base}/${name}` : name;
      if (statSync(abs).isDirectory()) {
        walk(abs, rel);
        continue;
      }
      if (!/\.(?:html?|css|js|json|png)$/iu.test(name)) continue;
      out[rel] = name.endsWith(".png")
        ? new Uint8Array(readFileSync(abs))
        : readFileSync(abs, "utf8");
    }
  }
  walk(root);
  return out;
}

describe("extractHtmlTitle", () => {
  it("reads the first title tag", () => {
    expect(
      extractHtmlTitle("<!doctype html><html><head><title> Hello </title>")
    ).toBe("Hello");
  });

  it("handles attributes and nested whitespace", () => {
    expect(extractHtmlTitle('<title lang="zh">我的\n  專案</title>')).toBe(
      "我的 專案"
    );
  });

  it("returns null when missing or empty", () => {
    expect(extractHtmlTitle("<html></html>")).toBeNull();
    expect(extractHtmlTitle("<title>   </title>")).toBeNull();
  });
});

describe("rewriteJsImports", () => {
  it("rewrites relative imports to bare playground specifiers", () => {
    const map = new Map([
      ["router.js", playgroundModuleSpecifier("router.js")],
    ]);
    const out = rewriteJsImports(
      `import { mount } from "./router.js";\n`,
      "app.js",
      map
    );
    expect(out).toContain(`from "${playgroundModuleSpecifier("router.js")}"`);
  });

  it("rewrites nested relative imports", () => {
    const map = new Map([
      ["router.js", playgroundModuleSpecifier("router.js")],
    ]);
    const out = rewriteJsImports(
      `import { shell } from "../router.js";\n`,
      "views/home.js",
      map
    );
    expect(out).toContain(`from "${playgroundModuleSpecifier("router.js")}"`);
  });
});

describe("composePreview", () => {
  it("inlines stylesheets and bootstraps modules inside the iframe", () => {
    const files = {
      "index.html": `<!doctype html><html><head>
<link rel="stylesheet" href="./styles.css" />
</head><body>
<script type="module" src="./main.js"></script>
</body></html>`,
      "styles.css": "body{color:red}",
      "main.js": 'import "./util.js";\nconsole.log(1)',
      "util.js": "export const x = 1;",
    };
    const { srcdoc, blobUrls } = composePreview(files, "index.html");
    expect(srcdoc).toContain("data-playground-css");
    expect(srcdoc).toContain("body{color:red}");
    expect(srcdoc).toContain("playground/main.js");
    expect(srcdoc).toContain("playground/util.js");
    expect(srcdoc).toContain('type = "importmap"');
    expect(srcdoc).toContain("playgrounds-preview-error");
    expect(srcdoc).not.toContain("/@ide/");
    revokePreviewBlobs(blobUrls);
  });

  it("inlines cache-busted stylesheet hrefs (?v=…)", () => {
    const files = {
      "index.html": `<!doctype html><html><head>
<link rel="stylesheet" href="./styles.css?v=14" />
<link rel="stylesheet" href="./tiles.css" />
</head><body>
<script type="module" src="./app.js?v=7"></script>
</body></html>`,
      "styles.css": "body{color:red}",
      "tiles.css": ".tile{color:blue}",
      "app.js": "export default {}",
    };
    const { srcdoc, blobUrls } = composePreview(files, "index.html");
    expect(srcdoc).toContain('data-playground-css="styles.css"');
    expect(srcdoc).toContain("body{color:red}");
    expect(srcdoc).toContain('data-playground-css="tiles.css"');
    expect(srcdoc).toContain(".tile{color:blue}");
    expect(srcdoc).not.toMatch(/href\s*=\s*["']\.\/styles\.css\?v=/iu);
    revokePreviewBlobs(blobUrls);
  });

  it("inlines pg-mahjong styles for memory-canvas booth play", () => {
    const root = join(process.cwd(), "..", "pg-mahjong");
    if (!existsSync(join(root, "index.html"))) return;
    const files = loadSamDir(root);
    const { srcdoc, blobUrls } = composePreview(files, "index.html");
    expect(srcdoc).toContain('data-playground-css="styles.css"');
    expect(srcdoc).toContain('data-playground-css="tiles.css"');
    expect(srcdoc).toContain(".table-felt");
    expect(srcdoc).not.toMatch(/<link[^>]+href=["']\.\/styles\.css\?v=/iu);
    revokePreviewBlobs(blobUrls);
  });

  it("throws when entry missing", () => {
    expect(() => composePreview({ "a.js": "" }, "index.html")).toThrow(
      /找不到入口/
    );
  });

  it("bootstraps the three-file starter entry", () => {
    const starter = createStarterFiles();
    expect(Object.keys(starter).sort()).toEqual([
      "README.md",
      "app.js",
      "index.html",
      "styles.css",
    ]);
    const { srcdoc, blobUrls } = composePreview(starter, "index.html");
    expect(srcdoc).toContain(
      `"entry":"${playgroundModuleSpecifier("app.js")}"`
    );
    expect(srcdoc).toContain("playground/app.js");
    expect(srcdoc).toContain("data-playground-css");
    expect(srcdoc).not.toContain("router.js");
    revokePreviewBlobs(blobUrls);
  });
});
