/**
 * 遊戲級操作（清分／刪除下載／更新遊戲）的共用實作。
 * `GoMorePanel` 與 canvas play 的 `GoGameDrawer` 共用，避免邏輯重複。
 */

import type { GoCatalogEntry } from "./goCatalog";
import {
  deleteGoSamOfflineCache,
  getGoSamOfflineCache,
  putGoSamOfflineCache,
  fileMapsEqual,
} from "./goSamOfflineCache";
import { fetchSamTipRev, loadSamFiles } from "./samLoad";
import { clearGoProgressForCatalog } from "./goScoreStorage";
import type { FileListProgress } from "@pg/transferProgress";

export type GameActionResult =
  | { ok: true; flash: string }
  | { ok: false; flash: string };

export type UpdateActionResult =
  | { ok: true; changed: boolean; flash: string }
  | { ok: false; changed: false; flash: string };

export type RunUpdateOptions = {
  onProgress?: (progress: FileListProgress) => void;
};

/** 清除這個遊戲在本機的進度／分數。 */
export async function runClearScores(
  catalogId: string,
  title: string
): Promise<GameActionResult> {
  const n = await clearGoProgressForCatalog(catalogId);
  return {
    ok: true,
    flash:
      n > 0
        ? `已清除「${title}」的進度／分數`
        : `「${title}」沒有可清除的進度／分數`,
  };
}

/** 刪除這個遊戲在本機的下載內容。 */
export async function runRemoveOffline(
  catalogId: string,
  title: string
): Promise<GameActionResult> {
  const ok = await deleteGoSamOfflineCache(catalogId);
  return {
    ok,
    flash: ok
      ? `已刪除「${title}」`
      : `找不到已下載的「${title}」`,
  };
}

/** 下載並儲存這個遊戲的最新版本。 */
export async function runUpdate(
  entry: GoCatalogEntry,
  options?: RunUpdateOptions
): Promise<UpdateActionResult> {
  const id = entry.id;
  const title = entry.title ?? id;
  let tipRev: string | null = null;
  try {
    tipRev = await fetchSamTipRev(entry.source);
  } catch {
    tipRev = null;
  }
  const cached = await getGoSamOfflineCache(id);
  if (cached?.tipRev && tipRev && cached.tipRev === tipRev) {
    return {
      ok: true,
      changed: false,
      flash: `「${title}」已是最新版本`,
    };
  }
  let freshFiles;
  try {
    const loaded = await loadSamFiles(entry.source, {
      onProgress: options?.onProgress,
    });
    freshFiles = loaded.files;
    if (!tipRev) tipRev = loaded.tipRev;
  } catch {
    return {
      ok: false,
      changed: false,
      flash: `無法更新「${title}」：讀取遊戲來源失敗`,
    };
  }
  if (!cached) {
    const stored = await putGoSamOfflineCache(
      id,
      entry.source,
      freshFiles,
      tipRev
    );
    if (!stored) {
      return {
        ok: false,
        changed: false,
        flash: `無法儲存「${title}」，請確認瀏覽器儲存空間`,
      };
    }
    return { ok: true, changed: true, flash: `已下載「${title}」` };
  }
  if (fileMapsEqual(freshFiles, cached.files)) {
    await putGoSamOfflineCache(id, entry.source, cached.files, tipRev);
    return {
      ok: true,
      changed: false,
      flash: `「${title}」已是最新版本`,
    };
  }
  const stored = await putGoSamOfflineCache(
    id,
    entry.source,
    freshFiles,
    tipRev
  );
  if (!stored) {
    return {
      ok: false,
      changed: false,
      flash: `無法更新「${title}」，請確認瀏覽器儲存空間`,
    };
  }
  return { ok: true, changed: true, flash: `已更新「${title}」` };
}
