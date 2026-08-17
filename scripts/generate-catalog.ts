/**
 * Load catalog/*.yaml → src/data/samCatalog.generated.ts + public/catalog/v1.json
 * Run: npm run catalog:gen
 * See docs/PG-CATALOG-QUERY-PLAN.md (DEC-046).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { resolveCatalogCover } from "./catalogCover.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogDir = join(root, "catalog");
const entriesDir = join(catalogDir, "entries");
const outPath = join(root, "src/data/samCatalog.generated.ts");
const jsonOutPath = join(root, "public/catalog/v1.json");
/** Product covers (go + play mirror). Presence drives optional `cover` field. */
const coversDirs = [
  join(root, "go-client/static/covers"),
  join(root, "public/covers"),
];

function coverFileExists(id: string): boolean {
  return coversDirs.some(dir => existsSync(join(dir, `${id}.png`)));
}

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
  protocols?: unknown;
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

type GenProtocol = {
  protocolId: string;
  apiVersion: string;
  roles?: string[];
};

/** listed = public browse; unlisted = registered (JSON／go resolve) but hidden from /sam/; draft = omit. */
type EntryStatus = "listed" | "unlisted";

type GenEntry = {
  id: string;
  title: string;
  kind: Kind;
  series: string;
  blurb: string;
  source: string;
  status: EntryStatus;
  license?: string;
  protocols?: GenProtocol[];
  /** Site-relative cover when /covers/<id>.png is committed. */
  cover?: string;
};

function parseProtocols(raw: unknown, where: string): GenProtocol[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    fail(`${where}: protocols must be an array`);
  }
  if (raw.length === 0) return undefined;
  const out: GenProtocol[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const pWhere = `${where}.protocols[${i}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(`${pWhere}: must be an object`);
    }
    const row = item as Record<string, unknown>;
    const protocolId = asString(row.protocolId, "protocolId", pWhere);
    const apiVersion = asString(row.apiVersion, "apiVersion", pWhere);
    const key = `${protocolId}@${apiVersion}`;
    if (seen.has(key)) {
      fail(`${pWhere}: duplicate ${key}`);
    }
    seen.add(key);
    const decl: GenProtocol = { protocolId, apiVersion };
    if (row.roles !== undefined && row.roles !== null) {
      if (!Array.isArray(row.roles) || row.roles.length === 0) {
        fail(`${pWhere}: roles must be a non-empty array when set`);
      }
      const roles: string[] = [];
      const roleSeen = new Set<string>();
      for (const r of row.roles) {
        if (typeof r !== "string" || !r.trim()) {
          fail(`${pWhere}: roles entries must be non-empty strings`);
        }
        const t = r.trim();
        if (roleSeen.has(t)) fail(`${pWhere}: duplicate role "${t}"`);
        roleSeen.add(t);
        roles.push(t);
      }
      decl.roles = roles;
    }
    out.push(decl);
  }
  return out;
}

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
  if (
    statusRaw !== "listed" &&
    statusRaw !== "unlisted" &&
    statusRaw !== "draft"
  ) {
    fail(
      `${where}: status must be listed|unlisted|draft (got "${statusRaw}")`
    );
  }
  if (statusRaw === "draft") continue;
  const status = statusRaw as EntryStatus;

  const kindStr = asString(doc.kind, "kind", where);
  if (!isKind(kindStr)) fail(`${where}: unknown kind "${kindStr}"`);

  const entry: GenEntry = {
    id,
    title: asString(doc.title, "title", where),
    kind: kindStr,
    series: asString(doc.series, "series", where),
    blurb: asString(doc.blurb, "blurb", where),
    source: asString(doc.source, "source", where),
    status,
  };
  if (doc.license !== undefined && doc.license !== null) {
    entry.license = asString(doc.license, "license", where);
  }
  const protocols = parseProtocols(doc.protocols, where);
  if (protocols) entry.protocols = protocols;
  const cover = resolveCatalogCover(id, { coverFileExists });
  if (cover) entry.cover = cover;
  entries.push(entry);
}

for (const pid of pickIds) {
  if (!idSeen.has(pid)) {
    // warn: pick may point at draft; only fail if file missing entirely
    const fileExists = files.some(f => f === `${pid}.yaml`);
    if (!fileExists) fail(`picks.yaml: unknown id "${pid}" (no entries/${pid}.yaml)`);
  }
}

const listedIds = new Set(
  entries.filter(e => e.status === "listed").map(e => e.id)
);
for (const pid of pickIds) {
  if (!listedIds.has(pid)) {
    fail(
      `picks.yaml: id "${pid}" must be status: listed (missing, draft, or unlisted)`
    );
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
      status: e.status,
    };
    if (e.license) obj.license = e.license;
    if (e.protocols) obj.protocols = e.protocols;
    if (e.cover) obj.cover = e.cover;
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
 * Source: catalog/entries/*.yaml, series.yaml, picks.yaml, page.yaml;
 * optional cover from go-client/static/covers|public/covers/<id>.png
 */
export type GeneratedSamKind = "tool" | "agent" | "game" | "toy" | "media";

export interface GeneratedSamProtocol {
  protocolId: string;
  apiVersion: string;
  roles?: string[];
}

export type GeneratedSamEntryStatus = "listed" | "unlisted";

export interface GeneratedSamEntry {
  id: string;
  title: string;
  kind: GeneratedSamKind;
  series: string;
  blurb: string;
  source: string;
  /** listed = /sam/ browse; unlisted = registered only (go／JSON resolve). */
  status: GeneratedSamEntryStatus;
  license?: string;
  protocols?: GeneratedSamProtocol[];
  /** Product card art when static /covers/<id>.png is present (§5.8). */
  cover?: string;
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

const catalogJson = {
  v: 1 as const,
  kinds: kindOrder.map(id => ({ id, label: kindLabels[id]! })),
  series: seriesByKind,
  picks: pickIds,
  page,
  entries: entries.map(e => {
    const row: Record<string, unknown> = {
      id: e.id,
      title: e.title,
      kind: e.kind,
      series: e.series,
      blurb: e.blurb,
      source: e.source,
      status: e.status,
    };
    if (e.license) row.license = e.license;
    if (e.protocols) row.protocols = e.protocols;
    if (e.cover) row.cover = e.cover;
    return row;
  }),
};

mkdirSync(dirname(jsonOutPath), { recursive: true });
writeFileSync(jsonOutPath, `${JSON.stringify(catalogJson, null, 2)}\n`);

const listedCount = entries.filter(e => e.status === "listed").length;
const unlistedCount = entries.length - listedCount;
const coverCount = entries.filter(e => e.cover).length;
console.log(
  `[catalog:gen] wrote ${entries.length} registered entries (${listedCount} listed` +
    (unlistedCount ? `, ${unlistedCount} unlisted` : "") +
    (coverCount ? `, ${coverCount} with cover` : "") +
    `) → ${outPath}`
);
console.log(`[catalog:gen] wrote ${jsonOutPath}`);
