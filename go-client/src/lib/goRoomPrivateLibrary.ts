/**
 * Host private library factory — OPFS (Embedded) vs native FS (pg-booth-desktop).
 */

import { isBoothDesktopShell } from "./boothDesktop";
import { createRoomPrivateFsLibrary } from "./goRoomPrivateFs";
import { createRoomPrivateOpfsLibrary } from "./goRoomPrivateOpfs";
import type { RoomPrivateLibrary } from "./goRoomPrivateTypes";

export type CreateHostPrivateLibraryOpts = {
  isOpfsSupported?: () => boolean;
};

/** Pick storage backend for the current shell. */
export function createHostPrivateLibrary(
  opts: CreateHostPrivateLibraryOpts = {}
): RoomPrivateLibrary {
  if (isBoothDesktopShell()) {
    return createRoomPrivateFsLibrary();
  }
  return createRoomPrivateOpfsLibrary({
    isSupported: opts.isOpfsSupported,
  });
}

export {
  GO_ROOM_PRIVATE_ID_PREFIX,
  GO_ROOM_PRIVATE_UNSUPPORTED,
  GO_ROOM_PRIVATE_UNSUPPORTED_OPFS,
  isRoomPrivateFileId,
  newRoomPrivateFileId,
  type RoomPrivateEntry,
  type RoomPrivateImportResult,
  type RoomPrivateLibrary,
  type RoomPrivateOpenStreamResult,
  type RoomPrivateStreamWriter,
} from "./goRoomPrivateTypes";
