import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileContent, FileMap, ProjectMeta } from "./projectTypes";

const saveFile =
  vi.fn<
    (id: string, path: string, content: FileContent) => Promise<ProjectMeta>
  >();
const createDir = vi.fn<(id: string, path: string) => Promise<ProjectMeta>>();
const deleteFile = vi.fn<(id: string, path: string) => Promise<ProjectMeta>>();
const deleteDir = vi.fn<(id: string, path: string) => Promise<ProjectMeta>>();
const loadProjectFiles = vi.fn<(id: string) => Promise<FileMap>>();

vi.mock("./opfsStore", () => ({
  saveFile: (id: string, path: string, content: FileContent) =>
    saveFile(id, path, content),
  createDir: (id: string, path: string) => createDir(id, path),
  deleteFile: (id: string, path: string) => deleteFile(id, path),
  deleteDir: (id: string, path: string) => deleteDir(id, path),
  loadProjectFiles: (id: string) => loadProjectFiles(id),
}));

import { hashUtf8 } from "./contentHash";
import { bytesToBase64 } from "./hostBinary";
import {
  createRuntimeLocalFsHandlers,
  type FsChangedEvent,
} from "./runtimeLocalHostFs";

const stubMeta = { id: "sbx" } as ProjectMeta;

describe("createRuntimeLocalFsHandlers (DEC-038 Runtime FS)", () => {
  beforeEach(() => {
    saveFile.mockReset();
    createDir.mockReset();
    deleteFile.mockReset();
    deleteDir.mockReset();
    loadProjectFiles.mockReset();
    saveFile.mockResolvedValue(stubMeta);
    createDir.mockResolvedValue(stubMeta);
    deleteFile.mockResolvedValue(stubMeta);
    deleteDir.mockResolvedValue(stubMeta);
    loadProjectFiles.mockResolvedValue({});
  });

  it("writeFile persists, updates snapshot, and notifies", async () => {
    const files: Record<string, string> = { "a.md": "old" };
    const events: FsChangedEvent[] = [];
    const h = createRuntimeLocalFsHandlers({
      files,
      sandboxId: "sbx",
      activeAgentSandboxId: "agent",
      onFsChanged: ev => events.push(ev),
    });
    const out = (await h.writeFile!("a.md", "new")) as {
      path: string;
      hash: string;
    };
    expect(out.path).toBe("a.md");
    expect(out.hash).toBe(await hashUtf8("new"));
    expect(files["a.md"]).toBe("new");
    expect(saveFile).toHaveBeenCalledWith("sbx", "a.md", "new");
    expect(events).toEqual([
      { sandboxId: "sbx", op: "write", path: "a.md", content: "new" },
    ]);
  });

  it("writeFile rejects writes to active agent sandbox", async () => {
    const h = createRuntimeLocalFsHandlers({
      files: {},
      sandboxId: "agent",
      activeAgentSandboxId: "agent",
    });
    await expect(h.writeFile!("x.md", "y")).rejects.toMatchObject({
      code: "agent_readonly",
    });
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("writeFile honours expectedHash conflict", async () => {
    const files: Record<string, string> = { "a.md": "old" };
    const h = createRuntimeLocalFsHandlers({
      files,
      sandboxId: "sbx",
      activeAgentSandboxId: null,
    });
    await expect(
      h.writeFile!("a.md", "new", { expectedHash: "wrong" })
    ).rejects.toMatchObject({ code: "conflict" });
    expect(saveFile).not.toHaveBeenCalled();

    const okHash = await hashUtf8("old");
    await h.writeFile!("a.md", "new", { expectedHash: okHash });
    expect(saveFile).toHaveBeenCalledOnce();
  });

  it("writeFileBase64／mkdir／remove／listDir work against snapshot", async () => {
    const files: Record<string, string | Uint8Array> = {
      "dir/a.txt": "x",
      "dir/b.txt": "y",
    };
    const events: FsChangedEvent[] = [];
    const h = createRuntimeLocalFsHandlers({
      files,
      sandboxId: "sbx",
      activeAgentSandboxId: null,
      onFsChanged: ev => events.push(ev),
    });

    const bytes = new TextEncoder().encode("bin");
    const b64 = bytesToBase64(bytes);
    const written = (await h.writeFileBase64!("pic.bin", b64)) as {
      byteLength: number;
    };
    expect(written.byteLength).toBe(3);
    expect(files["pic.bin"]).toBeInstanceOf(Uint8Array);

    await h.mkdir!("nest");
    expect(createDir).toHaveBeenCalledWith("sbx", "nest");

    deleteFile.mockRejectedValueOnce(new Error("not a file"));
    await h.remove!("dir");
    expect(deleteDir).toHaveBeenCalledWith("sbx", "dir");
    expect(files["dir/a.txt"]).toBeUndefined();
    expect(files["dir/b.txt"]).toBeUndefined();

    files["root.txt"] = "z";
    const listing = (await h.listDir!({})) as {
      entries: { path: string; kind: string }[];
    };
    expect(listing.entries.some(e => e.path === "root.txt")).toBe(true);
    expect(listing.entries.some(e => e.path === "pic.bin")).toBe(true);
    expect(events.map(e => e.op)).toEqual(["write", "mkdir", "remove"]);
  });

  it("writeFile accepts sandboxId string as third arg", async () => {
    const h = createRuntimeLocalFsHandlers({
      files: {},
      sandboxId: "sbx",
      activeAgentSandboxId: null,
    });
    await h.writeFile!("other.md", "c", "other-id");
    expect(saveFile).toHaveBeenCalledWith("other-id", "other.md", "c");
  });

  it("awaits beforeFsAccess before mutating OPFS", async () => {
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>(r => {
      release = r;
    });
    const h = createRuntimeLocalFsHandlers({
      files: {},
      sandboxId: "sbx",
      activeAgentSandboxId: null,
      beforeFsAccess: async () => {
        order.push("wait");
        await held;
        order.push("unlocked");
      },
    });
    const p = h.writeFile!("a.txt", "hi");
    await Promise.resolve();
    expect(order).toEqual(["wait"]);
    expect(saveFile).not.toHaveBeenCalled();
    release();
    await p;
    expect(order).toEqual(["wait", "unlocked"]);
    expect(saveFile).toHaveBeenCalledWith("sbx", "a.txt", "hi");
  });
});
