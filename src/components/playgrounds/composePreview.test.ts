import { describe, expect, it } from "vitest";
import {
  composePreview,
  extractHtmlTitle,
  playgroundModuleSpecifier,
  revokePreviewBlobs,
  rewriteJsImports,
} from "./composePreview";
import { createStarterFiles } from "./projectTypes";

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
