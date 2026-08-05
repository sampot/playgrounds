import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectMeta } from "./projectTypes";

const listProjects = vi.fn<() => Promise<ProjectMeta[]>>();
const loadFile = vi.fn<(id: string, path: string) => Promise<string | undefined>>();

vi.mock("./sandboxAuthority", () => ({
  listProjects: () => listProjects(),
  loadFile: (id: string, path: string) => loadFile(id, path),
}));

const { probeInstalledSamProtocols, resolveInviteCandidatesWithInstalled } =
  await import("./catalogInviteResolve");

describe("catalogInviteResolve", () => {
  beforeEach(() => {
    listProjects.mockReset();
    loadFile.mockReset();
  });

  it("probes index.html head for session protocols", async () => {
    listProjects.mockResolvedValue([
      {
        id: "a",
        name: "Custom",
        entry: "index.html",
        createdAt: "t",
        updatedAt: "t",
      },
      {
        id: "b",
        name: "Empty",
        entry: "index.html",
        createdAt: "t",
        updatedAt: "t",
      },
    ]);
    loadFile.mockImplementation(async (id: string) => {
      if (id === "a") {
        return `<head><meta name="sam:protocol" content="coding-orchestration.v1@1:worker" /></head>`;
      }
      return `<head><title>Empty</title></head>`;
    });

    const probes = await probeInstalledSamProtocols();
    expect(probes).toEqual([
      {
        sandboxId: "a",
        name: "Custom",
        protocols: [
          {
            protocolId: "coding-orchestration.v1",
            apiVersion: "1",
            roles: ["worker"],
          },
        ],
      },
    ]);
  });

  it("resolveInviteCandidatesWithInstalled includes local-only matches", async () => {
    listProjects.mockResolvedValue([
      {
        id: "local-only",
        name: "Forked worker",
        entry: "index.html",
        createdAt: "t",
        updatedAt: "t",
        source: "acme/forked-worker",
      },
    ]);
    loadFile.mockResolvedValue(
      `<head><meta name="sam:protocol" content="coding-orchestration.v1@1:worker" /></head>`
    );

    const hits = await resolveInviteCandidatesWithInstalled({
      protocolId: "coding-orchestration.v1",
      apiVersion: "1",
      role: "worker",
    });
    expect(hits.some(h => h.sandboxId === "local-only" && h.origin === "installed")).toBe(
      true
    );
    expect(hits.some(h => h.catalogId === "pg-llm-agent")).toBe(true);
  });
});
