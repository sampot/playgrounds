import { describe, expect, it } from "vitest";
import { CODING_ORCH_PROTOCOL_ID } from "./codingOrchestrationApi";
import {
  codingOrchEnsureAction,
  parseCodingOrchBind,
  serializeCodingOrchBind,
  type CodingOrchBind,
} from "./codingOrchestrationBind";

const bind = (over: Partial<CodingOrchBind> = {}): CodingOrchBind => ({
  chatSessionId: "chat-a",
  sessionId: "sess-1",
  channelName: "ch-1",
  protocolId: CODING_ORCH_PROTOCOL_ID,
  ...over,
});

describe("codingOrchEnsureAction", () => {
  it("opens when no active session", () => {
    expect(
      codingOrchEnsureAction({
        chatSessionId: "chat-a",
        activeSessionId: null,
        bind: null,
      })
    ).toBe("open");
  });

  it("reuses matching bind", () => {
    expect(
      codingOrchEnsureAction({
        chatSessionId: "chat-a",
        activeSessionId: "sess-1",
        bind: bind(),
      })
    ).toBe("reuse");
  });

  it("reopens when chat changes", () => {
    expect(
      codingOrchEnsureAction({
        chatSessionId: "chat-b",
        activeSessionId: "sess-1",
        bind: bind(),
      })
    ).toBe("reopen");
  });

  it("reopens when bind sessionId is stale", () => {
    expect(
      codingOrchEnsureAction({
        chatSessionId: "chat-a",
        activeSessionId: "sess-2",
        bind: bind(),
      })
    ).toBe("reopen");
  });
});

describe("parseCodingOrchBind", () => {
  it("round-trips serialize", () => {
    const raw = serializeCodingOrchBind(bind());
    expect(parseCodingOrchBind(raw)).toEqual(bind());
  });

  it("rejects garbage", () => {
    expect(parseCodingOrchBind("")).toBeNull();
    expect(parseCodingOrchBind("{")).toBeNull();
    expect(
      parseCodingOrchBind(JSON.stringify({ chatSessionId: "x" }))
    ).toBeNull();
  });
});
