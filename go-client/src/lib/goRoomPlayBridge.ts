/**
 * Page → go SW: `/room-file/<id>` is a same-origin HTTP file resource.
 * SW serves GET/HEAD with Accept-Ranges; page fills bytes from DataChannel.
 */

import { isGoCanvasSwUsable } from "./goCanvasSupport";
import { GO_SW_URL } from "./registerGoSw";
import { ROOM_PLAY_MSG } from "./goRoomPlayRegistry";

export type RoomPlaySwOp =
  | {
      type: typeof ROOM_PLAY_MSG;
      op: "open";
      id: string;
      mime: string;
      size: number;
      name?: string;
    }
  | {
      type: typeof ROOM_PLAY_MSG;
      op: "register-local";
      id: string;
      file: File;
    }
  | {
      type: typeof ROOM_PLAY_MSG;
      op: "unregister-local";
      id: string;
    }
  | {
      type: typeof ROOM_PLAY_MSG;
      op: "chunk";
      id: string;
      at?: number;
      bytes: ArrayBuffer;
    }
  | {
      type: typeof ROOM_PLAY_MSG;
      op: "need";
      id: string;
      start: number;
      end: number;
    }
  | {
      type: typeof ROOM_PLAY_MSG;
      op: "end";
      id: string;
    }
  | {
      type: typeof ROOM_PLAY_MSG;
      op: "abort";
      id: string;
    }
  | {
      type: typeof ROOM_PLAY_MSG;
      /** Page rejected admit (per-file task cap) — fail this HTTP body. */
      op: "reject-transfer";
      id: string;
      transferId: string;
      reason?: string;
    };

function controller(): ServiceWorker | null {
  try {
    return navigator.serviceWorker?.controller ?? null;
  } catch {
    return null;
  }
}

export function roomPlaySwAvailable(): boolean {
  return Boolean(controller());
}

/** Nudge a waiting worker after deploy (SW also skipWaiting on install). */
function nudgeWaitingServiceWorker(
  reg: ServiceWorkerRegistration
): void {
  const waiting = reg.waiting;
  if (!waiting) return;
  try {
    waiting.postMessage({ type: "skip-waiting" });
  } catch {
    /* ignore */
  }
}

/**
 * Ensure go SW is registered and controlling this page.
 * Safari guests often land with a ready registration but no controller until
 * claim／controllerchange — download／play need the controller for `/room-file/`.
 */
export async function ensureRoomFileSw(timeoutMs = 8000): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }
    if (!isGoCanvasSwUsable()) return false;
    if (navigator.serviceWorker.controller) return true;

    const reg = await navigator.serviceWorker.register(GO_SW_URL, {
      scope: "/",
    });
    nudgeWaitingServiceWorker(reg);
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return true;

    const deadline = Date.now() + timeoutMs;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(poll);
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange
        );
        resolve();
      };
      const onControllerChange = () => {
        if (navigator.serviceWorker.controller) finish();
      };
      const poll = setInterval(() => {
        if (navigator.serviceWorker.controller || Date.now() >= deadline) {
          finish();
        }
      }, 200);
      const timer = setTimeout(finish, timeoutMs);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange
      );
      if (navigator.serviceWorker.controller) finish();
    });
    return Boolean(navigator.serviceWorker.controller);
  } catch {
    return false;
  }
}

export async function waitRoomPlaySw(): Promise<boolean> {
  return ensureRoomFileSw(6000);
}

export type RoomOpenTransferMsg = {
  fileId: string;
  /** Same as fileId — SW job id. */
  jobId?: string;
  transferId: string;
  offset: number;
  end?: number;
  /**
   * Echo of `?purpose=` that **this page** put on the HTTP request.
   * Authority is the Page URL／open session — not SW inventing purpose.
   */
  purpose?: "play" | "save";
};

/**
 * SW → page: one HTTP roundtrip opened a remote transfer (SW owns transferId).
 * Page must only session_file.request with this id — never invent transferIds.
 */
export function listenRoomOpenTransfer(
  onOpen: (msg: RoomOpenTransferMsg) => void
): () => void {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return () => {};
    }
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.type !== ROOM_PLAY_MSG || data.op !== "open-transfer") {
        return;
      }
      if (typeof data.id !== "string" || typeof data.transferId !== "string") {
        return;
      }
      if (typeof data.offset !== "number" || !Number.isFinite(data.offset)) {
        return;
      }
      onOpen({
        fileId: data.id,
        jobId: typeof data.jobId === "string" ? data.jobId : data.id,
        transferId: data.transferId,
        offset: Math.max(0, Math.floor(data.offset)),
        end: typeof data.end === "number" ? data.end : undefined,
        purpose:
          data.purpose === "save" || data.purpose === "play"
            ? data.purpose
            : undefined,
      });
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  } catch {
    return () => {};
  }
}

/** @deprecated Prefer listenRoomOpenTransfer — need alone must not invent transferIds. */
export function listenRoomPlayNeed(
  onNeed: (playId: string, start: number, end: number) => void
): () => void {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return () => {};
    }
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.type !== ROOM_PLAY_MSG || data.op !== "need") return;
      if (typeof data.id !== "string" || typeof data.start !== "number") return;
      onNeed(data.id, data.start, typeof data.end === "number" ? data.end : data.start);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  } catch {
    return () => {};
  }
}

export type RoomTransferEndMsg = {
  fileId: string;
  transferId: string;
  ok: boolean;
  delivered?: number;
  reason?: string;
};

/**
 * SW → page: HTTP body for this transferId was fully delivered (or aborted).
 * Completion authority — owner session_file.done is not success.
 */
export function listenRoomTransferEnd(
  onEnd: (msg: RoomTransferEndMsg) => void
): () => void {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return () => {};
    }
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.type !== ROOM_PLAY_MSG) return;
      if (data.op !== "transfer-complete" && data.op !== "transfer-abort") {
        return;
      }
      if (typeof data.id !== "string" || typeof data.transferId !== "string") {
        return;
      }
      onEnd({
        fileId: data.id,
        transferId: data.transferId,
        ok: data.op === "transfer-complete",
        delivered:
          typeof data.delivered === "number" ? data.delivered : undefined,
        reason: typeof data.reason === "string" ? data.reason : undefined,
      });
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  } catch {
    return () => {};
  }
}

/** SW → page: HTTP stream read cursor so the page mirror trims the same window. */
export function listenRoomPlayPin(
  onPin: (playId: string, streamKey: string, at: number | null) => void
): () => void {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return () => {};
    }
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.type !== ROOM_PLAY_MSG) return;
      if (data.op !== "pin" && data.op !== "unpin") return;
      if (typeof data.id !== "string" || typeof data.streamKey !== "string") return;
      onPin(
        data.id,
        data.streamKey,
        data.op === "unpin" || typeof data.at !== "number" ? null : data.at
      );
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  } catch {
    return () => {};
  }
}

/** SW → page: browser download body was cancelled mid-stream. */
export function listenRoomPlaySaveCancel(
  onCancel: (playId: string) => void
): () => void {
  try {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return () => {};
    }
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.type !== ROOM_PLAY_MSG || data.op !== "save-cancel") {
        return;
      }
      if (typeof data.id !== "string") return;
      onCancel(data.id);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  } catch {
    return () => {};
  }
}

export function notifyRoomPlaySw(msg: RoomPlaySwOp): void {
  const sw = controller();
  if (!sw) return;
  try {
    sw.postMessage(msg);
  } catch {
    /* ignore */
  }
}

/** Register an owned File so SW can serve `/room-file/<id>` without DC. */
export function registerLocalRoomFile(id: string, file: File): void {
  notifyRoomPlaySw({
    type: ROOM_PLAY_MSG,
    op: "register-local",
    id,
    file,
  });
}

/**
 * SW must be controlling before register-local; re-call before every local
 * `/room-file/` HTTP (cast／play／download) so a SW update cannot 404.
 */
export async function ensureLocalRoomFileRegistered(
  id: string,
  file: File,
  opts?: {
    timeoutMs?: number;
    register?: (id: string, file: File) => void;
  }
): Promise<boolean> {
  const ready = await ensureRoomFileSw(opts?.timeoutMs ?? 8000);
  if (!ready) return false;
  const reg = opts?.register ?? registerLocalRoomFile;
  reg(id, file);
  return true;
}

const roomFileSwResyncHooks = new Set<() => void>();
let roomFileSwResyncListening = false;

function ensureRoomFileSwResyncListener(): void {
  if (roomFileSwResyncListening) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  roomFileSwResyncListening = true;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    for (const hook of roomFileSwResyncHooks) {
      try {
        hook();
      } catch {
        /* ignore */
      }
    }
  });
}

/** Re-register local Files after SW install／update clears in-memory registry. */
export function onRoomFileSwControllerChange(fn: () => void): () => void {
  ensureRoomFileSwResyncListener();
  roomFileSwResyncHooks.add(fn);
  return () => {
    roomFileSwResyncHooks.delete(fn);
  };
}

export function unregisterLocalRoomFile(id: string): void {
  notifyRoomPlaySw({
    type: ROOM_PLAY_MSG,
    op: "unregister-local",
    id,
  });
}

/** Admit failed — tell SW to error this HTTP roundtrip (do not wait for DC). */
export function rejectRoomHttpTransfer(
  fileId: string,
  transferId: string,
  reason?: string
): void {
  notifyRoomPlaySw({
    type: ROOM_PLAY_MSG,
    op: "reject-transfer",
    id: fileId,
    transferId,
    reason,
  });
}
