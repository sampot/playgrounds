import { beforeEach, describe, expect, it, vi } from "vitest";
import { operatorCanDirect } from "./boothOperatorShell";

const clientOpts: {
  onRemoteDisabled?: () => void;
  onSnapshot?: (snap: import("@pg/roster/boothChannel").BoothStateSnapshot) => void;
  onHelloOk?: (hello: {
    director?: { shellId: string; role: string } | null;
  }) => void;
  onDirectorChanged?: (next: { shellId: string; role: string } | null) => void;
} = {};

let onProgramStream: ((stream: MediaStream | null) => void) | undefined;
let capturedRtcOpts: {
  localPresence?: { agentId: string; name: string };
  rosterHandlers?: { onChannelOpen?: () => void; onChannelClose?: () => void };
  onOwnerChannel?: (dc: RTCDataChannel) => void;
  sendRoster?: (data: unknown) => void;
  getPc?: () => RTCPeerConnection | null;
} | undefined;

function fakeOwnerDataChannel(): RTCDataChannel {
  return {
    readyState: "open",
    send: vi.fn(),
    bufferedAmount: 0,
    onmessage: null,
    onclose: null,
  } as unknown as RTCDataChannel;
}

function openOperatorRtcChannels(): void {
  capturedRtcOpts?.rosterHandlers?.onChannelOpen?.();
  capturedRtcOpts?.onOwnerChannel?.(fakeOwnerDataChannel());
}

let resolveConnect: (() => void) | null = null;
let connectEntered = false;
let deferConnectResolve = false;

vi.mock("./boothPlatform", () => ({
  createBoothOperatorClient: vi.fn((opts: typeof clientOpts) => {
    Object.assign(clientOpts, opts);
    return {
      connect: async () => {
        connectEntered = true;
        if (!deferConnectResolve) return;
        await new Promise<void>((resolve) => {
          resolveConnect = resolve;
        });
      },
      disconnect: vi.fn(),
      sendIntent: vi.fn(),
      sendSignal: vi.fn(),
    };
  }),
}));

vi.mock("./boothOperatorRtc", () => ({
  createBoothOperatorRtc: vi.fn((opts: {
    onProgramStream: (stream: MediaStream | null) => void;
    localPresence?: { agentId: string; name: string };
    rosterHandlers?: { onChannelOpen?: () => void; onChannelClose?: () => void };
    onOwnerChannel?: (dc: RTCDataChannel) => void;
  }) => {
    onProgramStream = opts.onProgramStream;
    capturedRtcOpts = opts;
    return {
      start: vi.fn(),
      stop: vi.fn(),
      handleSignal: vi.fn(),
      getPc: () => null,
      sendRoster: vi.fn(),
      sendRosterBinary: vi.fn(),
      rosterBufferedAmount: () => 0,
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
    delete clientOpts.onHelloOk;
    delete clientOpts.onDirectorChanged;
    onProgramStream = undefined;
    capturedRtcOpts = undefined;
    resolveConnect = null;
    connectEntered = false;
    deferConnectResolve = false;
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

  it("stays connecting until both WebRTC data channels are open", async () => {
    const { createBoothOperatorShell } = await import("./boothOperatorShell");
    const shell = createBoothOperatorShell({ operatorCap: "cap-test" });
    await shell.connect();
    expect(shell.getStatus().phase).toBe("connecting");
    expect(shell.getStatus().message).toContain("WebRTC");

    capturedRtcOpts?.rosterHandlers?.onChannelOpen?.();
    expect(shell.getStatus().phase).toBe("connecting");

    capturedRtcOpts?.onOwnerChannel?.(fakeOwnerDataChannel());
    expect(shell.getStatus().phase).toBe("open");
  });

  it("stays open when WebRTC channels open before connect() resolves", async () => {
    deferConnectResolve = true;
    const { createBoothOperatorShell } = await import("./boothOperatorShell");
    const shell = createBoothOperatorShell({ operatorCap: "cap-test" });
    const connectPromise = shell.connect();
    expect(connectEntered).toBe(true);
    openOperatorRtcChannels();
    resolveConnect?.();
    await connectPromise;
    expect(shell.getStatus().phase).toBe("open");
    expect(shell.getStatus().message).toContain("遠端");
  });

  it("stays open when hello arrives after WebRTC channels are ready", async () => {
    const { createBoothOperatorShell } = await import("./boothOperatorShell");
    const shell = createBoothOperatorShell({ operatorCap: "cap-test" });
    const connectPromise = shell.connect();
    openOperatorRtcChannels();
    await connectPromise;
    expect(shell.getStatus().phase).toBe("open");

    clientOpts.onHelloOk?.({
      director: { shellId: shell.getShellId(), role: "operator" },
    });
    expect(shell.getStatus().phase).toBe("open");
    expect(shell.getStatus().message).toBe("遠端導播中");
  });

  it("clears the program preview when booth cast goes idle", async () => {
    const { createBoothOperatorShell } = await import("./boothOperatorShell");
    const shell = createBoothOperatorShell({ operatorCap: "cap-test" });
    await shell.connect();
    openOperatorRtcChannels();
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
      cast: { kind: "live", label: "鏡頭" },
    });
    expect(shell.getStatus().tvStream).not.toBeNull();
    clientOpts.onSnapshot?.({
      ...base,
      cast: { kind: "idle" },
    });
    expect(shell.getStatus().tvOn).toBe(false);
    expect(shell.getStatus().tvStream).toBeNull();
  });

  it("passes operator roster localPresence to WebRTC", async () => {
    const { createBoothOperatorShell } = await import("./boothOperatorShell");
    const shell = createBoothOperatorShell({ operatorCap: "cap-test" });
    await shell.connect();
    const shellId = shell.getShellId();
    expect(capturedRtcOpts?.localPresence).toEqual({
      agentId: `op-${shellId}`,
      name: expect.any(String),
    });
    expect(shell.getOperatorPeerId()).toBe(`op-${shellId}`);
  });

  it("toggleCamera updates local presence state", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getVideoTracks: () => [{ kind: "video", stop: vi.fn() }],
          getAudioTracks: () => [],
        }),
      },
    });
    const { createBoothOperatorShell } = await import("./boothOperatorShell");
    const shell = createBoothOperatorShell({ operatorCap: "cap-test" });
    await shell.connect();
    openOperatorRtcChannels();
    const err = await shell.toggleCamera();
    expect(err).toBeNull();
    expect(shell.getStatus().localCamera).toBe(true);
    await shell.toggleCamera();
    expect(shell.getStatus().localCamera).toBe(false);
  });
});
