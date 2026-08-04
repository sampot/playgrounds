import { afterEach, describe, expect, it } from "vitest";
import {
  createSessionBroadcastChannel,
  isSessionEventEnvelope,
  publishSessionEvent,
  sessionChannelName,
  setBroadcastChannelFactory,
} from "./sessionBroadcast";

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

describe("sessionBroadcast", () => {
  afterEach(() => {
    setBroadcastChannelFactory(null);
  });

  it("names channels playgrounds-session:<id>", () => {
    expect(sessionChannelName("abc")).toBe("playgrounds-session:abc");
  });

  it("publishes typed envelopes", () => {
    const channels: MockChannel[] = [];
    setBroadcastChannelFactory(name => {
      const ch = new MockChannel(name);
      channels.push(ch);
      return ch as unknown as BroadcastChannel;
    });
    const ch = createSessionBroadcastChannel("s1");
    publishSessionEvent(ch, {
      type: "session-event",
      sessionId: "s1",
      seq: 3,
      event: { hello: true },
    });
    expect(channels[0]?.posts[0]).toEqual({
      type: "session-event",
      sessionId: "s1",
      seq: 3,
      event: { hello: true },
    });
  });

  it("isSessionEventEnvelope validates shape", () => {
    expect(
      isSessionEventEnvelope({
        type: "session-event",
        sessionId: "s",
        seq: 1,
        event: null,
      })
    ).toBe(true);
    expect(
      isSessionEventEnvelope({ type: "other", sessionId: "s", seq: 1 })
    ).toBe(false);
    expect(isSessionEventEnvelope(null)).toBe(false);
  });
});
