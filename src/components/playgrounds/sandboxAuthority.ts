/**
 * Sandbox storage authority API (DEC-038).
 *
 * Shell UI／HOST 權威讀寫必須經由此模組，不得直接呼叫
 * `navigator.storage.getDirectory` 當沙盒根。
 *
 * Leader＋Backend Runtime 活著時：經通道進 Worker（OPFS 實作於 Runtime）。
 * Runtime 未啟動（Follower／boot）：同來源 OPFS 直讀寫（同瀏覽器共享儲存）。
 */

import type { FileContent, FileMap, ProjectMeta } from "./projectTypes";
import * as opfs from "./opfsStore";
import { withSandboxFsGate } from "./sandboxFsGate";

export { defaultCloneProjectName, isOpfsSupported } from "./opfsStore";

async function viaRuntimeOrLocal<T>(
  sandboxId: string | null,
  op: string,
  args: unknown[],
  local: () => Promise<T>
): Promise<T> {
  const exec = async () => {
    const { backendFsOp, isBackendRuntimeLive } = await import("./backendHost");
    if (isBackendRuntimeLive()) {
      return (await backendFsOp(op, args)) as T;
    }
    return local();
  };
  if (!sandboxId) return exec();
  return withSandboxFsGate(sandboxId, exec);
}

export async function readMeta(id: string): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "readMeta", [id], () => opfs.readMeta(id));
}

export async function listProjects(): Promise<ProjectMeta[]> {
  return viaRuntimeOrLocal(null, "listProjects", [], () => opfs.listProjects());
}

export async function createProject(
  name: string,
  files?: FileMap,
  partialMeta?: Partial<ProjectMeta>
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(
    null,
    "createProject",
    [name, files, partialMeta],
    () => opfs.createProject(name, files, partialMeta)
  );
}

export async function cloneProject(
  sourceId: string,
  newName?: string,
  partialMeta?: Partial<ProjectMeta>
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(
    sourceId,
    "cloneProject",
    [sourceId, newName, partialMeta],
    () => opfs.cloneProject(sourceId, newName, partialMeta)
  );
}

export async function deleteProject(id: string): Promise<void> {
  return viaRuntimeOrLocal(id, "deleteProject", [id], () =>
    opfs.deleteProject(id)
  );
}

export async function loadProjectFiles(id: string): Promise<FileMap> {
  return viaRuntimeOrLocal(id, "loadProjectFiles", [id], () =>
    opfs.loadProjectFiles(id)
  );
}

export async function loadFile(
  id: string,
  path: string
): Promise<FileContent | undefined> {
  return viaRuntimeOrLocal(id, "loadFile", [id, path], () =>
    opfs.loadFile(id, path)
  );
}

export async function listProjectDirs(id: string): Promise<string[]> {
  return viaRuntimeOrLocal(id, "listProjectDirs", [id], () =>
    opfs.listProjectDirs(id)
  );
}

export async function createDir(
  id: string,
  path: string
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "createDir", [id, path], () =>
    opfs.createDir(id, path)
  );
}

export async function deleteDir(
  id: string,
  path: string
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "deleteDir", [id, path], () =>
    opfs.deleteDir(id, path)
  );
}

export async function renameDir(
  id: string,
  from: string,
  to: string
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "renameDir", [id, from, to], () =>
    opfs.renameDir(id, from, to)
  );
}

export async function writeFiles(
  id: string,
  files: FileMap
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "writeFiles", [id, files], () =>
    opfs.writeFiles(id, files)
  );
}

export async function saveFile(
  id: string,
  path: string,
  content: FileContent
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "saveFile", [id, path, content], () =>
    opfs.saveFile(id, path, content)
  );
}

export async function writeAllFiles(
  id: string,
  files: FileMap
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "writeAllFiles", [id, files], () =>
    opfs.writeAllFiles(id, files)
  );
}

export async function deleteFile(
  id: string,
  path: string
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "deleteFile", [id, path], () =>
    opfs.deleteFile(id, path)
  );
}

export async function renameFile(
  id: string,
  from: string,
  to: string
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "renameFile", [id, from, to], () =>
    opfs.renameFile(id, from, to)
  );
}

export async function updateProjectMeta(
  id: string,
  patch: Partial<ProjectMeta>
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "updateProjectMeta", [id, patch], () =>
    opfs.updateProjectMeta(id, patch)
  );
}

export async function syncProjectToolMetaFromHead(
  id: string
): Promise<ProjectMeta> {
  return viaRuntimeOrLocal(id, "syncProjectToolMetaFromHead", [id], () =>
    opfs.syncProjectToolMetaFromHead(id)
  );
}
