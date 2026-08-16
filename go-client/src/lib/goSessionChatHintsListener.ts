/**
 * Listen for SAM → shell session-chat hints (play／go same wire).
 * `parent.postMessage({ type: "playgrounds-session-chat-hints", freeText?, quickReplies? }, "*")`
 */

import { parseSessionChatHintsMessage } from "@pg/roster/rosterSessionChat";
import { goSessionChat } from "./goSessionChat.svelte";

type MessageTarget = {
  addEventListener(
    type: "message",
    listener: (ev: MessageEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: "message",
    listener: (ev: MessageEvent) => void,
    options?: boolean | EventListenerOptions
  ): void;
};

export function installGoSessionChatHintsListener(
  target: MessageTarget = globalThis as unknown as MessageTarget
): () => void {
  const onMsg = (ev: MessageEvent) => {
    const hints = parseSessionChatHintsMessage(ev.data);
    if (!hints) return;
    goSessionChat.setHints(hints);
  };
  target.addEventListener("message", onMsg);
  return () => target.removeEventListener("message", onMsg);
}
