/**
 * Load catalog/*.yaml → src/data/samCatalog.generated.ts
 * Run: npm run catalog:gen
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogDir = join(root, "catalog");
const entriesDir = join(catalogDir, "entries");
const outPath = join(root, "src/data/samCatalog.generated.ts");

const KINDS = ["tool", "agent", "game", "toy", "media"] as const;
type Kind = (typeof KINDS)[number];

type EntryYaml = {
  title?: unknown;
  kind?: unknown;
  series?: unknown;
  blurb?: unknown;
  source?: unknown;
  license?: unknown;
  status?: unknown;
};

type SeriesYaml = {
  kinds?: { id?: unknown; label?: unknown }[];
  series?: Record<string, unknown>;
};

type PicksYaml = { ids?: unknown };
type PageYaml = {
  title?: unknown;
  description?: unknown;
  lede?: unknown;
  footnote?: unknown;
};

function fail(msg: string): never {
  console.error(`[catalog:gen] ${msg}`);
  process.exit(1);
}

function asString(v: unknown, field: string, where: string): string {
  if (typeof v !== "string" || !v.trim()) {
    fail(`${where}: missing or empty string field "${field}"`);
  }
  return v.trim();
}

function loadYaml<T>(path: string): T {
  try {
    return parseYaml(readFileSync(path, "utf8")) as T;
  } catch (e) {
    fail(`invalid YAML ${path}: ${e instanceof Error ? e.message : e}`);
  }
}

function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

function escapeTsString(s: string): string {
  return JSON.stringify(s);
}

const seriesDoc = loadYaml<SeriesYaml>(join(catalogDir, "series.yaml"));
const picksDoc = loadYaml<PicksYaml>(join(catalogDir, "picks.yaml"));
const pageDoc = loadYaml<PageYaml>(join(catalogDir, "page.yaml"));

if (!Array.isArray(seriesDoc.kinds) || !seriesDoc.kinds.length) {
  fail("series.yaml: kinds must be a non-empty array");
}

const kindOrder: Kind[] = [];
const kindLabels: Record<string, string> = {};
for (const row of seriesDoc.kinds) {
  const id = asString(row?.id, "id", "series.yaml kinds");
  const label = asString(row?.label, "label", `series.yaml kinds.${id}`);
  if (!isKind(id)) fail(`series.yaml: unknown kind "${id}"`);
  if (kindOrder.includes(id)) fail(`series.yaml: duplicate kind "${id}"`);
  kindOrder.push(id);
  kindLabels[id] = label;
}
for (const k of KINDS) {
  if (!kindOrder.includes(k)) fail(`series.yaml: missing kind "${k}"`);
}

const seriesByKind: Record<Kind, string[]> = {
  tool: [],
  agent: [],
  game: [],
  toy: [],
  media: [],
};
const seriesMap = seriesDoc.series ?? {};
for (const kind of KINDS) {
  const list = seriesMap[kind];
  if (!Array.isArray(list)) fail(`series.yaml: series.${kind} must be an array`);
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string" || !item.trim()) {
      fail(`series.yaml: series.${kind} has empty entry`);
    }
    const s = item.trim();
    if (seen.has(s)) fail(`series.yaml: duplicate series "${s}" under ${kind}`);
    seen.add(s);
    seriesByKind[kind].push(s);
  }
}

if (!Array.isArray(picksDoc.ids)) fail("picks.yaml: ids must be an array");
const pickIds: string[] = [];
const pickSeen = new Set<string>();
for (const id of picksDoc.ids) {
  if (typeof id !== "string" || !id.trim()) fail("picks.yaml: empty id");
  const t = id.trim();
  if (pickSeen.has(t)) fail(`picks.yaml: duplicate id "${t}"`);
  pickSeen.add(t);
  pickIds.push(t);
}

const page = {
  title: asString(pageDoc.title, "title", "page.yaml"),
  description: asString(pageDoc.description, "description", "page.yaml"),
  lede: asString(pageDoc.lede, "lede", "page.yaml"),
  footnote: asString(pageDoc.footnote, "footnote", "page.yaml"),
};

const files = readdirSync(entriesDir)
  .filter(f => f.endsWith(".yaml") && !f.startsWith("_"))
  .sort();

type GenEntry = {
  id: string;
  title: string;
  kind: Kind;
  series: string;
  blurb: string;
  source: string;
  license?: string;
};

const entries: GenEntry[] = [];
const idSeen = new Set<string>();

for (const file of files) {
  const id = file.replace(/\.yaml$/, "");
  if (idSeen.has(id)) fail(`duplicate entry id "${id}"`);
  idSeen.add(id);
  const where = `entries/${file}`;
  const doc = loadYaml<EntryYaml>(join(entriesDir, file));
  const statusRaw =
    doc.status === undefined || doc.status === null
      ? "listed"
      : asString(doc.status, "status", where);
  if (statusRaw !== "listed" && statusRaw !== "draft") {
    fail(`${where}: status must be listed|draft (got "${statusRaw}")`);
  }
  if (statusRaw === "draft") continue;

  const kindStr = asString(doc.kind, "kind", where);
  if (!isKind(kindStr)) fail(`${where}: unknown kind "${kindStr}"`);

  const entry: GenEntry = {
    id,
    title: asString(doc.title, "title", where),
    kind: kindStr,
    series: asString(doc.series, "series", where),
    blurb: asString(doc.blurb, "blurb", where),
    source: asString(doc.source, "source", where),
  };
  if (doc.license !== undefined && doc.license !== null) {
    entry.license = asString(doc.license, "license", where);
  }
  entries.push(entry);
}

for (const pid of pickIds) {
  if (!idSeen.has(pid)) {
    // warn: pick may point at draft; only fail if file missing entirely
    const fileExists = files.some(f => f === `${pid}.yaml`);
    if (!fileExists) fail(`picks.yaml: unknown id "${pid}" (no entries/${pid}.yaml)`);
  }
}

const listedIds = new Set(entries.map(e => e.id));
for (const pid of pickIds) {
  if (!listedIds.has(pid)) {
    fail(`picks.yaml: id "${pid}" is missing or draft (not listed)`);
  }
}

function emitObject(obj: Record<string, unknown>, indent: number): string {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);
  const keys = Object.keys(obj);
  const lines = keys.map(k => {
    const v = obj[k];
    if (v === undefined) return null;
    if (typeof v === "string") return `${padIn}${k}: ${escapeTsString(v)},`;
    return `${padIn}${k}: ${JSON.stringify(v)},`;
  });
  return `{\n${lines.filter(Boolean).join("\n")}\n${pad}}`;
}

const entryLines = entries
  .map(e => {
    const obj: Record<string, unknown> = {
      id: e.id,
      title: e.title,
      kind: e.kind,
      series: e.series,
      blurb: e.blurb,
      source: e.source,
    };
    if (e.license) obj.license = e.license;
    return `  ${emitObject(obj, 1)},`;
  })
  .join("\n");

const seriesOrderBlock = KINDS.map(
  k =>
    `  ${k}: [${seriesByKind[k].map(s => escapeTsString(s)).join(", ")}],`
).join("\n");

const kindLabelBlock = KINDS.map(
  k => `  ${k}: ${escapeTsString(kindLabels[k]!)},`
).join("\n");

const out = `/* eslint-disable */
/**
 * AUTO-GENERATED by scripts/generate-catalog.ts — do not edit.
 * Source: catalog/entries/*.yaml, series.yaml, picks.yaml, page.yaml
 */
export type GeneratedSamKind = "tool" | "agent" | "game" | "toy" | "media";

export interface GeneratedSamEntry {
  id: string;
  title: string;
  kind: GeneratedSamKind;
  series: string;
  blurb: string;
  source: string;
  license?: string;
}

export const GENERATED_SAM_KIND_ORDER: GeneratedSamKind[] = [
${kindOrder.map(k => `  ${escapeTsString(k)},`).join("\n")}
];

export const GENERATED_SAM_KIND_LABEL: Record<GeneratedSamKind, string> = {
${kindLabelBlock}
};

export const GENERATED_SAM_SERIES_ORDER: Record<GeneratedSamKind, string[]> = {
${seriesOrderBlock}
};

export const GENERATED_SAM_PLAYGROUNDS_PICK_IDS: readonly string[] = [
${pickIds.map(id => `  ${escapeTsString(id)},`).join("\n")}
];

export const GENERATED_SAM_PAGE = {
  title: ${escapeTsString(page.title)},
  description: ${escapeTsString(page.description)},
  lede: ${escapeTsString(page.lede)},
  footnote: ${escapeTsString(page.footnote)},
} as const;

export const GENERATED_SAM_CATALOG: GeneratedSamEntry[] = [
${entryLines}
];
`;

writeFileSync(outPath, out);
console.log(
  `[catalog:gen] wrote ${entries.length} listed entries → ${outPath}`
);
