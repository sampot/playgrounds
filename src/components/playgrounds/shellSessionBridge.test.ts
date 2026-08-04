import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRAINSTORM_PROTOCOL_ID,
  brainstormSessionFetch,
  type BrainstormSessionEnv,
} from "./brainstormSessionApi";
import { createFunctionsEnv } from "./functionsEnv";
import { clearMockKvStore } from "./mockKv";
import { setBroadcastChannelFactory } from "./sessionBroadcast";
import { SessionBridgeError } from "./sessionBridge";
import { SessionRuntime } from "./sessionRuntime";

vi.mock("./backendHost", () => ({
  backendRuntimeFunctionsFetch: async (opts: {
    sandboxId: string;
    files: Record<string, unknown>;
    request: Request;
  }) => {
    const env = createFunctionsEnv(opts.sandboxId, { files: opts.files });
    return brainstormSessionFetch(
      opts.request,
      env as unknown as BrainstormSessionEnv
    );
  },
}));

const {
  createShellSessionBridge,
  fetchHostSessionMeta,
  invalidateHostSessionModuleCache,
  notifyHostSessionOpen,
} = await import("./shellSessionBridge");

class MockChannel {
  readonly name: string;
  readonly posts: unknown[] = [];
  constructor(name: string) {
    this.name = name;
  }
  postMessage(data: unknown) {
    this.posts.push(data);
  }
  close() {}
}

const HOST_ID = "shell-session-host";
const hostFiles = { "functions.js": "// mocked via loadFunctionsModule" };

describe("shellSessionBridge (Host fetch mocked)", () => {
  const channels: MockChannel[] = [];

  afterEach(async () => {
    setBroadcastChannelFactory(null);
    channels.length = 0;
    invalidateHostSessionModuleCache();
    await clearMockKvStore(HOST_ID);
  });

  function setupBc() {
    setBroadcastChannelFactory(name => {
      const ch = new MockChannel(name);
      channels.push(ch);
      return ch as unknown as BroadcastChannel;
    });
  }

  it("reads meta from Host session API", async () => {
    const meta = await fetchHostSessionMeta(HOST_ID, () => hostFiles);
    expect(meta.protocolId).toBe(BRAINSTORM_PROTOCOL_ID);
    expect(meta.apiVersion).toBe("1");
    expect(meta.roles).toContain("participant");
  });

  it("act after notifyHostSessionOpen publishes BroadcastChannel events", async () => {
    setupBc();
    const rt = new SessionRuntime();
    const meta = await fetchHostSessionMeta(HOST_ID, () => hostFiles);
    const session = rt.open(HOST_ID, meta);
    await notifyHostSessionOpen(
      HOST_ID,
      () => hostFiles,
      session.sessionId,
      session.channelName
    );

    const seat = rt.joinAgent({
      sandboxId: "participant-1",
      role: "participant",
      protocolId: meta.protocolId,
      apiVersion: meta.apiVersion,
    });

    const bridge = createShellSessionBridge({
      runtime: rt,
      seatId: seat.seatId,
      sandboxId: "participant-1",
      getHostFiles: () => hostFiles,
      onLeaveSeat: id => rt.leaveSeat(id),
    });

    const seatInfo = await bridge.getSeat();
    expect(seatInfo.role).toBe("participant");
    expect(seatInfo.hostSandboxId).toBe(HOST_ID);

    const channel = await bridge.getEventChannel();
    expect(channel.name).toBe(session.channelName);

    const result = (await bridge.act({ text: "from agent" })) as {
      ok?: boolean;
    };
    expect(result.ok).toBe(true);

    const state = (await bridge.getState()) as {
      items: { text: string; role: string }[];
    };
    expect(state.items).toEqual([
      expect.objectContaining({ text: "from agent", role: "participant" }),
    ]);

    expect(channels[0]?.posts.length).toBeGreaterThanOrEqual(1);
    expect(channels[0]?.posts[0]).toMatchObject({
      type: "session-event",
      sessionId: session.sessionId,
    });

    await bridge.leave();
    expect(rt.listSeats()).toHaveLength(0);
  });

  it("act before Host open surfaces session_inactive", async () => {
    setupBc();
    const rt = new SessionRuntime();
    const meta = await fetchHostSessionMeta(HOST_ID, () => hostFiles);
    rt.open(HOST_ID, meta);
    const seat = rt.joinAgent({
      sandboxId: "participant-1",
      role: "participant",
      protocolId: meta.protocolId,
      apiVersion: meta.apiVersion,
    });
    const bridge = createShellSessionBridge({
      runtime: rt,
      seatId: seat.seatId,
      sandboxId: "participant-1",
      getHostFiles: () => hostFiles,
      onLeaveSeat: () => {},
    });
    try {
      await bridge.act({ text: "x" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SessionBridgeError);
      expect((e as SessionBridgeError).code).toBe("session_inactive");
    }
  });
});
