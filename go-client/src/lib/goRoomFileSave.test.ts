import { describe, expect, it } from "vitest";
import {
  roomFileSaveSupported,
  ROOM_FILE_SAVE_UNSUPPORTED,
} from "./goRoomFileSave";

describe("pickRoomFileSave", () => {
  it("is unsupported without showSaveFilePicker", () => {
    expect(roomFileSaveSupported()).toBe(false);
    expect(ROOM_FILE_SAVE_UNSUPPORTED).toMatch(/系統瀏覽器|電腦/);
  });
});
