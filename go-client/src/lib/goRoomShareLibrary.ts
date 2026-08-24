/**
 * Host share library factory — directory scan (desktop) vs unsupported (embedded).
 */

import { isBoothDesktopShell } from "./boothDesktop";
import { createRoomShareFsLibrary } from "./goRoomShareFs";
import type { HostShareLibrary } from "./goRoomShareTypes";

export type { HostShareLibrary, ShareLibraryFile } from "./goRoomShareTypes";
export {
  GO_ROOM_SHARE_ID_PREFIX,
  GO_ROOM_SHARE_UNSUPPORTED,
  isShareDirFileId,
  shareFileIdForPath,
} from "./goRoomShareTypes";

/** Pick share backend for the current shell; null when unsupported. */
export function createHostShareLibrary(): HostShareLibrary | null {
  if (!isBoothDesktopShell()) return null;
  return createRoomShareFsLibrary();
}
