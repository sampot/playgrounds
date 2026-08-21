import { describe, expect, it } from "vitest";
import {
  SESSION_CHAT_MAX_TEXT_CHARS,
  SESSION_CHAT_TYPE,
  SESSION_CHAT_HINTS_TYPE,
  SESSION_CHAT_DEFAULT_QUICK_REPLIES,
  broadcastSessionChat,
  buildSessionChatMessage,
  formatSessionChatToast,
  isSessionChatMessage,
  normalizeSessionChatText,
  parseSessionChatHintsMessage,
  resolveSessionChatFreeText,
  resolveSessionChatQuickReplies,
  sessionChatPhaseFromEvent,
  type SessionChatMsg,
  type SessionChatSendTarget,
} from "./rosterSessionChat";

describe("isSessionChatMessage", () => {
  const valid: SessionChatMsg = {
    type: "session_chat",
    id: "id-1",
    from: "agent-a",
    text: "hi",
    ts: 1,
    v: 1,
  };

  it("accepts a well-formed v1 message", () => {
    expect(isSessionChatMessage(valid)).toBe(true);
    expect(isSessionChatMessage({ ...valid, name: "小明" })).toBe(true);
  });

  it("rejects presence, avatar_relay, and malformed chat", () => {
    expect(
      isSessionChatMessage({
        type: "presence",
        agentId: "a",
        name: "A",
      })
    ).toBe(false);
    expect(
      isSessionChatMessage({
        type: "avatar_relay",
        from: "a",
        payload: { kind: "ping" },
      })
    ).toBe(false);
    expect(isSessionChatMessage({ ...valid, type: "session_chat_v2" })).toBe(
      false
    );
    expect(isSessionChatMessage({ ...valid, v: 2 })).toBe(false);
    expect(isSessionChatMessage({ ...valid, text: "" })).toBe(false);
    expect(isSessionChatMessage({ ...valid, id: 1 })).toBe(false);
  });
});

describe("normalizeSessionChatText", () => {
  it("trims and accepts non-empty text within limit", () => {
    expect(normalizeSessionChatText("  hello  ")).toBe("hello");
  });

  it("rejects blank and over-long text", () => {
    expect(normalizeSessionChatText("   ")).toBeNull();
    expect(normalizeSessionChatText("")).toBeNull();
    const long = "あ".repeat(SESSION_CHAT_MAX_TEXT_CHARS + 1);
    expect(normalizeSessionChatText(long)).toBeNull();
    expect(
      normalizeSessionChatText("あ".repeat(SESSION_CHAT_MAX_TEXT_CHARS))
    ).toBe("あ".repeat(SESSION_CHAT_MAX_TEXT_CHARS));
  });
});

describe("buildSessionChatMessage", () => {
  it("builds a valid message or returns null for bad text", () => {
    const msg = buildSessionChatMessage({
      from: "a1",
      name: "A",
      text: "  yo  ",
      id: "fixed-id",
      ts: 42,
    });
    expect(msg).toEqual({
      type: SESSION_CHAT_TYPE,
      id: "fixed-id",
      from: "a1",
      name: "A",
      text: "yo",
      ts: 42,
      v: 1,
    });
    expect(buildSessionChatMessage({ from: "a1", text: "  " })).toBeNull();
  });
});

describe("broadcastSessionChat", () => {
  it("sends the same payload to every peer target", () => {
    const sent: unknown[][] = [[], []];
    const peers: SessionChatSendTarget[] = [
      { send: (d) => sent[0]!.push(d) },
      { send: (d) => sent[1]!.push(d) },
    ];
    const msg = buildSessionChatMessage({
      from: "host",
      text: "hi all",
      id: "b1",
      ts: 1,
    })!;
    const n = broadcastSessionChat(peers, msg);
    expect(n).toBe(2);
    expect(sent[0]).toEqual([msg]);
    expect(sent[1]).toEqual([msg]);
  });

  it("skips targets that throw and still fans out to others", () => {
    const ok: unknown[] = [];
    const peers: SessionChatSendTarget[] = [
      {
        send: () => {
          throw new Error("closed");
        },
      },
      { send: (d) => ok.push(d) },
    ];
    const msg = buildSessionChatMessage({
      from: "a",
      text: "x",
      id: "b2",
      ts: 1,
    })!;
    expect(broadcastSessionChat(peers, msg)).toBe(1);
    expect(ok).toEqual([msg]);
  });
});

describe("formatSessionChatToast", () => {
  it("shows full short text and truncates long text", () => {
    expect(
      formatSessionChatToast({
        type: "session_chat",
        id: "1",
        from: "a",
        name: "小明",
        text: "你好",
        ts: 1,
        v: 1,
      })
    ).toBe("小明：你好");
    const long = "字".repeat(50);
    const toast = formatSessionChatToast({
      type: "session_chat",
      id: "2",
      from: "a",
      name: "小明",
      text: long,
      ts: 1,
      v: 1,
    });
    expect(toast.startsWith("小明：")).toBe(true);
    expect(toast.endsWith("……")).toBe(true);
    expect(toast.length).toBeLessThan(long.length + 10);
  });

  it("falls back to 對手 when name missing", () => {
    expect(
      formatSessionChatToast({
        type: "session_chat",
        id: "1",
        from: "a",
        text: "hi",
        ts: 1,
        v: 1,
      })
    ).toBe("對手：hi");
  });

  it("labels Host toasts as 主持", () => {
    expect(
      formatSessionChatToast({
        type: "session_chat",
        id: "1",
        from: "h",
        name: "玩家 A",
        role: "host",
        text: "開局",
        ts: 1,
        v: 1,
      })
    ).toBe("主持：開局");
    expect(
      formatSessionChatToast({
        type: "session_chat",
        id: "2",
        from: "h",
        name: "主持",
        text: "嗨",
        ts: 1,
        v: 1,
      })
    ).toBe("主持：嗨");
  });
});

describe("resolveSessionChatFreeText", () => {
  it("defaults to allow; only active respects freeText:false", () => {
    expect(resolveSessionChatFreeText(undefined, "waiting")).toBe(true);
    expect(resolveSessionChatFreeText({}, "active")).toBe(true);
    expect(
      resolveSessionChatFreeText({ freeText: false }, "active")
    ).toBe(false);
    expect(
      resolveSessionChatFreeText({ freeText: false }, "waiting")
    ).toBe(true);
    expect(
      resolveSessionChatFreeText({ freeText: false }, "ready")
    ).toBe(true);
    expect(
      resolveSessionChatFreeText({ freeText: true }, "active")
    ).toBe(true);
  });
});

describe("resolveSessionChatQuickReplies", () => {
  it("uses defaults when unset; empty overrides; list replaces", () => {
    expect(resolveSessionChatQuickReplies(undefined)).toEqual([
      ...SESSION_CHAT_DEFAULT_QUICK_REPLIES,
    ]);
    expect(resolveSessionChatQuickReplies({})).toEqual([
      ...SESSION_CHAT_DEFAULT_QUICK_REPLIES,
    ]);
    expect(resolveSessionChatQuickReplies({ quickReplies: [] })).toEqual([]);
    expect(
      resolveSessionChatQuickReplies({ quickReplies: [" 嗨 ", "", "走"] })
    ).toEqual(["嗨", "走"]);
  });
});

describe("parseSessionChatHintsMessage", () => {
  it("parses flat and nested hints envelopes", () => {
    expect(parseSessionChatHintsMessage({ type: "nope" })).toBeNull();
    expect(
      parseSessionChatHintsMessage({
        type: SESSION_CHAT_HINTS_TYPE,
        freeText: false,
        quickReplies: ["A"],
      })
    ).toEqual({ freeText: false, quickReplies: ["A"] });
    expect(
      parseSessionChatHintsMessage({
        type: SESSION_CHAT_HINTS_TYPE,
        hints: { freeText: true, quickReplies: ["B"] },
      })
    ).toEqual({ freeText: true, quickReplies: ["B"] });
  });
});

describe("sessionChatPhaseFromEvent", () => {
  it("reads status from event or nested state", () => {
    expect(sessionChatPhaseFromEvent({ status: "active" })).toBe("active");
    expect(
      sessionChatPhaseFromEvent({ state: { status: "waiting" } })
    ).toBe("waiting");
    expect(sessionChatPhaseFromEvent({ type: "move" })).toBeNull();
  });

  it("maps match lifecycle types when status is omitted", () => {
    expect(sessionChatPhaseFromEvent({ type: "match.started" })).toBe(
      "active"
    );
    expect(sessionChatPhaseFromEvent({ type: "match.placed" })).toBe("active");
    expect(sessionChatPhaseFromEvent({ type: "match.closed" })).toBe("ended");
  });
});
