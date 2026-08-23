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
    clearMirrorEntries: vi.fn(),
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
});
