import { beforeEach, describe, expect, it, vi } from "vitest";

const chatState = vi.hoisted(() => ({
  attach: vi.fn(),
  detach: vi.fn(),
  onIncoming: vi.fn(),
  setHints: vi.fn(),
  setUiPhase: vi.fn(),
}));

vi.mock("./goSessionChat.svelte", () => ({
  goSessionChat: chatState,
}));

vi.mock("./goRoomFiles.svelte", () => ({
  goRoomFiles: {
    setMirrorEntries: vi.fn(),
    mergeHubShareEntries: vi.fn(),
    sessionFileAttached: vi.fn(() => false),
    attachOperatorRemote: vi.fn(),
    clearOperatorRemote: vi.fn(),
  },
}));

vi.mock("./goRoomPrivateFiles.svelte", () => ({
  goRoomPrivateFiles: {
    attachOperatorMirror: vi.fn(),
    clearMirror: vi.fn(),
    setMirrorEntries: vi.fn(),
  },
}));

vi.mock("./goAuth.svelte", () => ({
  goAuth: { profile: { label: "主持" } },
}));

describe("boothOperatorSurface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches session chat with intent broadcast", async () => {
    const { attachOperatorSurface } = await import("./boothOperatorSurface");
    const sent: unknown[] = [];
    attachOperatorSurface({
      shellId: "op-abc",
      sendIntent: (frame) => {
        sent.push(frame);
      },
    });
    expect(chatState.attach).toHaveBeenCalled();
    const broadcast = chatState.attach.mock.calls[0][0].broadcast as (
      msg: unknown
    ) => void;
    broadcast({ type: "session_chat", v: 1, id: "m1", from: "op-abc", text: "hi" });
    expect(sent[0]).toMatchObject({
      type: "booth.intent.chat.send",
      payload: { message: { text: "hi" } },
    });
  });

  it("clears private mirror when privateFileCount is zero", async () => {
    const { mirrorOperatorPrivateFiles } = await import("./boothOperatorSurface");
    const { goRoomPrivateFiles } = await import("./goRoomPrivateFiles.svelte");
    mirrorOperatorPrivateFiles(undefined, 0);
    expect(goRoomPrivateFiles.setMirrorEntries).toHaveBeenCalledWith([]);
  });

  it("clears share mirror when shareFileCount is zero", async () => {
    const { mirrorOperatorShareFiles } = await import("./boothOperatorSurface");
    const { goRoomFiles } = await import("./goRoomFiles.svelte");
    mirrorOperatorShareFiles(undefined, 0);
    expect(goRoomFiles.setMirrorEntries).toHaveBeenCalledWith([]);
  });

  it("merges hub share snapshot when session_file is attached", async () => {
    const { mirrorOperatorShareFiles } = await import("./boothOperatorSurface");
    const { goRoomFiles } = await import("./goRoomFiles.svelte");
    vi.mocked(goRoomFiles.sessionFileAttached).mockReturnValue(true);
    mirrorOperatorShareFiles(
      [{ id: "f1", name: "clip.mp4", size: 10, status: "ready" }],
      1
    );
    expect(goRoomFiles.mergeHubShareEntries).toHaveBeenCalled();
    expect(goRoomFiles.setMirrorEntries).not.toHaveBeenCalled();
  });
});
