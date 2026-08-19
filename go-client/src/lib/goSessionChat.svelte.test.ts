import { describe, expect, it, beforeEach } from "vitest";
import { goSessionChat } from "./goSessionChat.svelte";
import type { SessionChatMsg } from "@pg/roster/rosterSessionChat";

describe("goSessionChat", () => {
  beforeEach(() => {
    goSessionChat.detach();
  });

  it("attaches, sends fanout, and optimism-inserts local", () => {
    const sent: SessionChatMsg[] = [];
    goSessionChat.attach({
      localAgentId: "me",
      localName: "我",
      peers: [],
      broadcast: (msg) => {
        sent.push(msg);
        return 1;
      },
    });
    expect(goSessionChat.connected).toBe(true);
    expect(goSessionChat.sendText("  哈囉  ")).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toBe("哈囉");
    expect(sent[0]!.from).toBe("me");
    expect(goSessionChat.messages).toHaveLength(1);
    expect(goSessionChat.messages[0]!.local).toBe(true);
  });

  it("rejects blank and detached send", () => {
    expect(goSessionChat.sendText("hi")).toBe(false);
    goSessionChat.attach({
      localAgentId: "me",
      peers: [{ send: () => {} }],
    });
    expect(goSessionChat.sendText("   ")).toBe(false);
  });

  it("increments unread for remote when panel closed; clears when open", () => {
    goSessionChat.attach({
      localAgentId: "me",
      peers: [{ send: () => {} }],
    });
    const toast = goSessionChat.onIncoming({
      type: "session_chat",
      id: "r1",
      from: "them",
      name: "對手甲",
      text: "你好",
      ts: 1,
      v: 1,
    });
    expect(toast).toBe("對手甲：你好");
    expect(goSessionChat.unread).toBe(1);
    expect(goSessionChat.messages).toHaveLength(1);

    goSessionChat.setPanelOpen(true);
    expect(goSessionChat.unread).toBe(0);
    expect(
      goSessionChat.onIncoming({
        type: "session_chat",
        id: "r2",
        from: "them",
        text: "再來",
        ts: 2,
        v: 1,
      })
    ).toBeNull();
    expect(goSessionChat.unread).toBe(0);
    expect(goSessionChat.messages).toHaveLength(2);
  });

  it("dedupes by id and ignores echo from local agent", () => {
    goSessionChat.attach({
      localAgentId: "me",
      peers: [{ send: () => {} }],
    });
    const raw = {
      type: "session_chat",
      id: "dup",
      from: "them",
      text: "x",
      ts: 1,
      v: 1,
    };
    goSessionChat.onIncoming(raw);
    goSessionChat.onIncoming(raw);
    expect(goSessionChat.messages).toHaveLength(1);
    goSessionChat.onIncoming({ ...raw, id: "echo", from: "me" });
    expect(goSessionChat.messages).toHaveLength(1);
  });

  it("page layout skips unread toasts and resets on detach", () => {
    goSessionChat.attach({
      localAgentId: "me",
      peers: [{ send: () => {} }],
      layout: "page",
    });
    expect(goSessionChat.layout).toBe("page");
    expect(
      goSessionChat.onIncoming({
        type: "session_chat",
        id: "p1",
        from: "them",
        text: "在嗎",
        ts: 1,
        v: 1,
      })
    ).toBeNull();
    expect(goSessionChat.unread).toBe(0);
    goSessionChat.detach();
    expect(goSessionChat.layout).toBe("rail");
  });

  it("detaches clears timeline and connected", () => {
    goSessionChat.attach({
      localAgentId: "me",
      peers: [{ send: () => {} }],
    });
    goSessionChat.sendText("a");
    goSessionChat.detach();
    expect(goSessionChat.connected).toBe(false);
    expect(goSessionChat.messages).toEqual([]);
    expect(goSessionChat.unread).toBe(0);
  });

  it("honors freeText:false only in active phase", () => {
    const sent: unknown[] = [];
    goSessionChat.attach({
      localAgentId: "me",
      peers: [],
      broadcast: (m) => {
        sent.push(m);
        return 1;
      },
    });
    goSessionChat.setHints({ freeText: false });
    goSessionChat.setUiPhase("waiting");
    expect(goSessionChat.freeTextAllowed).toBe(true);
    expect(goSessionChat.sendText("wait ok")).toBe(true);
    goSessionChat.setUiPhase("active");
    expect(goSessionChat.freeTextAllowed).toBe(false);
    expect(goSessionChat.sendText("blocked")).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("sendQuickReply bypasses freeText gate", () => {
    const sent: unknown[] = [];
    goSessionChat.attach({
      localAgentId: "me",
      peers: [],
      broadcast: (m) => {
        sent.push(m);
        return 1;
      },
    });
    goSessionChat.setHints({ freeText: false });
    goSessionChat.setUiPhase("active");
    expect(goSessionChat.sendText("no")).toBe(false);
    expect(goSessionChat.sendQuickReply("加油")).toBe(true);
    expect(sent).toHaveLength(1);
    expect((sent[0] as { text: string }).text).toBe("加油");
  });

  it("Host attach stamps role=host on outbound messages", () => {
    const sent: { role?: string; name?: string }[] = [];
    goSessionChat.attach({
      localAgentId: "host-1",
      localName: "主持",
      localRole: "host",
      peers: [],
      broadcast: (m) => {
        sent.push(m);
        return 1;
      },
    });
    expect(goSessionChat.sendText("開局囉")).toBe(true);
    expect(sent[0]).toMatchObject({ role: "host", name: "主持" });
  });

  it("exposes default quick replies until hints override", () => {
    goSessionChat.attach({
      localAgentId: "me",
      peers: [{ send: () => {} }],
    });
    expect(goSessionChat.quickReplies.length).toBeGreaterThanOrEqual(3);
    goSessionChat.setHints({ quickReplies: [] });
    expect(goSessionChat.quickReplies).toEqual([]);
  });

  it("merges local system notes into the page feed without unread", () => {
    goSessionChat.attach({
      localAgentId: "me",
      layout: "page",
      peers: [{ send: () => {} }],
    });
    expect(
      goSessionChat.noteSystem({
        id: "sys-join-1",
        ts: 1,
        tone: "presence",
        text: "張三 已加入包廂",
      })
    ).toBe(true);
    expect(goSessionChat.unread).toBe(0);
    expect(goSessionChat.feed).toEqual([
      expect.objectContaining({
        kind: "system",
        id: "sys-join-1",
      }),
    ]);
    goSessionChat.sendText("hi");
    expect(goSessionChat.feed.map((row) => row.kind)).toEqual(["system", "chat"]);
    goSessionChat.noteSystem({
      id: "sys-join-1",
      ts: 2,
      tone: "presence",
      text: "張三 已加入包廂",
    });
    expect(goSessionChat.feed.filter((row) => row.id === "sys-join-1")).toHaveLength(
      1
    );
  });

  it("fans out a +1 reaction and a TV float", () => {
    const sent: unknown[] = [];
    goSessionChat.attach({
      localAgentId: "me",
      layout: "page",
      peers: [],
      broadcast: (msg) => {
        sent.push(msg);
        return 1;
      },
    });
    goSessionChat.sendText("hi");
    const mid = goSessionChat.messages[0]!.id;
    expect(goSessionChat.react(mid, "👍")).toBe(true);
    expect(goSessionChat.reactionRows(mid)).toEqual([
      { emoji: "👍", count: 1, mine: true },
    ]);
    expect(goSessionChat.react(mid, "👍")).toBe(true);
    expect(goSessionChat.reactionRows(mid)).toEqual([]);
    expect(goSessionChat.floatEmoji("🎉")).toBe(true);
    expect(goSessionChat.floats.map((f) => f.emoji)).toEqual(["🎉"]);
    expect(
      sent.filter((m) => (m as { type?: string }).type === "session_chat_ctl")
    ).toHaveLength(3);
  });

  it("lets Host lock and silence guests; Host can still type", () => {
    const sent: unknown[] = [];
    goSessionChat.attach({
      localAgentId: "host-1",
      localRole: "host",
      layout: "page",
      peers: [],
      broadcast: (msg) => {
        sent.push(msg);
        return 1;
      },
    });
    expect(goSessionChat.setTextLocked(true)).toBe(true);
    expect(goSessionChat.textLocked).toBe(true);
    expect(goSessionChat.sendText("host ok")).toBe(true);
    goSessionChat.detach();
    goSessionChat.attach({
      localAgentId: "g-a",
      localRole: "guest",
      layout: "page",
      peers: [],
      broadcast: (msg) => {
        sent.push(msg);
        return 1;
      },
    });
    goSessionChat.onIncoming({
      type: "session_chat_ctl",
      v: 1,
      op: "lock",
      from: "host-1",
      id: "lock-1",
    });
    expect(goSessionChat.textLocked).toBe(true);
    expect(goSessionChat.sendText("nope")).toBe(false);
    goSessionChat.onIncoming({
      type: "session_chat_ctl",
      v: 1,
      op: "unlock",
      from: "host-1",
      id: "unlock-1",
    });
    goSessionChat.onIncoming({
      type: "session_chat_ctl",
      v: 1,
      op: "silence",
      from: "host-1",
      id: "sil-1",
      to: "g-a",
      until: Date.now() + 60_000,
    });
    expect(goSessionChat.sendText("still no")).toBe(false);
  });

  it("deletes a line and captions it onto the TV", () => {
    goSessionChat.attach({
      localAgentId: "host-1",
      localRole: "host",
      layout: "page",
      peers: [],
      broadcast: () => 1,
    });
    goSessionChat.sendText("上電視");
    const mid = goSessionChat.messages[0]!.id;
    expect(goSessionChat.captionMessage(mid)).toBe(true);
    expect(goSessionChat.caption?.text).toBe("上電視");
    expect(goSessionChat.deleteMessage(mid)).toBe(true);
    expect(goSessionChat.messages).toHaveLength(0);
    expect(goSessionChat.deleteMessage(mid)).toBe(false);
  });
});
