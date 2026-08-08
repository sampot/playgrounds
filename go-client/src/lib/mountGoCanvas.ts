import type { FileMap } from "@pg/projectTypes";
import { isTextContent } from "@pg/projectTypes";
import {
  canvasEntryUrl,
  installGoCanvasApiListener,
  syncGoCanvasSnapshot,
  type GoCanvasApiListenerOptions,
} from "./goCanvas";
import { isGoCanvasSwUsable } from "./goCanvasSupport";
import {
  buildGoMemoryCanvas,
  installGoMemoryApiListener,
  revokeGoMemoryBlobs,
} from "./goMemoryCanvas";
import { injectGoScoreStorage } from "./goScoreStorage";

export type GoCanvasMode = "sw" | "memory";

export type MountGoCanvasOptions = {
  /** Solo `/s/<id>` — durable KV／DB ns＋legacy score localStorage shim. */
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

function apiCtx(
  sandboxId: string,
  files: FileMap,
  catalogId: string | null | undefined
): GoCanvasApiListenerOptions {
  const id = catalogId?.trim() || null;
  return {
    getSandboxId: () => sandboxId,
    getFiles: () => files,
    getCatalogId: () => id,
  };
}

/**
 * Materialize SAM files into SW canvas or memory srcdoc (no OPFS).
 * Runs functions.js for non-session `/api` with IndexedDB／localStorage KV／DB.
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
      unlisten = installGoCanvasApiListener(
        apiCtx(sandboxId, prepared, options.catalogId)
      );
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

  unlisten = installGoMemoryApiListener(
    apiCtx(sandboxId, prepared, options.catalogId)
  );
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
