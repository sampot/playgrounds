import { describe, expect, it } from "vitest";
import {
  createSessionId,
  emptySessionsIndex,
  legacySessionMessagesKey,
  migrateLegacyToIndex,
  parseSessionPayload,
  parseSessionsIndex,
  removeSessionFromIndex,
  sessionMessagesKey,
  sessionsIndexKey,
  titleFromMessages,
  upsertSessionMeta,
} from "./agentChatSessions";

describe("agentChatSessions", () => {
  it("builds per-project message keys and empty index", () => {
    const id = createSessionId(1);
    expect(sessionsIndexKey("work-a")).toBe("agent:sessions:work-a:index:v1");
    expect(sessionMessagesKey("work-a", id)).toBe(
      `agent:session:work-a:${id}:v1`
    );
    expect(legacySessionMessagesKey(id)).toBe(`agent:session:${id}:v1`);
    const idx = emptySessionsIndex("2026-01-01T00:00:00.000Z");
    expect(idx.sessions).toHaveLength(1);
    expect(idx.currentId).toBe(idx.sessions[0]!.id);
  });

  it("titles from first user message", () => {
    expect(titleFromMessages([])).toBe("新對話");
    expect(titleFromMessages([{ role: "user", content: "幫我畫一張圖" }])).toBe(
      "幫我畫一張圖"
    );
    expect(
      titleFromMessages([{ role: "user", content: "x".repeat(40) }])
    ).toMatch(/…$/u);
  });

  it("parses index and payload", () => {
    expect(parseSessionsIndex(null)).toBeNull();
    expect(
      parseSessionsIndex({
        currentId: "a",
        sessions: [{ id: "a", title: "A", updatedAt: "t" }],
      })
    ).toEqual({
      currentId: "a",
      sessions: [{ id: "a", title: "A", updatedAt: "t" }],
    });
    expect(
      parseSessionPayload({ messages: [{ role: "user" }] })?.messages
    ).toHaveLength(1);
  });

  it("migrates legacy single session", () => {
    const legacy = JSON.stringify({
      messages: [{ role: "user", content: "舊對話內容很長" }],
    });
    const migrated = migrateLegacyToIndex(legacy, "2026-07-31T00:00:00.000Z");
    expect(migrated).not.toBeNull();
    expect(migrated!.index.sessions[0]!.title).toContain("舊對話");
    expect(migrated!.legacyMessages).toHaveLength(1);
  });

  it("upserts and removes sessions", () => {
    let idx = emptySessionsIndex("2026-01-01T00:00:00.000Z");
    const a = idx.currentId;
    idx = upsertSessionMeta(idx, {
      id: "b",
      title: "B",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(idx.sessions[0]!.id).toBe("b");
    idx = { ...idx, currentId: "b" };
    idx = removeSessionFromIndex(idx, "b", "2026-01-03T00:00:00.000Z");
    expect(idx.sessions.every(s => s.id !== "b")).toBe(true);
    expect(idx.currentId).toBe(a);
  });
});
