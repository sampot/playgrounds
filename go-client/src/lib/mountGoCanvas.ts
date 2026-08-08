import type { FileMap } from "@pg/projectTypes";
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

export type GoCanvasMode = "sw" | "memory";

export type MountedGoCanvas = {
  sandboxId: string;
  canvasMode: GoCanvasMode;
  canvasUrl: string | null;
  canvasSrcdoc: string | null;
  canvasGeneration: number;
  dispose: () => void;
};

/**
 * Materialize SAM files into SW canvas or memory srcdoc (no OPFS).
 */
export async function mountGoCanvas(
  files: FileMap,
  generation: number
): Promise<MountedGoCanvas> {
  const sandboxId = `go-${crypto.randomUUID().slice(0, 8)}`;
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
      await syncGoCanvasSnapshot(sandboxId, generation, files);
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
  const built = buildGoMemoryCanvas(files, generation);
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
