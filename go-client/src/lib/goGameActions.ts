/**
 * 遊戲級操作（清分／移除離線／檢查更新）的共用實作。
 * `GoMorePanel` 與 canvas play 的 `GoGameDrawer` 共用，避免邏輯重複。
 */

import type { GoCatalogEntry } from "./goCatalog";
import {
  deleteGoSamOfflineCache,
  getGoSamOfflineCache,
  putGoSamOfflineCache,
  fileMapsEqual,
} from "./goSamOfflineCache";
import { loadSamFiles } from "./samLoad";
import { clearGoProgressForCatalog } from "./goScoreStorage";

export type GameActionResult =
  | { ok: true; flash: string }
  | { ok: false; flash: string };

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

/** 移除這個遊戲的離線包。 */
export async function runRemoveOffline(
  catalogId: string,
  title: string
): Promise<GameActionResult> {
  const ok = await deleteGoSamOfflineCache(catalogId);
  return {
    ok,
    flash: ok
      ? `已移除「${title}」的離線下載`
      : `找不到「${title}」的離線下載`,
  };
}

/** 檢查並套用這個遊戲的最新版本（離線包）。 */
export async function runUpdate(
  entry: GoCatalogEntry
): Promise<GameActionResult> {
  const id = entry.id;
  const title = entry.title ?? id;
  let freshFiles;
  try {
    freshFiles = await loadSamFiles(entry.source);
  } catch {
    return { ok: false, flash: `檢查更新失敗：無法讀取「${title}」的來源` };
  }
  const cached = await getGoSamOfflineCache(id);
  if (!cached) {
    await putGoSamOfflineCache(id, entry.source, freshFiles);
    return { ok: true, flash: `已為「${title}」建立離線下載` };
  }
  if (fileMapsEqual(freshFiles, cached.files)) {
    return { ok: true, flash: `「${title}」已是最新版本` };
  }
  await putGoSamOfflineCache(id, entry.source, freshFiles);
  return { ok: true, flash: `已更新「${title}」至最新版本` };
}
