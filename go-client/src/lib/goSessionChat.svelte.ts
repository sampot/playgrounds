/**
 * go-client session chat UI state — attach from guest/host runtime when peers
 * are connected; Chrome mounts {@link GoSessionChatPanel}.
 */

import {
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
import {
  SESSION_CHAT_CAPTION_MS,
  SESSION_CHAT_FLOAT_MS,
  SESSION_CHAT_SILENCE_MS,
  applyChatReaction,
  buildSessionChatCtlMessage,
  chatReactionRows,
  isSessionChatCtlMessage,
  type ChatReactionMap,
  type SessionChatCtlMessage,
  type SessionChatFloatEmoji,
} from "@pg/roster/rosterSessionChatCtl";
import {
  ROOM_TIMELINE_MAX,
  type RoomSystemNote,
} from "./goRoomTimeline";

export type GoSessionChatEntry = SessionChatMsg & {
  /** True when this client authored the message (optimistic local). */
  local: boolean;
};

export type GoRoomFeedItem =
  | { kind: "chat"; id: string; ts: number; chat: GoSessionChatEntry }
  | { kind: "system"; id: string; ts: number; system: RoomSystemNote };

type BroadcastFn = (msg: unknown) => number;

function sendToPeers(
  peers: readonly SessionChatSendTarget[],
  msg: unknown
): number {
  let ok = 0;
  for (const peer of peers) {
    try {
      peer.send(msg);
      ok += 1;
    } catch {
      /* channel closed */
    }
  }
  return ok;
}

class GoSessionChat {
  /** Peer DataChannel(s) attached — show right-rail handle. */
  connected = $state(false);
  panelOpen = $state(false);
  messages = $state<GoSessionChatEntry[]>([]);
  systemNotes = $state<RoomSystemNote[]>([]);
  reactions = $state<ChatReactionMap>({});
  floats = $state<{ id: string; emoji: string; ts: number }[]>([]);
  caption = $state<{ text: string; until: number } | null>(null);
  textLocked = $state(false);
  silencedUntil = $state<Record<string, number>>({});
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
  #deleted = new Set<string>();
  #lastSendAt = 0;
  #throttleMs = 400;

  get freeTextAllowed(): boolean {
    return resolveSessionChatFreeText(this.hints, this.uiPhase);
  }

  get quickReplies(): string[] {
    return resolveSessionChatQuickReplies(this.hints);
  }

  get feed(): GoRoomFeedItem[] {
    const rows: GoRoomFeedItem[] = [
      ...this.messages.map((chat) => ({
        kind: "chat" as const,
        id: chat.id,
        ts: chat.ts,
        chat,
      })),
      ...this.systemNotes.map((system) => ({
        kind: "system" as const,
        id: system.id,
        ts: system.ts,
        system,
      })),
    ];
    rows.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
    if (rows.length <= ROOM_TIMELINE_MAX) return rows;
    return rows.slice(rows.length - ROOM_TIMELINE_MAX);
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
    this.#broadcast = opts.broadcast || ((msg) => sendToPeers(peers, msg));
    this.connected = true;
  }

  /** Refresh fanout targets without clearing timeline (host multi-peer). */
  setBroadcast(broadcast: BroadcastFn): void {
    this.#broadcast = broadcast;
    this.connected = true;
  }

  setPeers(peers: readonly SessionChatSendTarget[]): void {
    this.#broadcast = (msg) => sendToPeers(peers, msg);
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
    this.systemNotes = [];
    this.reactions = {};
    this.floats = [];
    this.caption = null;
    this.textLocked = false;
    this.silencedUntil = {};
    this.unread = 0;
    this.localAgentId = null;
    this.localName = "";
    this.localRole = null;
    this.uiPhase = "waiting";
    this.hints = {};
    this.layout = "rail";
    this.#broadcast = null;
    this.#seenIds.clear();
    this.#deleted.clear();
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
    if (isSessionChatCtlMessage(raw)) {
      this.#applyCtl(raw);
      return null;
    }
    if (!isSessionChatMessage(raw)) return null;
    if (this.localAgentId && raw.from === this.localAgentId) return null;
    if (this.#seenIds.has(raw.id)) return null;
    if (this.#deleted.has(raw.id)) return null;
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

  #canSpeak(): boolean {
    if (this.localRole === "host") return true;
    if (this.textLocked) return false;
    const id = this.localAgentId;
    if (!id) return false;
    const until = this.silencedUntil[id];
    return !(until && until > Date.now());
  }

  #emitCtl(
    opts: Omit<Parameters<typeof buildSessionChatCtlMessage>[0], "from">
  ): SessionChatCtlMessage | null {
    if (!this.connected || !this.#broadcast || !this.localAgentId) return null;
    const msg = buildSessionChatCtlMessage({
      ...opts,
      from: this.localAgentId,
    });
    if (!isSessionChatCtlMessage(msg)) return null;
    this.#seenIds.add(msg.id);
    this.#broadcast(msg);
    return msg;
  }

  #applyCtl(raw: SessionChatCtlMessage): void {
    if (this.#seenIds.has(raw.id)) return;
    this.#seenIds.add(raw.id);
    if (raw.op === "react" && raw.targetId && raw.emoji) {
      this.reactions = applyChatReaction(this.reactions, {
        targetId: raw.targetId,
        emoji: raw.emoji,
        from: raw.from,
      });
      return;
    }
    if (raw.op === "float" && raw.emoji) {
      this.floats = [
        ...this.floats,
        { id: raw.id, emoji: raw.emoji, ts: Date.now() },
      ];
      return;
    }
    if (raw.op === "caption" && raw.text) {
      this.caption = {
        text: raw.text,
        until: Date.now() + SESSION_CHAT_CAPTION_MS,
      };
      return;
    }
    if (raw.op === "delete" && raw.targetId) {
      this.#tombstone(raw.targetId);
      return;
    }
    if (raw.op === "lock") {
      this.textLocked = true;
      return;
    }
    if (raw.op === "unlock") {
      this.textLocked = false;
      return;
    }
    if (raw.op === "silence" && raw.to) {
      const until =
        raw.until && raw.until > Date.now()
          ? raw.until
          : Date.now() + SESSION_CHAT_SILENCE_MS;
      this.silencedUntil = { ...this.silencedUntil, [raw.to]: until };
      return;
    }
    if (raw.op === "unsilence" && raw.to) {
      const next = { ...this.silencedUntil };
      delete next[raw.to];
      this.silencedUntil = next;
    }
  }

  #tombstone(targetId: string): void {
    this.#deleted.add(targetId);
    this.messages = this.messages.filter((m) => m.id !== targetId);
    if (this.reactions[targetId]) {
      const next = { ...this.reactions };
      delete next[targetId];
      this.reactions = next;
    }
  }

  reactionRows(targetId: string) {
    return chatReactionRows(this.reactions, targetId, this.localAgentId);
  }

  isPeerSilenced(peerId: string, now = Date.now()): boolean {
    const until = this.silencedUntil[peerId];
    return Boolean(until && until > now);
  }

  react(targetId: string, emoji: SessionChatFloatEmoji): boolean {
    if (!this.messages.some((m) => m.id === targetId)) return false;
    const msg = this.#emitCtl({ op: "react", targetId, emoji });
    if (!msg || !this.localAgentId) return false;
    this.reactions = applyChatReaction(this.reactions, {
      targetId,
      emoji,
      from: this.localAgentId,
    });
    return true;
  }

  floatEmoji(emoji: SessionChatFloatEmoji): boolean {
    const msg = this.#emitCtl({ op: "float", emoji });
    if (!msg) return false;
    this.floats = [...this.floats, { id: msg.id, emoji, ts: Date.now() }];
    return true;
  }

  pruneStage(now = Date.now()): void {
    this.floats = this.floats.filter((f) => now - f.ts < SESSION_CHAT_FLOAT_MS);
    if (this.caption && this.caption.until <= now) this.caption = null;
  }

  captionMessage(targetId: string): boolean {
    if (this.localRole !== "host") return false;
    const row = this.messages.find((m) => m.id === targetId);
    if (!row) return false;
    const msg = this.#emitCtl({ op: "caption", text: row.text, targetId });
    if (!msg?.text) return false;
    this.caption = {
      text: msg.text,
      until: Date.now() + SESSION_CHAT_CAPTION_MS,
    };
    return true;
  }

  deleteMessage(targetId: string): boolean {
    if (this.localRole !== "host") return false;
    if (this.#deleted.has(targetId)) return false;
    if (!this.messages.some((m) => m.id === targetId)) return false;
    const msg = this.#emitCtl({ op: "delete", targetId });
    if (!msg) return false;
    this.#tombstone(targetId);
    return true;
  }

  silencePeer(peerId: string): boolean {
    if (this.localRole !== "host" || !peerId || peerId === this.localAgentId) {
      return false;
    }
    const until = Date.now() + SESSION_CHAT_SILENCE_MS;
    const msg = this.#emitCtl({ op: "silence", to: peerId, until });
    if (!msg) return false;
    this.silencedUntil = { ...this.silencedUntil, [peerId]: until };
    return true;
  }

  unsilencePeer(peerId: string): boolean {
    if (this.localRole !== "host" || !peerId) return false;
    const msg = this.#emitCtl({ op: "unsilence", to: peerId });
    if (!msg) return false;
    const next = { ...this.silencedUntil };
    delete next[peerId];
    this.silencedUntil = next;
    return true;
  }

  setTextLocked(locked: boolean): boolean {
    if (this.localRole !== "host") return false;
    const msg = this.#emitCtl({ op: locked ? "lock" : "unlock" });
    if (!msg) return false;
    this.textLocked = locked;
    return true;
  }

  /** Local system row (join／file／TV). Deduped by id; not fanned out. */
  noteSystem(note: RoomSystemNote): boolean {
    if (this.layout !== "page") return false;
    if (!note.id || !note.text.trim()) return false;
    if (this.#seenIds.has(note.id)) return false;
    this.#seenIds.add(note.id);
    this.systemNotes = trimSessionChatTimeline([
      ...this.systemNotes,
      {
        ...note,
        text: note.text.trim(),
        ts: Number.isFinite(note.ts) ? note.ts : Date.now(),
      },
    ]);
    return true;
  }

  /** Send free text; returns false if rejected (blank, throttle, disconnected). */
  sendText(raw: string): boolean {
    if (!this.connected || !this.#broadcast || !this.localAgentId) return false;
    if (!this.freeTextAllowed || !this.#canSpeak()) return false;
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
    if (!this.#canSpeak()) return false;
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
