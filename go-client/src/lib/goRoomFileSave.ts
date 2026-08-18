/**
 * File System Access save picker for 包廂 downloads.
 * The only allowed sink is a user-picked file writable — no SW／OPFS／Blob.
 */

export type RoomFileWritable = {
  write: (data: BufferSource) => Promise<unknown> | unknown;
  close: () => Promise<unknown> | unknown;
  abort?: () => Promise<unknown> | unknown;
};

export const ROOM_FILE_SAVE_UNSUPPORTED =
  "這個瀏覽器沒辦法直接存到檔案。請用電腦或系統瀏覽器再開一次。";

export function roomFileSaveSupported(): boolean {
  return typeof globalThis.showSaveFilePicker === "function";
}

export async function pickRoomFileSave(
  suggestedName: string
): Promise<RoomFileWritable | null> {
  if (!roomFileSaveSupported()) {
    throw Object.assign(new Error(ROOM_FILE_SAVE_UNSUPPORTED), {
      code: "unsupported",
    });
  }
  try {
    const handle = await globalThis.showSaveFilePicker({
      suggestedName,
    });
    const stream = await handle.createWritable();
    return {
      write: (data) => stream.write(data),
      close: () => stream.close(),
      abort: () => stream.abort(),
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}
