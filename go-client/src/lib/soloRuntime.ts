/**
 * Solo catalog play on `/s/<id>` — memory／SW canvas, no Invite／join.
 */

import { getGoCatalogEntry, type GoCatalogEntry } from "./goCatalog";
import { friendlySoloLoadError } from "./goFriendlyError";
import {
  getGoSamOfflineCache,
  putGoSamOfflineCache,
} from "./goSamOfflineCache";
import {
  goLoadProgressFromFiles,
  type GoLoadProgress,
} from "./goLoadProgress";
import { mountGoCanvas, type GoCanvasMode } from "./mountGoCanvas";
import { assertSamHasIndex, loadSamFiles } from "./samLoad";
import type { FileMap } from "@pg/projectTypes";
import type { HostRuntime } from "./hostRuntime";

export type SoloPhase = "idle" | "loading" | "ready" | "error";

export type SoloStatus = {
  phase: SoloPhase;
  message: string;
  error: string | null;
  entry: GoCatalogEntry | null;
  canvasUrl: string | null;
  canvasSrcdoc: string | null;
  canvasMode: GoCanvasMode | null;
  canvasGeneration: number;
  /** File download progress while `phase === "loading"`. */
  loadProgress: GoLoadProgress | null;
};

type Listener = (s: SoloStatus) => void;

/** Latest mounted files (Host-invite bind reads after ready). */
let samFilesRef: FileMap | null = null;
let sandboxIdRef: string | null = null;

export function createSoloRuntime(opts?: {
  /**
   * Lazy getter for the active HostRuntime (hostable SAMs only). When
   * provided, mounted canvases will have `env.HOST` injected into functions.js
   * (DEC-053). Resolve is deferred until each `/api/host/*` call so the bind
   * lifecycle can complete after the canvas mounts.
   */
  getHostRuntime?: () => HostRuntime | null;
}) {
  let status: SoloStatus = {
    phase: "idle",
    message: "",
    error: null,
    entry: null,
    canvasUrl: null,
    canvasSrcdoc: null,
    canvasMode: null,
    canvasGeneration: 0,
    loadProgress: null,
  };
  const listeners = new Set<Listener>();
  let generation = 0;
  let disposeMount: (() => void) | null = null;
  let bootSeq = 0;

  function emit() {
    for (const l of listeners) l({ ...status });
  }

  function set(partial: Partial<SoloStatus>) {
    status = { ...status, ...partial };
    emit();
  }

  function clearMount() {
    disposeMount?.();
    disposeMount = null;
    samFilesRef = null;
    sandboxIdRef = null;
  }

  async function bootFromCatalogId(catalogId: string): Promise<void> {
    const seq = ++bootSeq;
    clearMount();
    const entry = getGoCatalogEntry(catalogId);
    if (!entry) {
      set({
        phase: "error",
        entry: null,
        error: "型錄沒有這項小品（可能已下架）",
        message: "",
        canvasUrl: null,
        canvasSrcdoc: null,
        canvasMode: null,
        canvasGeneration: 0,
        loadProgress: null,
      });
      return;
    }

    set({
      phase: "loading",
      entry,
      message: `正在載入「${entry.title}」…`,
      error: null,
      canvasUrl: null,
      canvasSrcdoc: null,
      canvasMode: null,
      canvasGeneration: 0,
      loadProgress: { ratio: null, detail: "準備中…" },
    });

    try {
      let files: FileMap;
      let fromCache = false;
      const cached = await getGoSamOfflineCache(entry.id);
      if (cached && seq === bootSeq) {
        files = cached.files;
        fromCache = true;
        assertSamHasIndex(files);
        if (seq !== bootSeq) return;
        set({
          loadProgress: { ratio: 1, detail: "離線快取" },
          message: `正在開啟「${entry.title}」…`,
        });
        loadSamFiles(entry.source)
          .then(async newFiles => {
            if (seq !== bootSeq) return;
            assertSamHasIndex(newFiles);
            await putGoSamOfflineCache(entry.id, entry.source, newFiles);
          })
          .catch(() => {});
      } else {
        files = await loadSamFiles(entry.source, {
          onProgress: p => {
            if (seq !== bootSeq) return;
            const loadProgress = goLoadProgressFromFiles(p);
            set({
              loadProgress,
              message: `正在下載「${entry.title}」… ${loadProgress.detail}`,
            });
          },
        });
        if (seq !== bootSeq) return;
        assertSamHasIndex(files);
        await putGoSamOfflineCache(entry.id, entry.source, files);
      }
      if (seq !== bootSeq) return;
      set({
        loadProgress: {
          ratio: 1,
          detail: fromCache ? "離線快取" : "下載完成",
        },
        message: `正在開啟「${entry.title}」…`,
      });
      generation += 1;
      const mounted = await mountGoCanvas(files, generation, {
        catalogId: entry.id,
        getHostRuntime: opts?.getHostRuntime,
      });
      if (seq !== bootSeq) {
        mounted.dispose();
        return;
      }
      disposeMount = mounted.dispose;
      samFilesRef = files;
      sandboxIdRef = mounted.sandboxId;
      set({
        phase: "ready",
        entry,
        message: fromCache ? `${entry.title}（離線）` : entry.title,
        error: null,
        canvasUrl: mounted.canvasUrl,
        canvasSrcdoc: mounted.canvasSrcdoc,
        canvasMode: mounted.canvasMode,
        canvasGeneration: mounted.canvasGeneration,
        loadProgress: null,
      });
    } catch (e) {
      if (seq !== bootSeq) return;
      clearMount();
      set({
        phase: "error",
        entry,
        error: friendlySoloLoadError(e, entry.title),
        message: "",
        canvasUrl: null,
        canvasSrcdoc: null,
        canvasMode: null,
        canvasGeneration: 0,
        loadProgress: null,
      });
    }
  }

  function dispose(): void {
    bootSeq += 1;
    clearMount();
    set({
      phase: "idle",
      message: "",
      error: null,
      entry: null,
      canvasUrl: null,
      canvasSrcdoc: null,
      canvasMode: null,
      canvasGeneration: 0,
      loadProgress: null,
    });
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener({ ...status });
    return () => listeners.delete(listener);
  }

  return {
    subscribe,
    bootFromCatalogId,
    dispose,
    /** Mounted SAM files (null before ready) — used by Host-invite bind. */
    getFiles: () => samFilesRef,
    /** Active sandboxId (null before ready). */
    getSandboxId: () => sandboxIdRef,
    getStatus: () => ({ ...status }),
  };
}

export type SoloRuntime = ReturnType<typeof createSoloRuntime>;
