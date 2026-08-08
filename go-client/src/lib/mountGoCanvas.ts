import type { FileMap } from "@pg/projectTypes";
import { isTextContent } from "@pg/projectTypes";
import {
  canvasEntryUrl,
  installGoCanvasApiListener,
  syncGoCanvasSnapshot,
} from "./goCanvas";
import { isGoCanvasSwUsable } from "./goCanvasSupport";
import {
  buildGoMemoryCanvas,
  installGoMemorySessionListener,
  revokeGoMemoryBlobs,
} from "./goMemoryCanvas";
import { injectGoScoreStorage } from "./goScoreStorage";

export type GoCanvasMode = "sw" | "memory";

export type MountGoCanvasOptions = {
  /** Solo `/s/<id>` — namespace canvas localStorage for stable scores. */
  catalogId?: string | null;
};

export type MountedGoCanvas = {
  sandboxId: string;
  canvasMode: GoCanvasMode;
  canvasUrl: string | null;
  canvasSrcdoc: string | null;
  canvasGeneration: number;
  dispose: () => void;
};

function withSoloScoreNs(files: FileMap, catalogId: string | null | undefined): FileMap {
  const id = catalogId?.trim();
  if (!id) return files;
  const out: FileMap = { ...files };
  for (const [path, content] of Object.entries(files)) {
    const lower = path.toLowerCase();
    if (!lower.endsWith(".html") && !lower.endsWith(".htm")) continue;
    if (!isTextContent(content)) continue;
    out[path] = injectGoScoreStorage(content, id);
  }
  return out;
}

/**
 * Materialize SAM files into SW canvas or memory srcdoc (no OPFS).
 */
export async function mountGoCanvas(
  files: FileMap,
  generation: number,
  options: MountGoCanvasOptions = {}
): Promise<MountedGoCanvas> {
  const sandboxId = `go-${crypto.randomUUID().slice(0, 8)}`;
  const prepared = withSoloScoreNs(files, options.catalogId);
  let unlisten: (() => void) | null = null;
  let memoryBlobUrls: string[] = [];

  const dispose = () => {
    unlisten?.();
    unlisten = null;
    if (memoryBlobUrls.length) {
      revokeGoMemoryBlobs(memoryBlobUrls);
      memoryBlobUrls = [];
    }
  };

  const preferSw = isGoCanvasSwUsable();
  if (preferSw) {
    try {
      unlisten = installGoCanvasApiListener(() => sandboxId);
      await syncGoCanvasSnapshot(sandboxId, generation, prepared);
      return {
        sandboxId,
        canvasMode: "sw",
        canvasUrl: canvasEntryUrl(sandboxId, generation),
        canvasSrcdoc: null,
        canvasGeneration: generation,
        dispose,
      };
    } catch {
      unlisten?.();
      unlisten = null;
    }
  }

  unlisten = installGoMemorySessionListener(() => sandboxId);
  const built = buildGoMemoryCanvas(prepared, generation);
  memoryBlobUrls = built.blobUrls;
  return {
    sandboxId,
    canvasMode: "memory",
    canvasUrl: null,
    canvasSrcdoc: built.srcdoc,
    canvasGeneration: generation,
    dispose,
  };
}
