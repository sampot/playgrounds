/**
 * Solo catalog play on `/s/<id>` — memory／SW canvas, no Invite／join.
 */

import { getGoCatalogEntry, type GoCatalogEntry } from "./goCatalog";
import {
  getGoSamOfflineCache,
  putGoSamOfflineCache,
} from "./goSamOfflineCache";
import { mountGoCanvas, type GoCanvasMode } from "./mountGoCanvas";
import { assertSamHasIndex, loadSamFiles } from "./samLoad";
import type { FileMap } from "@pg/projectTypes";

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
};

type Listener = (s: SoloStatus) => void;

export function createSoloRuntime() {
  let status: SoloStatus = {
    phase: "idle",
    message: "",
    error: null,
    entry: null,
    canvasUrl: null,
    canvasSrcdoc: null,
    canvasMode: null,
    canvasGeneration: 0,
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
    });

    try {
      let files: FileMap;
      let fromCache = false;
      try {
        files = await loadSamFiles(entry.source);
        if (seq !== bootSeq) return;
        assertSamHasIndex(files);
        void putGoSamOfflineCache(entry.id, entry.source, files);
      } catch (netErr) {
        const cached = await getGoSamOfflineCache(entry.id);
        if (!cached) throw netErr;
        files = cached.files;
        fromCache = true;
        assertSamHasIndex(files);
      }
      if (seq !== bootSeq) return;
      generation += 1;
      const mounted = await mountGoCanvas(files, generation, {
        catalogId: entry.id,
      });
      if (seq !== bootSeq) {
        mounted.dispose();
        return;
      }
      disposeMount = mounted.dispose;
      set({
        phase: "ready",
        entry,
        message: fromCache ? `${entry.title}（離線）` : entry.title,
        error: null,
        canvasUrl: mounted.canvasUrl,
        canvasSrcdoc: mounted.canvasSrcdoc,
        canvasMode: mounted.canvasMode,
        canvasGeneration: mounted.canvasGeneration,
      });
    } catch (e) {
      if (seq !== bootSeq) return;
      clearMount();
      set({
        phase: "error",
        entry,
        error:
          e instanceof Error
            ? `載入失敗：${e.message}`
            : `載入失敗：${String(e)}`,
        message: "",
        canvasUrl: null,
        canvasSrcdoc: null,
        canvasMode: null,
        canvasGeneration: 0,
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
    getStatus: () => ({ ...status }),
  };
}

export type SoloRuntime = ReturnType<typeof createSoloRuntime>;
