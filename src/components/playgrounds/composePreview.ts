/**
 * LEGACY: srcdoc + import-map rewrite pipeline for the canvas.
 * Canvas now uses the Service Worker virtual origin (see canvasSw.ts / DEC-016).
 * Kept for extractHtmlTitle and historical tests; do not use for the live preview.
 */
import { normalizeProjectPath, parentDir } from "./pathUtils";
import { isTextContent, type FileContent, type FileMap } from "./projectTypes";

export interface PreviewBuild {
  /** Document HTML for iframe srcdoc. */
  srcdoc: string;
  /** Blob URLs created in the parent (assets/CSS); revoke when rebuilding. */
  blobUrls: string[];
}

function requireText(path: string, content: FileContent): string {
  if (!isTextContent(content)) {
    throw new Error(`預期文字檔，卻是二進位：${path}`);
  }
  return content;
}

/**
 * Bare import-map specifier for a project file.
 * Must NOT be path-absolute (`/…`) or a custom URL scheme — those fail to
 * resolve from `blob:` modules ("base scheme isn't hierarchical").
 */
export function playgroundModuleSpecifier(path: string): string {
  return `playground/${normalizeProjectPath(path)}`;
}

function resolveRelative(fromFile: string, href: string): string | null {
  const raw = href.trim();
  if (
    !raw ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("//") ||
    raw.startsWith("#") ||
    raw.startsWith("mailto:")
  ) {
    return null;
  }
  try {
    const baseDir = parentDir(fromFile);
    const joined = baseDir ? `${baseDir}/${raw}` : raw;
    return normalizeProjectPath(joined);
  } catch {
    return null;
  }
}

function mimeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs"))
    return "text/javascript";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "text/plain";
  return "application/octet-stream";
}

/** First `<title>` text from HTML, or null if missing/empty. */
export function extractHtmlTitle(html: string): string | null {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  if (!m) return null;
  const text = m[1]!
    .replace(/<[^>]+>/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return text || null;
}

function isJsPath(path: string): boolean {
  return /\.(?:m?js|cjs)$/iu.test(path);
}

function isCssPath(path: string): boolean {
  return /\.css$/iu.test(path);
}

/** Rewrite relative ESM imports to mapped bare specifiers (or blob URLs). */
export function rewriteJsImports(
  content: string,
  filePath: string,
  pathToUrl: Map<string, string>
): string {
  const replacer = (spec: string): string | null => {
    const resolved = resolveRelative(filePath, spec);
    if (!resolved) return null;
    return pathToUrl.get(resolved) ?? null;
  };

  let out = content.replace(
    /\b(import|export)(\s*[\s\S]*?\s+from\s+|\s+)(["'])(\.[^"']+)\3/gu,
    (full, kw: string, mid: string, quote: string, spec: string) => {
      const url = replacer(spec);
      return url ? `${kw}${mid}${quote}${url}${quote}` : full;
    }
  );
  out = out.replace(
    /\bimport\s*\(\s*(["'])(\.[^"']+)\1\s*\)/gu,
    (full, quote: string, spec: string) => {
      const url = replacer(spec);
      return url ? `import(${quote}${url}${quote})` : full;
    }
  );
  return out;
}

export function rewriteCssUrls(
  content: string,
  filePath: string,
  pathToBlob: Map<string, string>
): string {
  const replacer = (spec: string): string | null => {
    const resolved = resolveRelative(filePath, spec);
    if (!resolved) return null;
    return pathToBlob.get(resolved) ?? null;
  };

  let out = content.replace(
    /url\(\s*(['"]?)(\.[^)"']+)\1\s*\)/gu,
    (full, quote: string, spec: string) => {
      const url = replacer(spec);
      if (!url) return full;
      const q = quote || '"';
      return `url(${q}${url}${q})`;
    }
  );
  out = out.replace(
    /@import\s+(['"])(\.[^'"]+)\1/gu,
    (full, quote: string, spec: string) => {
      const url = replacer(spec);
      return url ? `@import ${quote}${url}${quote}` : full;
    }
  );
  return out;
}

function escapeJsonForScript(json: string): string {
  // Prevent </script> in string literals from breaking out of the tag.
  return json.replace(/</g, "\\u003c");
}

/**
 * Build a canvas document for a one-page web app project (sandbox iframe runtime).
 *
 * JS relative imports → bare `playground/…` specifiers. Blobs + import map are
 * created **inside** the iframe so sandbox stays `allow-scripts` only (no
 * allow-same-origin escape warning / capability).
 */
export function composePreview(files: FileMap, entry: string): PreviewBuild {
  const entryPath = normalizeProjectPath(entry);
  const htmlRaw = files[entryPath];
  if (htmlRaw === undefined) {
    throw new Error(`找不到入口檔：${entryPath}`);
  }
  const html = requireText(entryPath, htmlRaw);

  const blobUrls: string[] = [];
  const pathToBlob = new Map<string, string>();
  const pathToSpec = new Map<string, string>();

  const normalized: FileMap = {};
  for (const [path, content] of Object.entries(files)) {
    const norm = normalizeProjectPath(path);
    normalized[norm] = content;
    pathToSpec.set(norm, playgroundModuleSpecifier(norm));
  }

  const jsModules: Record<string, string> = {};
  for (const [path, content] of Object.entries(normalized)) {
    if (!isJsPath(path)) continue;
    jsModules[path] = rewriteJsImports(
      requireText(path, content),
      path,
      pathToSpec
    );
  }

  // Non-JS assets (except CSS) as parent blobs for CSS url() rewrite.
  for (const [path, content] of Object.entries(normalized)) {
    if (isJsPath(path) || isCssPath(path)) continue;
    if (path === entryPath) continue;
    const body: BlobPart =
      content instanceof Uint8Array
        ? new Uint8Array(content)
        : new TextEncoder().encode(String(content));
    const url = URL.createObjectURL(
      new Blob([body], { type: mimeForPath(path) })
    );
    blobUrls.push(url);
    pathToBlob.set(path, url);
  }

  const cssFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(normalized)) {
    if (!isCssPath(path)) continue;
    cssFiles[path] = rewriteCssUrls(
      requireText(path, content),
      path,
      pathToBlob
    );
  }

  const entrySpec = (() => {
    // Prefer the first module script referenced from the entry HTML.
    const srcMatch =
      html.match(
        /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']([^"']+)["']/i
      ) ||
      html.match(
        /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*\btype\s*=\s*["']module["']/i
      );
    if (srcMatch) {
      const resolved = resolveRelative(entryPath, srcMatch[1]!);
      if (resolved && jsModules[resolved] !== undefined) {
        return playgroundModuleSpecifier(resolved);
      }
    }
    if (jsModules["app.js"] !== undefined) {
      return playgroundModuleSpecifier("app.js");
    }
    const first = Object.keys(jsModules)[0];
    return first ? playgroundModuleSpecifier(first) : null;
  })();

  let doc = html;

  // Inline project stylesheets (avoid parent blob + sandbox origin issues).
  doc = doc.replace(/<link\b[^>]*>/giu, full => {
    if (!/\brel\s*=\s*(["'])stylesheet\1/iu.test(full)) return full;
    const hrefMatch = full.match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
    if (!hrefMatch) return full;
    const resolved = resolveRelative(entryPath, hrefMatch[2]!);
    if (!resolved || cssFiles[resolved] === undefined) return full;
    return `<style data-playground-css="${resolved}">\n${cssFiles[resolved]}\n</style>`;
  });

  // Drop external module scripts; bootstrap loads the entry via import map.
  doc = doc.replace(
    /<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/giu,
    full => {
      if (!/\btype\s*=\s*["']module["']/i.test(full)) return full;
      const srcMatch = full.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      if (!srcMatch) return full;
      const resolved = resolveRelative(entryPath, srcMatch[1]!);
      if (!resolved || jsModules[resolved] === undefined) return full;
      return "<!-- playground: module entry loaded by bootstrap -->";
    }
  );

  const payload = escapeJsonForScript(
    JSON.stringify({
      modules: jsModules,
      entry: entrySpec,
    })
  );

  // Legacy srcdoc path: keep console mirror gated (default off), same as SW bridge.
  const bridge = `<script>
(function () {
  var mirrorToBrowser = false;
  try {
    var prefsRaw = localStorage.getItem("playgrounds-prefs-v1");
    if (prefsRaw) {
      var prefsObj = JSON.parse(prefsRaw);
      mirrorToBrowser = !!prefsObj.mirrorConsoleToBrowser;
    }
  } catch (_) { /* ignore */ }
  function serializeArg(a) {
    if (a === null) return "null";
    if (a === undefined) return "undefined";
    var t = typeof a;
    if (t === "string") return a;
    if (t === "number" || t === "boolean" || t === "bigint") return String(a);
    if (a instanceof Error) return a.stack || String(a);
    try { return JSON.stringify(a); } catch (_) { return String(a); }
  }
  function postConsole(level, args) {
    parent.postMessage({
      type: "playgrounds-preview-console",
      level: level,
      args: Array.prototype.map.call(args, serializeArg)
    }, "*");
  }
  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "playgrounds-console-mirror") {
      mirrorToBrowser = !!data.enabled;
    }
  });
  window.addEventListener("error", function (e) {
    parent.postMessage({ type: "playgrounds-preview-error", message: String(e.message || e.error || "error") }, "*");
    try { e.preventDefault(); } catch (_) { /* ignore */ }
  });
  window.addEventListener("unhandledrejection", function (e) {
    parent.postMessage({ type: "playgrounds-preview-error", message: String(e.reason) }, "*");
    try { e.preventDefault(); } catch (_) { /* ignore */ }
  });
  var _log = console.log.bind(console);
  var _err = console.error.bind(console);
  var _warn = console.warn.bind(console);
  var _info = console.info.bind(console);
  var _debug = console.debug.bind(console);
  // console.log → info (panel has no separate LOG filter)
  console.log = function () { postConsole("info", arguments); if (mirrorToBrowser) _log.apply(console, arguments); };
  console.info = function () { postConsole("info", arguments); if (mirrorToBrowser) _info.apply(console, arguments); };
  console.debug = function () { postConsole("debug", arguments); if (mirrorToBrowser) _debug.apply(console, arguments); };
  console.error = function () { postConsole("error", arguments); if (mirrorToBrowser) _err.apply(console, arguments); };
  console.warn = function () { postConsole("warn", arguments); if (mirrorToBrowser) _warn.apply(console, arguments); };
})();
</script>`;

  // Classic script: create blobs + import map inside the iframe (opaque origin).
  const bootstrap = `<script>
(function () {
  var payload = ${payload};
  var modules = payload.modules || {};
  var imports = {};
  var paths = Object.keys(modules);
  for (var i = 0; i < paths.length; i++) {
    var path = paths[i];
    var spec = "playground/" + path;
    imports[spec] = URL.createObjectURL(
      new Blob([modules[path]], { type: "text/javascript" })
    );
  }
  var map = document.createElement("script");
  map.type = "importmap";
  map.textContent = JSON.stringify({ imports: imports });
  document.head.appendChild(map);
  if (payload.entry && imports[payload.entry]) {
    var entry = document.createElement("script");
    entry.type = "module";
    entry.textContent = "import '" + payload.entry + "';";
    document.head.appendChild(entry);
  }
})();
</script>`;

  const headInject = `${bridge}${bootstrap}`;
  if (/<head[\s>]/iu.test(doc)) {
    doc = doc.replace(/<head([^>]*)>/iu, `<head$1>${headInject}`);
  } else if (/<html[\s>]/iu.test(doc)) {
    doc = doc.replace(/<html([^>]*)>/iu, `<html$1><head>${headInject}</head>`);
  } else {
    doc = `${headInject}${doc}`;
  }

  return { srcdoc: doc, blobUrls };
}

export function revokePreviewBlobs(blobUrls: string[]): void {
  for (const url of blobUrls) {
    URL.revokeObjectURL(url);
  }
}
