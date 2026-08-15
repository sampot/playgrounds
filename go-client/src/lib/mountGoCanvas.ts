import type { FileMap } from "@pg/projectTypes";
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
import type { HostRuntime } from "./hostRuntime";

export type GoCanvasMode = "sw" | "memory";

export type MountGoCanvasOptions = {
  /** Solo `/s/<id>` — durable KV／DB namespace for intrinsics (env.KV／env.DB). */
  catalogId?: string | null;
  /**
   * Optional: the HostRuntime backing this canvas (hostable SAMs only).
   * When provided, `env.HOST` is injected into functions.js so its
   * `/api/host/*` routes resolve through the go-local HostBridge factory.
   * Lives in the page, not in the canvas — pass a getter.
   */
  getHostRuntime?: () => HostRuntime | null;
};

export type MountedGoCanvas = {
  sandboxId: string;
  canvasMode: GoCanvasMode;
  canvasUrl: string | null;
  canvasSrcdoc: string | null;
  canvasGeneration: number;
  dispose: () => void;
};

function apiCtx(
  sandboxId: string,
  files: FileMap,
  catalogId: string | null | undefined,
  getHostRuntime?: () => HostRuntime | null
): GoCanvasApiListenerOptions {
  const id = catalogId?.trim() || null;
  const ctx: GoCanvasApiListenerOptions = {
    getSandboxId: () => sandboxId,
    getFiles: () => files,
    getCatalogId: () => id,
  };
  if (getHostRuntime) {
    ctx.getHostRuntime = getHostRuntime;
  }
  return ctx;
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
  // Score/localStorage persistence is unified by the canvas `localStorage`→KV
  // shim (PG-LOCALSTORAGE-SHIM-SPEC §7); go no longer injects its own shim.
  const prepared = files;
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
        apiCtx(sandboxId, prepared, options.catalogId, options.getHostRuntime)
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
    apiCtx(sandboxId, prepared, options.catalogId, options.getHostRuntime)
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
