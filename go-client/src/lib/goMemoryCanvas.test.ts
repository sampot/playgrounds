import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GO_MEMORY_BC_TYPE,
  publishGoMemoryBroadcast,
  setGoMemoryCanvasWindow,
} from "./goMemoryCanvas";

afterEach(() => {
  setGoMemoryCanvasWindow(null);
});

describe("publishGoMemoryBroadcast", () => {
  it("posts to the registered memory canvas window", () => {
    const postMessage = vi.fn();
    setGoMemoryCanvasWindow({ postMessage } as unknown as Window);
    publishGoMemoryBroadcast("playgrounds-session:sess-1", {
      type: "session-event",
      sessionId: "sess-1",
      seq: 1,
      event: { type: "match.placed", row: 1, col: 2 },
    });
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: GO_MEMORY_BC_TYPE,
        name: "playgrounds-session:sess-1",
        payload: {
          type: "session-event",
          sessionId: "sess-1",
          seq: 1,
          event: { type: "match.placed", row: 1, col: 2 },
        },
      },
      "*"
    );
  });

  it("queues posts until the memory canvas window binds", () => {
    const postMessage = vi.fn();
    setGoMemoryCanvasWindow(null);
    publishGoMemoryBroadcast("playgrounds-session:sess-1", {
      type: "session-event",
      sessionId: "sess-1",
      seq: 1,
      event: { type: "match.started" },
    });
    expect(postMessage).not.toHaveBeenCalled();
    setGoMemoryCanvasWindow({ postMessage } as unknown as Window);
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: GO_MEMORY_BC_TYPE,
        name: "playgrounds-session:sess-1",
        payload: {
          type: "session-event",
          sessionId: "sess-1",
          seq: 1,
          event: { type: "match.started" },
        },
      },
      "*"
    );
  });
});
