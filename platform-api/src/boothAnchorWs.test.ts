import { describe, expect, it } from "vitest";
import {
  createEmptyAnchorRecord,
  markEngineSocket,
} from "./boothAnchorState.js";
import { handleBoothAnchorWsFrame } from "./boothAnchorWs.js";

describe("handleBoothAnchorWsFrame", () => {
  it("engine heartbeat pongs without snapshot fanout", () => {
    const rec = createEmptyAnchorRecord("u1");
    markEngineSocket(rec, "eng-1", 1000);
    rec.snapshot = { sessionId: "old" };
    const out = handleBoothAnchorWsFrame({
      role: "engine",
      socketId: "eng-1",
      frame: { type: "anchor.heartbeat", guestCount: 2 },
      text: JSON.stringify({ type: "anchor.heartbeat", guestCount: 2 }),
      rec,
      now: 2000,
    });
    expect(out.needsSave).toBe(true);
    expect(out.rec.guestCount).toBe(2);
    expect(out.rec.snapshot).toEqual({ sessionId: "old" });
    expect(out.effects).toEqual([{ type: "pong" }]);
  });

  it("engine heartbeat without guestCount only pongs", () => {
    const rec = createEmptyAnchorRecord("u1");
    const out = handleBoothAnchorWsFrame({
      role: "engine",
      socketId: "eng-1",
      frame: { type: "anchor.heartbeat" },
      text: JSON.stringify({ type: "anchor.heartbeat" }),
      rec,
      now: 1000,
    });
    expect(out.needsSave).toBe(false);
    expect(out.effects).toEqual([{ type: "pong" }]);
  });

  it("caches snapshot when engine publishes booth.state.snapshot", () => {
    const rec = createEmptyAnchorRecord("u1");
    const snapshot = { type: "booth.state.snapshot", v: 1, sessionId: "s1", guestCount: 4 };
    const text = JSON.stringify(snapshot);
    const out = handleBoothAnchorWsFrame({
      role: "engine",
      socketId: "eng-1",
      frame: snapshot,
      text,
      rec,
      now: 1000,
    });
    expect(out.needsSave).toBe(true);
    expect(out.rec.snapshot).toEqual(snapshot);
    expect(out.rec.guestCount).toBe(4);
    expect(out.effects).toEqual([
      { type: "broadcastOperators", text, exceptSocketId: "eng-1" },
    ]);
  });

  it("forwards operator booth frames to engine", () => {
    const rec = createEmptyAnchorRecord("u1");
    const text = JSON.stringify({ type: "booth.hello", v: 1 });
    const out = handleBoothAnchorWsFrame({
      role: "operator",
      socketId: "op-1",
      frame: { type: "booth.hello", v: 1 },
      text,
      rec,
      now: 1000,
    });
    expect(out.effects).toEqual([{ type: "forwardToEngine", text }]);
    expect(out.needsSave).toBe(false);
  });

  it("relays anchor.signal between engine and operators", () => {
    const rec = createEmptyAnchorRecord("u1");
    const text = JSON.stringify({
      type: "anchor.signal",
      v: 1,
      phase: "operator-webrtc",
      op: "offer",
    });
    const engine = handleBoothAnchorWsFrame({
      role: "engine",
      socketId: "eng-1",
      frame: { type: "anchor.signal", v: 1 },
      text,
      rec,
      now: 1000,
    });
    expect(engine.effects).toEqual([
      { type: "broadcastOperators", text, exceptSocketId: "eng-1" },
    ]);

    const operator = handleBoothAnchorWsFrame({
      role: "operator",
      socketId: "op-1",
      frame: { type: "anchor.signal", v: 1 },
      text,
      rec,
      now: 1000,
    });
    expect(operator.effects).toEqual([{ type: "forwardToEngine", text }]);
  });

  it("relays booth.join.answer from engine", () => {
    const rec = createEmptyAnchorRecord("u1");
    const out = handleBoothAnchorWsFrame({
      role: "engine",
      socketId: "eng-1",
      frame: {
        type: "booth.join.answer",
        joinId: "j1",
        answerWire: "ans",
      },
      text: JSON.stringify({
        type: "booth.join.answer",
        joinId: "j1",
        answerWire: "ans",
      }),
      rec,
      now: 1000,
    });
    expect(out.effects).toEqual([
      { type: "boothJoinAnswer", joinId: "j1", answerWire: "ans" },
    ]);
  });

  it("fans out booth.event.remote.disabled to operators", () => {
    const rec = createEmptyAnchorRecord("u1");
    const text = JSON.stringify({
      type: "booth.event.remote.disabled",
      v: 1,
    });
    const out = handleBoothAnchorWsFrame({
      role: "engine",
      socketId: "eng-1",
      frame: { type: "booth.event.remote.disabled", v: 1 },
      text,
      rec,
      now: 1000,
    });
    expect(out.effects).toEqual([
      { type: "broadcastOperators", text, exceptSocketId: "eng-1" },
    ]);
  });
});
