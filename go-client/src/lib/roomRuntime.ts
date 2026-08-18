/**
 * Pure-play 包廂 Host runtime (DEC-050 / PG-GO-ROOM-PLAN).
 * Mint invite.room → answer loop (no SAM) → session_chat + session_file.
 */

import {
  isPresenceMessage,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import {
  broadcastSessionChat,
  isSessionChatMessage,
  SESSION_CHAT_HOST_DISPLAY_NAME,
} from "@pg/roster/rosterSessionChat";
import { isSessionFileControl } from "@pg/roster/rosterSessionFile";
import { startPlatformHostAnswerLoop } from "@pg/platform/platformHostLoop";
import {
  buildInviteRoomIntent,
  INVITE_ROOM_KIND,
} from "@pg/platform/platformCompose";
import { goAuth } from "./goAuth.svelte";
import { chromeSession } from "./chromeSession.svelte";
import { goSessionChat } from "./goSessionChat.svelte";
import { goRoomFiles } from "./goRoomFiles.svelte";
import { GO_ROOM_QUICK_REPLIES } from "./goRoom";
import {
  DEFAULT_INVITE_TTL_MS,
  isInviteUnexpired,
} from "./hostRuntime";

export type RoomPhase = "idle" | "waiting" | "ready" | "ended" | "error";

export type RoomStatus = {
  phase: RoomPhase;
  message: string;
  error: string | null;
  inviteId: string | null;
  shortUrl: string | null;
  inviteExpiresAt: number | null;
  peerName: string | null;
};

type Listener = (s: RoomStatus) => void;

type PeerSlot = {
  peerId: string | null;
  session: RosterPeerSession | null;
  displayName: string | null;
};

function sendBinary(session: RosterPeerSession | null, buf: ArrayBuffer): void {
  const ch = session?.getChannel();
  if (!ch || ch.readyState !== "open") return;
  ch.send(buf);
}

export function createRoomRuntime() {
  let status: RoomStatus = {
    phase: "idle",
    message: "",
    error: null,
    inviteId: null,
    shortUrl: null,
    inviteExpiresAt: null,
    peerName: null,
  };
  const listeners = new Set<Listener>();
  let loop: ReturnType<typeof startPlatformHostAnswerLoop> | null = null;
  let inviteExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  const localAgentId = `go-room-${crypto.randomUUID().slice(0, 8)}`;
  const slot: PeerSlot = { peerId: null, session: null, displayName: null };
  let closing = false;

  function emit() {
    for (const l of listeners) l({ ...status });
  }
  function set(partial: Partial<RoomStatus>) {
    status = { ...status, ...partial };
    emit();
  }

  function clearInviteExpiryTimer() {
    if (inviteExpiryTimer) {
      clearTimeout(inviteExpiryTimer);
      inviteExpiryTimer = null;
    }
  }

  function scheduleInviteExpiry(inviteId: string, expiresAt: number) {
    clearInviteExpiryTimer();
    const delay = Math.max(0, expiresAt - Date.now());
    inviteExpiryTimer = setTimeout(() => {
      if (status.inviteId !== inviteId) return;
      if (status.phase === "ready") return;
      set({
        message: "門牌已過期，請再發一張",
        inviteExpiresAt: expiresAt,
      });
    }, delay);
  }

  function attachChatAndFiles(session: RosterPeerSession) {
    goSessionChat.attach({
      localAgentId,
      localName: SESSION_CHAT_HOST_DISPLAY_NAME,
      localRole: "host",
      layout: "page",
      peers: [session],
      broadcast: (msg) => broadcastSessionChat([session], msg),
    });
    goSessionChat.setHints({
      freeText: true,
      quickReplies: [...GO_ROOM_QUICK_REPLIES],
    });
    goSessionChat.setUiPhase("active");
    goRoomFiles.attach({
      sendJson: (msg) => {
        try {
          session.send(msg);
        } catch {
          /* ignore */
        }
      },
      sendBinary: (buf) => sendBinary(session, buf),
    });
  }

  function handlers(): RosterPeerHandlers {
    return {
      onMessage: (data: unknown) => {
        if (isPresenceMessage(data)) {
          slot.peerId = data.agentId;
          slot.displayName = data.name;
          if (slot.session) {
            /* already attached */
          }
          set({ peerName: data.name || null });
        } else if (isSessionChatMessage(data)) {
          const toast = goSessionChat.onIncoming(data);
          if (toast) chromeSession.setFlash(toast, 2800);
        } else if (isSessionFileControl(data)) {
          goRoomFiles.onControl(data);
        }
      },
      onBinary: (buf) => goRoomFiles.onBinary(buf),
      onChannelOpen: () => {
        if (slot.session) attachChatAndFiles(slot.session);
        if (status.phase !== "ended") {
          set({ phase: "ready", message: "已連線", error: null });
        }
      },
      onChannelClose: () => {
        void close({ message: "對方已離開" });
      },
      onConnectionState: (state) => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          if (status.phase === "ready" || status.phase === "waiting") {
            void close({ message: "連線已中斷" });
          }
        }
      },
      onError: (err) => {
        set({ phase: "error", error: err.message, message: "" });
      },
    };
  }

  async function mintInviteAndAnswer(): Promise<{
    inviteId: string;
    shortUrl: string;
  } | null> {
    closing = false;
    try {
      const created = await goAuth.mintPlatformInvite({
        kind: INVITE_ROOM_KIND,
        intent: buildInviteRoomIntent(),
      });
      const expiresAt =
        typeof created.expires_at === "number" &&
        Number.isFinite(created.expires_at)
          ? created.expires_at
          : Date.now() + DEFAULT_INVITE_TTL_MS;
      if (!isInviteUnexpired(expiresAt)) {
        set({
          phase: "error",
          error: "邀請已過期，請重新邀請",
          message: "",
        });
        return null;
      }
      const apiKey = goAuth.getPlatformApiKeyForHostLoop();
      if (!apiKey) {
        set({ phase: "error", error: "通行證已失效，請重新登入", message: "" });
        return null;
      }
      loop?.stop();
      slot.peerId = null;
      slot.session = null;
      slot.displayName = null;
      set({
        phase: "waiting",
        inviteId: created.invite_id,
        shortUrl: created.short_url,
        inviteExpiresAt: expiresAt,
        error: null,
        message: "等待對方進來",
        peerName: null,
      });
      scheduleInviteExpiry(created.invite_id, expiresAt);
      loop = startPlatformHostAnswerLoop({
        inviteId: created.invite_id,
        apiKey,
        useRelay: false,
        media: "ready",
        maxAnswers: 1,
        localPresence: {
          agentId: localAgentId,
          name: SESSION_CHAT_HOST_DISPLAY_NAME,
        },
        prepareHandlers: () => ({
          handlers: handlers(),
          attachSession: (sess: RosterPeerSession) => {
            slot.session = sess;
            if (sess.getChannel()?.readyState === "open") {
              attachChatAndFiles(sess);
              set({ phase: "ready", message: "已連線", error: null });
            }
          },
        }),
        onStatus: (msg) => set({ message: msg }),
        onError: (msg) => set({ error: msg, message: "" }),
        onAnswered: async () => {
          set({ message: "握手完成，等待通道開啟…" });
        },
        onDone: () => {
          set({ message: "對方已連上", error: null });
        },
      });
      return { inviteId: created.invite_id, shortUrl: created.short_url };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: unknown }).code)
          : /通行證|登入|not_provisioned/i.test(message)
            ? "not_provisioned"
            : "error";
      set({ phase: "error", error: message, message: "" });
      throw Object.assign(new Error(message), { code });
    }
  }

  async function close(opts?: { message?: string }): Promise<void> {
    if (closing || status.phase === "ended") return;
    closing = true;
    clearInviteExpiryTimer();
    loop?.stop();
    loop = null;
    goSessionChat.detach();
    goRoomFiles.detach();
    try {
      slot.session?.close();
    } catch {
      /* ignore */
    }
    slot.session = null;
    const inviteId = status.inviteId;
    if (inviteId) {
      try {
        await goAuth.revokePlatformInvite(inviteId);
      } catch {
        /* already closed / expired */
      }
    }
    set({
      phase: "ended",
      message: opts?.message ?? "已結束這一間",
      error: null,
      inviteId: null,
      shortUrl: null,
      inviteExpiresAt: null,
      peerName: null,
    });
    closing = false;
  }

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      listener({ ...status });
      return () => listeners.delete(listener);
    },
    getStatus(): RoomStatus {
      return { ...status };
    },
    mintInviteAndAnswer,
    close,
  };
}

export type RoomRuntime = ReturnType<typeof createRoomRuntime>;
