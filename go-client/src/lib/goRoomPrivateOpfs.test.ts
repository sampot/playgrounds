import { describe, expect, it, vi } from "vitest";
import {
  GO_ROOM_PRIVATE_ID_PREFIX,
  GO_ROOM_PRIVATE_OPFS_ROOT,
  createRoomPrivateLibrary,
  isRoomPrivateFileId,
  newRoomPrivateFileId,
} from "./goRoomPrivateOpfs";

describe("room private id namespace", () => {
  it("prefixes private ids and rejects share-looking ids", () => {
    const id = newRoomPrivateFileId(() => "abcdef12");
    expect(id.startsWith(GO_ROOM_PRIVATE_ID_PREFIX)).toBe(true);
    expect(isRoomPrivateFileId(id)).toBe(true);
    expect(isRoomPrivateFileId("file-1")).toBe(false);
    expect(isRoomPrivateFileId("")).toBe(false);
  });
});

function memoryOpfs() {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>(["", GO_ROOM_PRIVATE_OPFS_ROOT, `${GO_ROOM_PRIVATE_OPFS_ROOT}/files`]);

  function dirHandle(path: string): FileSystemDirectoryHandle {
    return {
      kind: "directory",
      name: path.split("/").pop() || "",
      async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
        const next = path ? `${path}/${name}` : name;
        if (!dirs.has(next)) {
          if (!opts?.create) throw new DOMException("NotFoundError");
          dirs.add(next);
        }
        return dirHandle(next);
      },
      async getFileHandle(name: string, opts?: { create?: boolean }) {
        const key = path ? `${path}/${name}` : name;
        if (!files.has(key) && !opts?.create) {
          throw new DOMException("NotFoundError");
        }
        if (!files.has(key) && opts?.create) files.set(key, new Uint8Array());
        return fileHandle(key);
      },
      async removeEntry(name: string) {
        const key = path ? `${path}/${name}` : name;
        files.delete(key);
      },
      async *entries() {
        const prefix = path ? `${path}/` : "";
        for (const key of files.keys()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          if (rest.includes("/")) continue;
          yield [rest, fileHandle(key)] as const;
        }
      },
    } as unknown as FileSystemDirectoryHandle;
  }

  function fileHandle(key: string): FileSystemFileHandle {
    return {
      kind: "file",
      name: key.split("/").pop() || "",
      async getFile() {
        const bytes = files.get(key) ?? new Uint8Array();
        const name = key.split("/").pop() || "blob";
        return new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], name);
      },
      async createWritable() {
        const chunks: Uint8Array[] = [];
        return {
          async write(data: BufferSource | Blob | string) {
            if (typeof data === "string") {
              chunks.push(new TextEncoder().encode(data));
              return;
            }
            if (data instanceof Blob) {
              chunks.push(new Uint8Array(await data.arrayBuffer()));
              return;
            }
            chunks.push(new Uint8Array(data as ArrayBuffer));
          },
          async close() {
            const total = chunks.reduce((n, c) => n + c.byteLength, 0);
            const out = new Uint8Array(total);
            let o = 0;
            for (const c of chunks) {
              out.set(c, o);
              o += c.byteLength;
            }
            files.set(key, out);
          },
          async abort() {},
        };
      },
    } as unknown as FileSystemFileHandle;
  }

  return {
    files,
    getDirectory: async () => dirHandle(""),
  };
}

describe("createRoomPrivateLibrary", () => {
  it("imports list deletes without touching a share registry", async () => {
    const mem = memoryOpfs();
    const lib = createRoomPrivateLibrary({
      getDirectory: mem.getDirectory,
      isSupported: () => true,
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
    expect(imported.entry.name).toBe("clip.mp4");
    expect(imported.entry.size).toBe(4);

    const listed = await lib.list();
    expect(listed.map((e) => e.id)).toEqual([imported.entry.id]);

    const got = await lib.getFile(imported.entry.id);
    expect(got).toBeTruthy();
    expect(got!.name).toBe("clip.mp4");
    expect(got!.size).toBe(4);

    await lib.remove(imported.entry.id);
    expect(await lib.list()).toEqual([]);
    expect(await lib.getFile(imported.entry.id)).toBeNull();
  });

  it("reports unsupported when OPFS is missing", async () => {
    const lib = createRoomPrivateLibrary({
      getDirectory: async () => {
        throw new Error("no opfs");
      },
      isSupported: () => false,
    });
    expect(lib.supported).toBe(false);
    const out = await lib.importFile(new File([""], "a.mp4"));
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/OPFS|私有/);
  });

  it("never registers into a share room-file registry hook", async () => {
    const mem = memoryOpfs();
    const registerLocal = vi.fn();
    const lib = createRoomPrivateLibrary({
      getDirectory: mem.getDirectory,
      isSupported: () => true,
      newId: () => "11223344",
      registerShareLocal: registerLocal,
    });
    await lib.importFile(
      new File([new Uint8Array([9])], "a.mp3", { type: "audio/mpeg" })
    );
    expect(registerLocal).not.toHaveBeenCalled();
  });
});
