/**
 * Build go-client/static/sitemap.xml for search engines.
 * Indexable: `/`, `/help`, `/room`, listed `/s/<id>` only (not `/i/`, not unlisted).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const GO_SITEMAP_ORIGIN = "https://go.samkuo.me";

/**
 * @param {{ id?: string, status?: string }[]} entries
 * @returns {string[]}
 */
export function listedCatalogIds(entries) {
  const ids = [];
  const seen = new Set();
  for (const e of entries ?? []) {
    const id = typeof e?.id === "string" ? e.id.trim() : "";
    if (!id || seen.has(id)) continue;
    if ((e.status ?? "listed") !== "listed") continue;
    seen.add(id);
    ids.push(id);
  }
  ids.sort((a, b) => a.localeCompare(b));
  return ids;
}

/**
 * @param {string} origin
 * @param {string[]} catalogIds
 * @param {{ lastmod?: string }} [opts]
 * @returns {string}
 */
export function buildSitemapXml(
  origin = GO_SITEMAP_ORIGIN,
  catalogIds = [],
  opts = {}
) {
  const base = origin.replace(/\/$/, "");
  const lastmod =
    typeof opts.lastmod === "string" && /^\d{4}-\d{2}-\d{2}/.test(opts.lastmod)
      ? opts.lastmod.slice(0, 10)
      : "";
  const urls = [
    `${base}/`,
    `${base}/help`,
    `${base}/room`,
    ...catalogIds.map(id => `${base}/s/${encodeURIComponent(id)}`),
  ];
  const body = urls
    .map(loc => {
      const lines = [`    <loc>${escapeXml(loc)}</loc>`];
      if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
      return `  <url>\n${lines.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

/** @param {string} s */
function escapeXml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * @param {{ catalogJsonPath: string, outPath: string, origin?: string, lastmod?: string }} opts
 */
export function generateGoSitemap({
  catalogJsonPath,
  outPath,
  origin = GO_SITEMAP_ORIGIN,
  lastmod,
}) {
  const raw = JSON.parse(readFileSync(catalogJsonPath, "utf8"));
  const ids = listedCatalogIds(raw.entries ?? []);
  const xml = buildSitemapXml(origin, ids, {
    lastmod: lastmod ?? new Date().toISOString().slice(0, 10),
  });
  writeFileSync(outPath, xml, "utf8");
  return { count: 2 + ids.length, listed: ids.length, outPath };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const goRoot = path.dirname(here);
  const repoRoot = path.dirname(goRoot);
  const catalogJsonPath = path.join(repoRoot, "public", "catalog", "v1.json");
  const outPath = path.join(goRoot, "static", "sitemap.xml");
  const result = generateGoSitemap({ catalogJsonPath, outPath });
  console.log(
    `[go-sitemap] wrote ${result.count} urls (${result.listed} listed /s/) → ${result.outPath}`
  );
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCli) {
  main();
}
