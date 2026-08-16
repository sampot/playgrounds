import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { installGoSessionChatHintsListener } from "./goSessionChatHintsListener";
import { goSessionChat } from "./goSessionChat.svelte";
import { SESSION_CHAT_HINTS_TYPE } from "@pg/roster/rosterSessionChat";

function createMessageTarget() {
  const listeners = new Set<(ev: MessageEvent) => void>();
  return {
    addEventListener(_type: string, fn: EventListener) {
      listeners.add(fn as (ev: MessageEvent) => void);
    },
    removeEventListener(_type: string, fn: EventListener) {
      listeners.delete(fn as (ev: MessageEvent) => void);
    },
    dispatch(data: unknown) {
      const ev = { data } as MessageEvent;
      for (const fn of listeners) fn(ev);
    },
  };
}

describe("installGoSessionChatHintsListener", () => {
  let stop: (() => void) | null = null;
  let target: ReturnType<typeof createMessageTarget>;

  beforeEach(() => {
    goSessionChat.detach();
    target = createMessageTarget();
    stop = installGoSessionChatHintsListener(target);
  });

  afterEach(() => {
    stop?.();
    stop = null;
    goSessionChat.detach();
  });

  it("applies hints from postMessage", () => {
    target.dispatch({
      type: SESSION_CHAT_HINTS_TYPE,
      freeText: false,
      quickReplies: ["衝"],
    });
    expect(goSessionChat.hints).toEqual({
      freeText: false,
      quickReplies: ["衝"],
    });
    expect(goSessionChat.quickReplies).toEqual(["衝"]);
  });

  it("ignores unrelated messages", () => {
    goSessionChat.setHints({ quickReplies: ["留"] });
    target.dispatch({ type: "other", freeText: true });
    expect(goSessionChat.hints.quickReplies).toEqual(["留"]);
  });
});
