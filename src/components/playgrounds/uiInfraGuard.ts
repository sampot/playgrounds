/**
 * UI ↔ backend boundary helpers (DEC-031 / DEC-024).
 *
 * Simulated topology:
 *   UI ← network (/api) → backend (functions.js ∥ controller.js) ↔ resources
 *
 * - UI may only call `functions.js` (Workers-shaped HTTP).
 * - UI must not call Controller or bindings directly.
 * - functions.js and controller.js are peers; both may use the same resources.
 * - Having a Controller does **not** block canvas → functions.
 */

import { CONTROLLER_ENTRY } from "../../sam-runtime/index.ts";
import { isTextContent, type FileMap } from "./projectTypes";

export function fileMapHasController(files: FileMap): boolean {
  const c = files[CONTROLLER_ENTRY];
  return c !== undefined && isTextContent(c);
}

/** Canvas /api always targets functions.js when present (CF Worker entry). */
export type CanvasApiRoute = { kind: "functions" };

export function resolveCanvasApiRoute(_files: FileMap): CanvasApiRoute {
  return { kind: "functions" };
}
