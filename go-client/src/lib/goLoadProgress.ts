/**
 * SAM download progress for go loading UI (file-list fetch).
 */

import type { FileListProgress } from "@pg/transferProgress";
import { fileListToOpenProgress } from "@pg/transferProgress";

export type GoLoadProgress = {
  /** 0..1 when known; null = indeterminate. */
  ratio: number | null;
  detail: string;
};

export function goLoadProgressFromFiles(p: FileListProgress): GoLoadProgress {
  const open = fileListToOpenProgress(p);
  return {
    ratio: open.ratio,
    detail: open.detail?.trim() || `${p.done}/${p.total}`,
  };
}
