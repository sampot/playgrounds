import { describe, expect, it } from "vitest";
import {
  SESSION_CHAT_CTL_TYPE,
  SESSION_CHAT_FLOAT_EMOJIS,
  applyChatReaction,
  buildSessionChatCtlMessage,
  chatReactionRows,
  isSessionChatCtlMessage,
  sessionChatCtlAllowedFromGuest,
} from "./rosterSessionChatCtl";

describe("session_chat_ctl", () => {
  it("accepts react／float／caption／delete／silence／lock from a well-formed frame", () => {
    const react = buildSessionChatCtlMessage({
      op: "react",
      from: "g-a",
      targetId: "m1",
      emoji: "👍",
    });
    expect(isSessionChatCtlMessage(react)).toBe(true);
    expect(react.emoji).toBe("👍");
    expect(react.targetId).toBe("m1");

    expect(
      isSessionChatCtlMessage(
        buildSessionChatCtlMessage({
          op: "float",
          from: "g-a",
          emoji: "🎉",
        })
      )
    ).toBe(true);
    expect(
      isSessionChatCtlMessage(
        buildSessionChatCtlMessage({
          op: "caption",
          from: "host-1",
          text: "推播這句",
        })
      )
    ).toBe(true);
    expect(
      isSessionChatCtlMessage(
        buildSessionChatCtlMessage({
          op: "delete",
          from: "host-1",
          targetId: "m1",
        })
      )
    ).toBe(true);
    expect(
      isSessionChatCtlMessage(
        buildSessionChatCtlMessage({
          op: "silence",
          from: "host-1",
          to: "g-a",
        })
      )
    ).toBe(true);
    expect(
      isSessionChatCtlMessage(
        buildSessionChatCtlMessage({ op: "lock", from: "host-1" })
      )
    ).toBe(true);
  });

  it("rejects unknown emoji, host-only ops from a guest, and chat text frames", () => {
    expect(
      isSessionChatCtlMessage({
        type: SESSION_CHAT_CTL_TYPE,
        v: 1,
        op: "float",
        from: "g-a",
        emoji: "💩",
      })
    ).toBe(false);
    expect(isSessionChatCtlMessage({ type: "session_chat" })).toBe(false);
    expect(
      sessionChatCtlAllowedFromGuest(
        buildSessionChatCtlMessage({
          op: "float",
          from: "g-a",
          emoji: "❤️",
        })
      )
    ).toBe(true);
    expect(
      sessionChatCtlAllowedFromGuest(
        buildSessionChatCtlMessage({
          op: "delete",
          from: "g-a",
          targetId: "m1",
        })
      )
    ).toBe(false);
    expect(SESSION_CHAT_FLOAT_EMOJIS).toEqual(["👍", "❤️", "👏", "🎉", "😂"]);
  });

  it("toggles a per-peer +1 reaction on a message", () => {
    let map = applyChatReaction(
      {},
      { targetId: "m1", emoji: "👍", from: "g-a" }
    );
    map = applyChatReaction(map, { targetId: "m1", emoji: "👍", from: "g-b" });
    expect(chatReactionRows(map, "m1", "g-a")).toEqual([
      { emoji: "👍", count: 2, mine: true },
    ]);
    map = applyChatReaction(map, { targetId: "m1", emoji: "👍", from: "g-a" });
    expect(chatReactionRows(map, "m1", "g-a")).toEqual([
      { emoji: "👍", count: 1, mine: false },
    ]);
  });
});
