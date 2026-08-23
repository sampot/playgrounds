import { beforeEach, describe, expect, it, vi } from "vitest";
import { operatorCanDirect } from "./boothOperatorShell";

const clientOpts: {
  onRemoteDisabled?: () => void;
  onSnapshot?: (snap: import("@pg/roster/boothChannel").BoothStateSnapshot) => void;
} = {};

let onProgramStream: ((stream: MediaStream | null) => void) | undefined;

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
  createBoothOperatorRtc: vi.fn((opts: { onProgramStream: (stream: MediaStream | null) => void }) => {
    onProgramStream = opts.onProgramStream;
    return {
      start: vi.fn(),
      stop: vi.fn(),
      handleSignal: vi.fn(),
    };
  }),
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
    delete clientOpts.onSnapshot;
    onProgramStream = undefined;
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

  it("clears the program preview when booth cast goes idle", async () => {
    const { createBoothOperatorShell } = await import("./boothOperatorShell");
    const shell = createBoothOperatorShell({ operatorCap: "cap-test" });
    await shell.connect();
    const base = {
      sessionId: "sess-1",
      ownerUserId: "u1",
      engineMode: "embedded" as const,
      members: [],
      inviteGate: "none" as const,
      shareFileCount: 0,
      guestCount: 0,
      anchor: "online" as const,
    };
    clientOpts.onSnapshot?.({
      ...base,
      cast: { kind: "live", label: "鏡頭" },
    });
    onProgramStream?.({} as MediaStream);
    expect(shell.getStatus().tvStream).not.toBeNull();
    clientOpts.onSnapshot?.({
      ...base,
      cast: { kind: "idle" },
    });
    expect(shell.getStatus().tvOn).toBe(false);
    expect(shell.getStatus().tvStream).toBeNull();
  });
});
