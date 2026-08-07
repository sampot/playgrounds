import { describe, expect, it, vi } from "vitest";
import type { SessionInvitePayload } from "./rosterSessionBridge";
import {
  materializeRosterInviteSeat,
  RosterInviteMaterializeError,
} from "./rosterInviteSeatMaterialize";

function invite(
  overrides: Partial<SessionInvitePayload> = {}
): SessionInvitePayload {
  return {
    kind: "session_invite",
    inviteId: "inv-1",
    sessionId: "sess-1",
    role: "participant",
    protocol: {
      protocolId: "brainstorm.v1",
      apiVersion: "1",
      roles: ["human", "participant"],
    },
    ...overrides,
  };
}

describe("materializeRosterInviteSeat", () => {
  it("reuses preferReuseSandboxId without cloning", async () => {
    const cloneProject = vi.fn();
    const result = await materializeRosterInviteSeat(
      invite({
        role: "player",
        source: "sampot/pg-gomoku",
        protocol: {
          protocolId: "gomoku.v1",
          apiVersion: "1",
          roles: ["host", "player"],
        },
      }),
      {
        resolve: async () => [],
        preferReuseSandboxId: "work-canvas-1",
        cloneProject: cloneProject as never,
        createProject: vi.fn() as never,
        fetchGithub: vi.fn() as never,
      }
    );
    expect(result.sandboxId).toBe("work-canvas-1");
    expect(result.via).toBe("installed");
    expect(cloneProject).not.toHaveBeenCalled();
  });

  it("clones installed candidate", async () => {
    const cloneProject = vi.fn(async () => ({
      id: "clone-1",
      name: "cloned",
    }));
    const result = await materializeRosterInviteSeat(invite(), {
      resolve: async () => [
        {
          sandboxId: "local-1",
          title: "Local SAM",
          origin: "installed",
        },
      ],
      cloneProject: cloneProject as never,
      createProject: vi.fn() as never,
      fetchGithub: vi.fn() as never,
    });
    expect(result).toEqual({
      sandboxId: "clone-1",
      name: "cloned",
      via: "installed",
    });
    expect(cloneProject).toHaveBeenCalledWith(
      "local-1",
      expect.stringContaining("對弈"),
      expect.objectContaining({ cloneIntent: "session_seat" })
    );
  });

  it("lazy-installs from catalog GitHub source", async () => {
    const createProject = vi.fn(async () => ({
      id: "new-1",
      name: "Coding Agent · 對弈",
    }));
    const fetchGithub = vi.fn(async () => ({ "index.html": "<html></html>" }));
    const result = await materializeRosterInviteSeat(
      invite({
        role: "worker",
        protocol: {
          protocolId: "coding-orchestration.v1",
          apiVersion: "1",
          roles: ["host", "worker"],
        },
        catalogId: "pg-llm-agent",
      }),
      {
        resolve: async () => [
          {
            catalogId: "pg-llm-agent",
            title: "Coding Agent",
            source: "sampot/pg-llm-agent",
            origin: "catalog",
          },
        ],
        createProject: createProject as never,
        fetchGithub: fetchGithub as never,
        parseGithub: () => ({ owner: "sampot", repo: "pg-llm-agent" }),
      }
    );
    expect(result.via).toBe("catalog");
    expect(result.sandboxId).toBe("new-1");
    expect(fetchGithub).toHaveBeenCalledWith({
      owner: "sampot",
      repo: "pg-llm-agent",
    });
    expect(createProject).toHaveBeenCalledWith(
      expect.stringContaining("Coding Agent"),
      { "index.html": "<html></html>" },
      expect.objectContaining({
        source: "sampot/pg-llm-agent",
        cloneIntent: "session_seat",
      })
    );
  });

  it("uses brainstorm builtin when no candidates", async () => {
    const createProject = vi.fn(async (_n, _f, opts) => ({
      id: "builtin-1",
      name: "對弈 · participant",
      ...opts,
    }));
    const result = await materializeRosterInviteSeat(invite(), {
      resolve: async () => [],
      createProject: createProject as never,
      fetchGithub: vi.fn() as never,
    });
    expect(result.via).toBe("builtin");
    expect(createProject).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ "index.html": expect.any(String) }),
      expect.objectContaining({
        source: "playgrounds-roster-session-seat",
      })
    );
  });

  it("rejects non-brainstorm with no candidates", async () => {
    await expect(
      materializeRosterInviteSeat(
        invite({
          role: "worker",
          protocol: {
            protocolId: "coding-orchestration.v1",
            apiVersion: "1",
            roles: ["worker"],
          },
        }),
        {
          resolve: async () => [],
          createProject: vi.fn() as never,
        }
      )
    ).rejects.toMatchObject({
      code: "no_candidate",
    } satisfies Partial<RosterInviteMaterializeError>);
  });

  it("wraps GitHub fetch failures", async () => {
    await expect(
      materializeRosterInviteSeat(
        invite({
          role: "worker",
          protocol: {
            protocolId: "coding-orchestration.v1",
            apiVersion: "1",
            roles: ["worker"],
          },
        }),
        {
          resolve: async () => [
            {
              catalogId: "pg-llm-agent",
              title: "Coding Agent",
              source: "sampot/pg-llm-agent",
              origin: "catalog",
            },
          ],
          fetchGithub: async () => {
            throw new Error("rate limit");
          },
          parseGithub: () => ({ owner: "sampot", repo: "pg-llm-agent" }),
        }
      )
    ).rejects.toMatchObject({
      code: "install_failed",
      message: expect.stringContaining("rate limit"),
    });
  });
});
