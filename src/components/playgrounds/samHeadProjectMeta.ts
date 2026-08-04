/**
 * Mirror SAM head declarations (`sam:tool-*`) into shell ProjectMeta.
 * Authority is index.html <head> only (DEC-024) — not `.playgrounds-meta.json`.
 */

import { parseSamHead } from "../../sam-runtime/index.ts";
import type { FileMap, ProjectMeta } from "./projectTypes";
import { DEFAULT_ENTRY } from "./projectTypes";

export type ProjectToolFields = Pick<ProjectMeta, "toolKinds" | "toolGlobs">;

/** Read tool discovery fields from an HTML document string. */
export function projectToolFieldsFromHtml(html: string): ProjectToolFields {
  const head = parseSamHead(html);
  const out: ProjectToolFields = {};
  if (head.toolKinds?.length) out.toolKinds = [...head.toolKinds];
  if (head.toolGlobs?.length) out.toolGlobs = [...head.toolGlobs];
  return out;
}

/** Read tool discovery from FileMap `index.html` when present. */
export function projectToolFieldsFromFiles(
  files: FileMap
): ProjectToolFields | null {
  const html = files[DEFAULT_ENTRY];
  if (typeof html !== "string") return null;
  return projectToolFieldsFromHtml(html);
}

/**
 * Apply head tool fields onto shell meta.
 * When `index.html` exists, missing `sam:tool-*` clears the mirror
 * (head is sole authority for those keys).
 */
export function applySamHeadToolFields(
  meta: ProjectMeta,
  html: string | null | undefined
): ProjectMeta {
  if (typeof html !== "string") return meta;
  const fields = projectToolFieldsFromHtml(html);
  return {
    ...meta,
    toolKinds: fields.toolKinds,
    toolGlobs: fields.toolGlobs,
  };
}
