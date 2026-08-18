/**
 * go-client session chat UI state — attach from guest/host runtime when peers
 * are connected; Chrome mounts {@link GoSessionChatPanel}.
 */

import {
  broadcastSessionChat,
  buildSessionChatMessage,
  formatSessionChatToast,
  isSessionChatMessage,
  resolveSessionChatFreeText,
  resolveSessionChatQuickReplies,
  trimSessionChatTimeline,
  type SessionChatHints,
  type SessionChatMsg,
  type SessionChatRole,
  type SessionChatSendTarget,
  type SessionChatUiPhase,
} from "@pg/roster/rosterSessionChat";

export type GoSessionChatEntry = SessionChatMsg & {
  /** True when this client authored the message (optimistic local). */
  local: boolean;
};

type BroadcastFn = (msg: SessionChatMsg) => number;

class GoSessionChat {
  /** Peer DataChannel(s) attached — show right-rail handle. */
  connected = $state(false);
  panelOpen = $state(false);
  messages = $state<GoSessionChatEntry[]>([]);
  unread = $state(0);
  localAgentId = $state<string | null>(null);
  localName = $state("");
  /** Local seat role for outbound messages (Host badge). */
  localRole = $state<SessionChatRole | null>(null);
  /** Session UI phase for freeText gating (active vs waiting). */
  uiPhase = $state<SessionChatUiPhase>("waiting");
  hints = $state<SessionChatHints>({});
  /** `page` = 包廂 full-page timeline (hide right-rail overlay). */
  layout = $state<"rail" | "page">("rail");

  #broadcast: BroadcastFn | null = null;
  #seenIds = new Set<string>();
  #lastSendAt = 0;
  #throttleMs = 400;

  get freeTextAllowed(): boolean {
    return resolveSessionChatFreeText(this.hints, this.uiPhase);
  }

  get quickReplies(): string[] {
    return resolveSessionChatQuickReplies(this.hints);
  }

  attach(opts: {
    localAgentId: string;
    localName?: string;
    localRole?: SessionChatRole;
    peers: readonly SessionChatSendTarget[];
    layout?: "rail" | "page";
    /** Optional custom fanout (e.g. live peer map). Default: broadcast opts.peers. */
    broadcast?: BroadcastFn;
  }): void {
    this.localAgentId = opts.localAgentId;
    this.localName = opts.localName?.trim() || "";
    this.localRole = opts.localRole ?? null;
    this.layout = opts.layout ?? "rail";
    const peers = opts.peers;
    this.#broadcast =
      opts.broadcast ||
      ((msg) => broadcastSessionChat(peers, msg));
    this.connected = true;
  }

  /** Refresh fanout targets without clearing timeline (host multi-peer). */
  setBroadcast(broadcast: BroadcastFn): void {
    this.#broadcast = broadcast;
    this.connected = true;
  }

  setPeers(peers: readonly SessionChatSendTarget[]): void {
    this.#broadcast = (msg) => broadcastSessionChat(peers, msg);
    this.connected = peers.length > 0;
  }

  setLocalName(name: string): void {
    this.localName = name.trim();
  }

  setUiPhase(phase: SessionChatUiPhase): void {
    this.uiPhase = phase;
  }

  setHints(hints: SessionChatHints): void {
    this.hints = { ...hints };
  }

  detach(): void {
    this.connected = false;
    this.panelOpen = false;
    this.messages = [];
    this.unread = 0;
    this.localAgentId = null;
    this.localName = "";
    this.localRole = null;
    this.uiPhase = "waiting";
    this.hints = {};
    this.layout = "rail";
    this.#broadcast = null;
    this.#seenIds.clear();
    this.#lastSendAt = 0;
  }

  togglePanel(): void {
    this.panelOpen = !this.panelOpen;
    if (this.panelOpen) this.unread = 0;
  }

  setPanelOpen(open: boolean): void {
    this.panelOpen = open;
    if (open) this.unread = 0;
  }

  /**
   * Handle a DataChannel message. Returns toast string when a new remote
   * message arrived while the panel is closed (caller may flash).
   */
  onIncoming(raw: unknown): string | null {
    if (!isSessionChatMessage(raw)) return null;
    if (this.localAgentId && raw.from === this.localAgentId) return null;
    if (this.#seenIds.has(raw.id)) return null;
    this.#seenIds.add(raw.id);
    this.messages = trimSessionChatTimeline([
      ...this.messages,
      { ...raw, local: false },
    ]);
    if (this.layout === "page" || this.panelOpen) {
      this.unread = 0;
      return null;
    }
    this.unread += 1;
    return formatSessionChatToast(raw);
  }

  #composeOutbound(text: string): SessionChatMsg | null {
    if (!this.localAgentId) return null;
    return buildSessionChatMessage({
      from: this.localAgentId,
      name: this.localName || undefined,
      role: this.localRole || undefined,
      text,
    });
  }

  /** Send free text; returns false if rejected (blank, throttle, disconnected). */
  sendText(raw: string): boolean {
    if (!this.connected || !this.#broadcast || !this.localAgentId) return false;
    if (!this.freeTextAllowed) return false;
    const now = Date.now();
    if (now - this.#lastSendAt < this.#throttleMs) return false;
    const msg = this.#composeOutbound(raw);
    if (!msg) return false;
    this.#lastSendAt = now;
    this.#seenIds.add(msg.id);
    this.messages = trimSessionChatTimeline([
      ...this.messages,
      { ...msg, local: true },
    ]);
    this.#broadcast(msg);
    return true;
  }

  /** Quick-reply path (P2); ignores freeText gate. */
  sendQuickReply(text: string): boolean {
    if (!this.connected || !this.#broadcast || !this.localAgentId) return false;
    const now = Date.now();
    if (now - this.#lastSendAt < this.#throttleMs) return false;
    const msg = this.#composeOutbound(text);
    if (!msg) return false;
    this.#lastSendAt = now;
    this.#seenIds.add(msg.id);
    this.messages = trimSessionChatTimeline([
      ...this.messages,
      { ...msg, local: true },
    ]);
    this.#broadcast(msg);
    return true;
  }
}

export const goSessionChat = new GoSessionChat();
