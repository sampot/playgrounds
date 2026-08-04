/**
 * Read declared sam:capabilities from FileMap / HTML (DEC-036).
 */

import { parseSamHead } from "../../sam-runtime/index.ts";
import type { FileMap } from "./projectTypes";
import { DEFAULT_ENTRY } from "./projectTypes";
import {
  filterKnownCapabilities,
  type KnownCapability,
} from "./samCapabilities";

export function declaredCapabilitiesFromHtml(html: string): KnownCapability[] {
  return filterKnownCapabilities(parseSamHead(html).capabilities);
}

export function declaredCapabilitiesFromFiles(
  files: FileMap | null | undefined
): KnownCapability[] {
  const html = files?.[DEFAULT_ENTRY];
  if (typeof html !== "string") return [];
  return declaredCapabilitiesFromHtml(html);
}
