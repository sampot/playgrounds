/**
 * Parse SAM declarations from index.html <head> (DEC-024).
 * Authority is head only — keys use the `sam:` prefix. No side-meta merge.
 */

import type { SamHeadMeta, SamHeadSessionProtocol } from "./types.ts";

/** Default apiVersion when `sam:protocol` token omits `@version` (DEC-046). */
export const SAM_PROTOCOL_DEFAULT_API_VERSION = "1";

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
}

function extractHead(html: string): string {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu);
  return m?.[1] ?? html;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function metaContent(head: string, name: string): string | undefined {
  const n = escapeRegExp(name);
  const re = new RegExp(
    `<meta\\b[^>]*\\bname\\s*=\\s*["']${n}["'][^>]*>`,
    "iu"
  );
  const tag = head.match(re)?.[0];
  if (!tag) {
    const re2 = new RegExp(
      `<meta\\b[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\bname\\s*=\\s*["']${n}["'][^>]*>`,
      "iu"
    );
    const m2 = head.match(re2);
    if (m2?.[1] !== undefined) return decodeEntities(m2[1].trim());
    return undefined;
  }
  const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/iu);
  return content?.[1] !== undefined
    ? decodeEntities(content[1].trim())
    : undefined;
}

function splitList(raw: string | undefined): string[] | undefined {
  if (raw === undefined || !raw.trim()) return undefined;
  const parts = raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

/**
 * Parse one `sam:protocol` token: `id[@apiVersion][:role[+role…]]`.
 * Bare id ⇒ apiVersion {@link SAM_PROTOCOL_DEFAULT_API_VERSION}.
 */
export function parseSamProtocolToken(
  raw: string
): SamHeadSessionProtocol | undefined {
  const token = raw.trim();
  if (!token) return undefined;
  const m = token.match(/^([^@:\s]+)(?:@([^:\s]+))?(?::(.+))?$/u);
  if (!m?.[1]) return undefined;
  const protocolId = m[1];
  const apiVersion = (m[2]?.trim() || SAM_PROTOCOL_DEFAULT_API_VERSION).trim();
  if (!apiVersion) return undefined;
  const rolesRaw = m[3]?.trim();
  const roles = rolesRaw
    ? rolesRaw
        .split(/[+|]/u)
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;
  const decl: SamHeadSessionProtocol = { protocolId, apiVersion };
  if (roles?.length) decl.roles = roles;
  return decl;
}

/**
 * Parse `sam:protocol` content into structured decls (comma-separated tokens).
 * Duplicate `protocolId@apiVersion` keys: last wins (roles merged? no — last replaces).
 */
export function parseSamProtocolContent(
  raw: string | undefined
): SamHeadSessionProtocol[] | undefined {
  if (raw === undefined || !raw.trim()) return undefined;
  const byKey = new Map<string, SamHeadSessionProtocol>();
  for (const part of raw.split(",")) {
    const decl = parseSamProtocolToken(part);
    if (!decl) continue;
    byKey.set(`${decl.protocolId}@${decl.apiVersion}`, decl);
  }
  if (!byKey.size) return undefined;
  return [...byKey.values()];
}

/** Parse SAM head metadata from an HTML document string (`sam:*` keys). */
export function parseSamHead(html: string): SamHeadMeta {
  const head = extractHead(html);
  const titleMatch = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu);
  const title = titleMatch
    ? decodeEntities(
        titleMatch[1]!
          .replace(/<[^>]+>/gu, "")
          .replace(/\s+/gu, " ")
          .trim()
      ) || undefined
    : undefined;

  const protocolRaw = metaContent(head, "sam:protocol");
  const sessionProtocols = parseSamProtocolContent(protocolRaw);

  return {
    title,
    toolKinds: splitList(metaContent(head, "sam:tool-kinds")),
    toolGlobs: splitList(metaContent(head, "sam:tool-globs")),
    needsController: parseBool(metaContent(head, "sam:needs-controller")),
    protocol: sessionProtocols?.[0]?.protocolId || protocolRaw?.trim() || undefined,
    ...(sessionProtocols?.length ? { sessionProtocols } : {}),
    capabilities: splitList(metaContent(head, "sam:capabilities")),
  };
}

/** Derive display fields from head only (`name` ← `<title>`). */
export function resolveSamMeta(
  head: SamHeadMeta
): SamHeadMeta & { name?: string } {
  return {
    ...head,
    name: head.title?.trim() || undefined,
  };
}
