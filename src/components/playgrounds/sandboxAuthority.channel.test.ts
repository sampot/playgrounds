import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileMap, ProjectMeta } from "./projectTypes";

const isBackendRuntimeLive = vi.fn<() => boolean>(() => false);
const ensureBackendRuntimeWorker = vi.fn<() => Promise<void>>(async () => {});
const backendFsOp = vi.fn<(op: string, args: unknown[]) => Promise<unknown>>();

vi.mock("./backendHost", () => ({
  isBackendRuntimeLive: () => isBackendRuntimeLive(),
  ensureBackendRuntimeWorker: () => ensureBackendRuntimeWorker(),
  backendFsOp: (op: string, args: unknown[]) => backendFsOp(op, args),
}));

const opfsSaveFile =
  vi.fn<(id: string, path: string, content: unknown) => Promise<ProjectMeta>>();

vi.mock("./opfsStore", async importOriginal => {
  const actual = await importOriginal<typeof import("./opfsStore")>();
  return {
    ...actual,
    mainThreadNeedsOpfsWorkerWrites: () => false,
    saveFile: (id: string, path: string, content: unknown) =>
      opfsSaveFile(id, path, content),
  };
});

const { saveFile, loadProjectFiles } = await import("./sandboxAuthority");

describe("sandboxAuthority Runtime channel (DEC-038)", () => {
  beforeEach(() => {
    isBackendRuntimeLive.mockReset();
    backendFsOp.mockReset();
    opfsSaveFile.mockReset();
    opfsSaveFile.mockResolvedValue({ id: "local" } as ProjectMeta);
    isBackendRuntimeLive.mockReturnValue(false);
  });

  it("uses opfs when Runtime is not live", async () => {
    isBackendRuntimeLive.mockReturnValue(false);
    await saveFile("sbx", "a.md", "hi");
    expect(opfsSaveFile).toHaveBeenCalledWith("sbx", "a.md", "hi");
    expect(backendFsOp).not.toHaveBeenCalled();
  });

  it("routes saveFile through backendFsOp when Runtime is live", async () => {
    isBackendRuntimeLive.mockReturnValue(true);
    backendFsOp.mockResolvedValue({ id: "remote" } as ProjectMeta);
    const out = await saveFile("sbx", "a.md", "hi");
    expect(backendFsOp).toHaveBeenCalledWith("saveFile", ["sbx", "a.md", "hi"]);
    expect(opfsSaveFile).not.toHaveBeenCalled();
    expect(out).toEqual({ id: "remote" });
  });

  it("routes loadProjectFiles through backendFsOp when live", async () => {
    isBackendRuntimeLive.mockReturnValue(true);
    const files: FileMap = { "a.md": "x" };
    backendFsOp.mockResolvedValue(files);
    const out = await loadProjectFiles("sbx");
    expect(backendFsOp).toHaveBeenCalledWith("loadProjectFiles", ["sbx"]);
    expect(out).toEqual({ "a.md": "x" });
  });
});
