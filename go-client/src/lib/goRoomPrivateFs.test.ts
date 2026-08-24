import { describe, expect, it, vi } from "vitest";

const boothDesktopShell = vi.hoisted(() => ({ value: false }));
vi.mock("./boothDesktop", () => ({
  isBoothDesktopShell: () => boothDesktopShell.value,
}));

import {
  GO_ROOM_PRIVATE_FILES_DIR,
  GO_ROOM_PRIVATE_ID_PREFIX,
  GO_ROOM_PRIVATE_MANIFEST,
} from "./goRoomPrivateTypes";
import { createRoomPrivateFsLibrary } from "./goRoomPrivateFs";
import { createHostPrivateLibrary } from "./goRoomPrivateLibrary";

function memoryFs(root: string) {
  const files = new Map<string, Uint8Array>();

  return {
    files,
    root,
    async mkdir(path: string): Promise<void> {
      files.set(path, new Uint8Array());
    },
    async exists(path: string): Promise<boolean> {
      return files.has(path);
    },
    async readFile(path: string): Promise<Uint8Array> {
      return files.get(path) ?? new Uint8Array();
    },
    async readText(path: string): Promise<string> {
      const bytes = files.get(path) ?? new Uint8Array();
      return new TextDecoder().decode(bytes);
    },
    async writeFile(
      path: string,
      data: Uint8Array,
      opts?: { append?: boolean }
    ): Promise<void> {
      if (opts?.append && files.has(path)) {
        const prev = files.get(path)!;
        const out = new Uint8Array(prev.byteLength + data.byteLength);
        out.set(prev, 0);
        out.set(data, prev.byteLength);
        files.set(path, out);
        return;
      }
      files.set(path, data);
    },
    async writeText(path: string, text: string): Promise<void> {
      await this.writeFile(path, new TextEncoder().encode(text));
    },
    async remove(path: string): Promise<void> {
      files.delete(path);
    },
  };
}

describe("createRoomPrivateFsLibrary", () => {
  it("imports list deletes on native FS layout", async () => {
    const mem = memoryFs("/data/booth/private");
    const lib = createRoomPrivateFsLibrary({
      rootDir: mem.root,
      mkdir: mem.mkdir,
      exists: mem.exists,
      readFile: mem.readFile,
      readText: mem.readText,
      writeFile: mem.writeFile,
      writeText: mem.writeText,
      remove: mem.remove,
      newId: () => "aabbccdd",
    });
    expect(lib.supported).toBe(true);

    const file = new File([new Uint8Array([1, 2, 3, 4])], "clip.mp4", {
      type: "video/mp4",
    });
    const imported = await lib.importFile(file);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.entry.id).toBe(`${GO_ROOM_PRIVATE_ID_PREFIX}aabbccdd`);

    const manifestPath = `${mem.root}/${GO_ROOM_PRIVATE_MANIFEST}`;
    expect(mem.files.has(manifestPath)).toBe(true);
    const blobPath = `${mem.root}/${GO_ROOM_PRIVATE_FILES_DIR}/${imported.entry.id}`;
    expect(mem.files.get(blobPath)?.byteLength).toBe(4);

    const listed = await lib.list();
    expect(listed.map((e) => e.id)).toEqual([imported.entry.id]);

    const got = await lib.getFile(imported.entry.id);
    expect(got?.size).toBe(4);

    await lib.remove(imported.entry.id);
    expect(await lib.list()).toEqual([]);
    expect(mem.files.has(blobPath)).toBe(false);
  });

  it("streams chunks with append writes", async () => {
    const mem = memoryFs("/data/booth/private");
    const lib = createRoomPrivateFsLibrary({
      rootDir: mem.root,
      mkdir: mem.mkdir,
      exists: mem.exists,
      readFile: mem.readFile,
      readText: mem.readText,
      writeFile: mem.writeFile,
      writeText: mem.writeText,
      remove: mem.remove,
      newId: () => "stream01",
    });
    const opened = await lib.openStreamWrite({
      name: "rec.webm",
      mime: "video/webm",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    await opened.writer.writeChunk(new Blob([new Uint8Array([1, 2])]));
    await opened.writer.writeChunk(new Blob([new Uint8Array([3])]));
    const done = await opened.writer.finalize();
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.entry.size).toBe(3);
    const blobPath = `${mem.root}/${GO_ROOM_PRIVATE_FILES_DIR}/${done.entry.id}`;
    expect(mem.files.get(blobPath)?.byteLength).toBe(3);
  });
});

describe("createHostPrivateLibrary", () => {
  it("uses FS backend in booth desktop shell", () => {
    boothDesktopShell.value = true;
    const lib = createHostPrivateLibrary();
    expect(lib.supported).toBe(true);
    boothDesktopShell.value = false;
  });

  it("uses OPFS backend in browser", () => {
    boothDesktopShell.value = false;
    const lib = createHostPrivateLibrary({
      isOpfsSupported: () => false,
    });
    expect(lib.supported).toBe(false);
  });
});
