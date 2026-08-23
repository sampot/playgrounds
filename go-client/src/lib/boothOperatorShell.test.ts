import { beforeEach, describe, expect, it, vi } from "vitest";
import { operatorCanDirect } from "./boothOperatorShell";

const clientOpts: {
  onRemoteDisabled?: () => void;
} = {};

vi.mock("./boothPlatform", () => ({
  createBoothOperatorClient: vi.fn((opts: typeof clientOpts) => {
    Object.assign(clientOpts, opts);
    return {
      connect: async () => {},
      disconnect: vi.fn(),
      sendIntent: vi.fn(),
      sendSignal: vi.fn(),
    };
  }),
}));

vi.mock("./boothOperatorRtc", () => ({
  createBoothOperatorRtc: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    handleSignal: vi.fn(),
  })),
}));

describe("operatorCanDirect", () => {
  it("is true when director lock matches shell", () => {
    expect(
      operatorCanDirect({
        shellId: "op-abc",
        director: { shellId: "op-abc", role: "operator" },
      })
    ).toBe(true);
  });

  it("is false when another shell holds director", () => {
    expect(
      operatorCanDirect({
        shellId: "op-abc",
        director: { shellId: "op-other", role: "operator" },
      })
    ).toBe(false);
  });
});

describe("createBoothOperatorShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete clientOpts.onRemoteDisabled;
  });

  it("surfaces remote disabled as plain-language error", async () => {
    const { createBoothOperatorShell } = await import("./boothOperatorShell");
    const shell = createBoothOperatorShell({ operatorCap: "cap-test" });
    await shell.connect();
    clientOpts.onRemoteDisabled?.();
    expect(shell.getStatus().phase).toBe("error");
    expect(shell.getStatus().error).toContain("遠端連回");
    expect(shell.getStatus().error).not.toMatch(/remote_disabled/i);
  });
});
