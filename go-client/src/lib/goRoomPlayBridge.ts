/**
 * Page → go SW: `/room-play/<id>` is a same-origin HTTP file resource.
 * SW serves GET/HEAD with Accept-Ranges; page fills bytes from DataChannel.
 */

import { ROOM_PLAY_MSG } from "./goRoomPlayRegistry";

export type RoomPlaySwOp =
  | {
      type: typeof ROOM_PLAY_MSG;
      op: "open";
      id: string;
      mime: string;
      size: number;
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

export async function waitRoomPlaySw(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return true;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 1200);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true }
      );
    });
    return Boolean(navigator.serviceWorker.controller);
  } catch {
    return false;
  }
}

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

export function notifyRoomPlaySw(msg: RoomPlaySwOp): void {
  const sw = controller();
  if (!sw) return;
  try {
    sw.postMessage(msg);
  } catch {
    /* ignore */
  }
}
