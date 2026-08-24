import { describe, expect, it } from "vitest";
import { createRoomShareFsLibrary } from "./goRoomShareFs";
import { shareFileIdForPath } from "./goRoomShareTypes";

describe("createRoomShareFsLibrary", () => {
  it("lists flat files and skips directories", async () => {
    const files = new Map<string, Uint8Array>([
      ["clip.mp4", new Uint8Array([1, 2, 3])],
      ["notes.txt", new TextEncoder().encode("hi")],
    ]);
    const lib = createRoomShareFsLibrary({
      rootDir: "/booth/share",
      io: {
        exists: async () => true,
        readDir: async () => [
          { name: "clip.mp4", isDirectory: false },
          { name: "nested", isDirectory: true },
          { name: ".hidden", isDirectory: false },
          { name: "notes.txt", isDirectory: false },
        ],
        readFile: async (path) => files.get(path.split("/").pop()!) ?? new Uint8Array(),
        statSize: async (path) =>
          (files.get(path.split("/").pop()!) ?? new Uint8Array()).byteLength,
      },
    });

    const listed = await lib.scan();
    expect(listed.map((e) => e.name)).toEqual(["clip.mp4", "notes.txt"]);
    expect(listed[0]?.id).toBe(shareFileIdForPath("clip.mp4"));

    const file = await lib.loadFile(listed[0]!);
    expect(file.name).toBe("clip.mp4");
    expect(file.size).toBe(3);
  });
});
