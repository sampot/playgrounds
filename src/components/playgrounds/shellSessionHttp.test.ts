import { describe, expect, it, vi } from "vitest";
import { HostBridgeError } from "./hostBridge";
import {
  handleShellSessionHttp,
  isShellSessionApiPath,
  type ShellSessionHttpHandlers,
} from "./shellSessionHttp";

function handlers(
  partial: Partial<ShellSessionHttpHandlers> = {}
): ShellSessionHttpHandlers {
  return {
    getStatus: async () => ({ active: false, seats: [] }),
    open: async () => ({
      sessionId: "s1",
      channelName: "playgrounds-session:s1",
      protocol: {
        protocolId: "brainstorm.v1",
        apiVersion: "1",
        roles: ["human", "participant"],
      },
    }),
    close: async () => undefined,
    pause: async () => undefined,
    resume: async () => undefined,
    listProjects: async () => [{ id: "p1", name: "Agent" }],
    join: async opts => ({
      seatId: "seat-1",
      role: opts.role,
      sandboxId: opts.sandboxId,
    }),
    leave: async () => undefined,
    spawnParticipant: async () => ({
      sandboxId: "p2",
      seatId: "seat-2",
      role: "participant",
      name: "參與者",
    }),
    ...partial,
  };
}

describe("shellSessionHttp", () => {
  it("matches shell session API paths", () => {
    expect(isShellSessionApiPath("/api/shell/session/status")).toBe(true);
    expect(isShellSessionApiPath("/api/shell/session/open/")).toBe(true);
    expect(
      isShellSessionApiPath(
        "/playgrounds/canvas/proj-1/api/shell/session/status"
      )
    ).toBe(true);
    expect(isShellSessionApiPath("/api/session/open")).toBe(false);
  });

  it("opens and returns status", async () => {
    const open = vi.fn(handlers().open);
    const res = await handleShellSessionHttp(
      new Request("https://h.local/api/shell/session/open", { method: "POST" }),
      handlers({ open })
    );
    expect(res.status).toBe(200);
    expect(open).toHaveBeenCalled();
    const body = await res.json();
    expect(body.sessionId).toBe("s1");
  });

  it("handles canvas-scoped /api/shell/session URLs", async () => {
    const res = await handleShellSessionHttp(
      new Request(
        "https://h.local/playgrounds/canvas/abc/api/shell/session/status",
        { method: "GET" }
      ),
      handlers()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
  });

  it("maps HostBridgeError to machine-readable JSON", async () => {
    const res = await handleShellSessionHttp(
      new Request("https://h.local/api/shell/session/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sandboxId: "p",
          role: "participant",
          protocolId: "x",
          apiVersion: "1",
        }),
      }),
      handlers({
        join: async () => {
          throw new HostBridgeError("protocol_mismatch", "不相容");
        },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("protocol_mismatch");
  });

  it("spawns a participant", async () => {
    const res = await handleShellSessionHttp(
      new Request("https://h.local/api/shell/session/spawn-participant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "participant" }),
      }),
      handlers()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.seatId).toBe("seat-2");
  });
});
