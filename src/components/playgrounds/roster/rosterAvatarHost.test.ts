import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileMap, ProjectMeta } from "../projectTypes";

const createProject = vi.fn<
  (
    name: string,
    files?: FileMap,
    partialMeta?: Partial<ProjectMeta>
  ) => Promise<ProjectMeta>
>();
const deleteProject = vi.fn<(id: string) => Promise<void>>();

vi.mock("../sandboxAuthority", () => ({
  createProject: (
    name: string,
    files?: FileMap,
    partialMeta?: Partial<ProjectMeta>
  ) => createProject(name, files, partialMeta),
  deleteProject: (id: string) => deleteProject(id),
}));

const {
  ROSTER_AVATAR_SOURCE,
  spawnRosterAvatarProjection,
  teardownRosterAvatarProjection,
} = await import("./rosterAvatarHost");

describe("rosterAvatarHost", () => {
  beforeEach(() => {
    createProject.mockReset();
    deleteProject.mockReset();
  });

  it("spawns agentManaged roster_avatar projection out of working set", async () => {
    createProject.mockResolvedValue({
      id: "sbx-1",
      name: "連線 · Bob",
      entry: "index.html",
      createdAt: "t",
      updatedAt: "t",
      agentManaged: true,
      inWorkingSet: false,
      cloneIntent: "roster_avatar",
      source: ROSTER_AVATAR_SOURCE,
    });

    const result = await spawnRosterAvatarProjection({
      agentId: "bob",
      name: "Bob",
      identiconUrl: "data:image/png;base64,yy",
    });

    expect(result.sandboxId).toBe("sbx-1");
    expect(result.files["index.html"]).toContain("Bob");
    expect(createProject).toHaveBeenCalledOnce();
    const [name, files, meta] = createProject.mock.calls[0]!;
    expect(name).toBe("連線 · Bob");
    expect(files?.["index.html"]).not.toContain("權威");
    expect(files?.["index.html"]).not.toContain("投影 ·");
    expect(files?.["app.js"]).toContain("bob");
    expect(meta).toMatchObject({
      agentManaged: true,
      inWorkingSet: false,
      cloneIntent: "roster_avatar",
      source: ROSTER_AVATAR_SOURCE,
    });
  });

  it("teardown deletes the projection sandbox", async () => {
    deleteProject.mockResolvedValue(undefined);
    await teardownRosterAvatarProjection("sbx-9");
    expect(deleteProject).toHaveBeenCalledWith("sbx-9");
  });
});
