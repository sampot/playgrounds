import { beforeEach, describe, expect, it, vi } from "vitest";

const backendControllerAttach = vi.fn(async (_opts: unknown) => ({
  meta: { name: "remote-meta" },
}));
const backendControllerDetach = vi.fn(async (_id: string) => undefined);
const backendControllerDispatch = vi.fn(
  async (_id: string, _msg: unknown) => undefined
);
const backendControllerCommand = vi.fn(async (_id: string, _cmd: unknown) => ({
  ok: true,
}));
const backendControllerPause = vi.fn(async (_id: string) => undefined);
const backendControllerResume = vi.fn(async (_id: string) => undefined);
const backendControllerSyncFiles = vi.fn(
  async (_id: string, _files: unknown) => undefined
);

vi.mock("./backendHost", () => ({
  backendControllerAttach: (opts: unknown) => backendControllerAttach(opts),
  backendControllerDetach: (id: string) => backendControllerDetach(id),
  backendControllerDispatch: (id: string, msg: unknown) =>
    backendControllerDispatch(id, msg),
  backendControllerCommand: (id: string, cmd: unknown) =>
    backendControllerCommand(id, cmd),
  backendControllerPause: (id: string) => backendControllerPause(id),
  backendControllerResume: (id: string) => backendControllerResume(id),
  backendControllerSyncFiles: (id: string, files: unknown) =>
    backendControllerSyncFiles(id, files),
}));

import { RemoteSamInstance } from "./remoteSamInstance";

describe("RemoteSamInstance", () => {
  beforeEach(() => {
    backendControllerAttach.mockClear();
    backendControllerDetach.mockClear();
    backendControllerDispatch.mockClear();
    backendControllerCommand.mockClear();
    backendControllerPause.mockClear();
    backendControllerResume.mockClear();
    backendControllerSyncFiles.mockClear();
  });

  it("start／stop／command／pause／resume／dispatch go through backendHost", async () => {
    const remote = new RemoteSamInstance({
      id: "agent-1",
      files: { "controller.js": "export default {}" },
      withHost: true,
      activeAgentSandboxId: "agent-1",
    });
    expect(remote.started).toBe(false);
    await remote.start();
    expect(remote.started).toBe(true);
    expect(remote.getMeta().name).toBe("remote-meta");
    expect(backendControllerAttach).toHaveBeenCalledWith({
      sandboxId: "agent-1",
      files: { "controller.js": "export default {}" },
      withHost: true,
      activeAgentSandboxId: "agent-1",
    });

    await remote.start(); // idempotent
    expect(backendControllerAttach).toHaveBeenCalledOnce();

    const cmd = await remote.command({ type: "ping" });
    expect(cmd).toEqual({ ok: true });
    expect(backendControllerCommand).toHaveBeenCalledWith("agent-1", {
      type: "ping",
    });

    await remote.dispatchMessage({
      id: "m1",
      to: "agent-1",
      from: "host",
      type: "system.command",
      payload: {},
      sentAt: 0,
    } as never);
    expect(backendControllerDispatch).toHaveBeenCalledOnce();

    await remote.pauseProcess();
    expect(remote.isPaused()).toBe(true);
    await remote.resumeProcess();
    expect(remote.isPaused()).toBe(false);

    await remote.syncFiles({ "controller.js": "export default { v: 2 }" });
    expect(backendControllerSyncFiles).toHaveBeenCalledWith("agent-1", {
      "controller.js": "export default { v: 2 }",
    });

    await remote.stop();
    expect(remote.started).toBe(false);
    expect(backendControllerDetach).toHaveBeenCalledWith("agent-1");
  });

  it("syncFiles before start only caches files", async () => {
    const remote = new RemoteSamInstance({
      id: "a",
      files: {},
      withHost: false,
      activeAgentSandboxId: null,
    });
    await remote.syncFiles({ "x.js": "1" });
    expect(backendControllerSyncFiles).not.toHaveBeenCalled();
  });
});
