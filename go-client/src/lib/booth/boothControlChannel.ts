import type {
  BoothEnvelope,
  BoothErrorCode,
  BoothStateSnapshot,
  BoothSubscribeScope,
} from "@pg/roster/boothChannel";
import type { BoothAck, BoothEngineEvent, BoothIntent } from "./boothHubEngine";
import { boothIntentToWire } from "./boothIntentWire";

const HELLO_WAIT_MS = 15_000;
const ACK_WAIT_MS = 30_000;

export type BoothControlChannel = {
  connect(): Promise<{ sessionId: string; snapshot: BoothStateSnapshot }>;
  close(): void;
  isOpen(): boolean;
  subscribe(listener: (msg: BoothEngineEvent) => void): () => void;
  dispatch(intent: BoothIntent): Promise<BoothAck>;
};

export function createBoothControlChannel(opts: {
  wsUrl: string;
  shellId: string;
  role: "host" | "operator" | "viewer";
  subscribeScopes?: BoothSubscribeScope[];
}): BoothControlChannel {
  let ws: WebSocket | null = null;
  let open = false;
  let sessionId = "";
  let latestSnapshot: BoothStateSnapshot | null = null;
  let resolveHello: ((snapshot: BoothStateSnapshot) => void) | null = null;
  let rejectHello: ((err: Error) => void) | null = null;
  let helloTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(msg: BoothEngineEvent) => void>();
  const pendingAcks = new Map<
    string,
    {
      resolve: (ack: BoothAck) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  function emit(msg: BoothEngineEvent): void {
    for (const listener of listeners) listener(msg);
  }

  function send(frame: Record<string, unknown>): void {
    if (!ws || ws.readyState !== 1) {
      throw new Error("control_channel_closed");
    }
    ws.send(JSON.stringify({ v: 1, ...frame }));
  }

  function handleFrame(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const frame = raw as BoothEnvelope;
    if (frame.type === "booth.hello.ok") {
      sessionId =
        typeof frame.sessionId === "string" ? frame.sessionId : sessionId;
      return;
    }
    if (frame.type === "booth.state.snapshot") {
      const snapshot = frame as unknown as BoothStateSnapshot;
      latestSnapshot = snapshot;
      if (resolveHello) {
        const resolve = resolveHello;
        resolveHello = null;
        rejectHello = null;
        if (helloTimer) clearTimeout(helloTimer);
        helloTimer = null;
        resolve(snapshot);
      }
      emit({ type: "booth.state.snapshot", snapshot });
      return;
    }
    if (frame.type === "booth.event.director.changed") {
      emit({
        type: "booth.event.director.changed",
        director:
          frame.director && typeof frame.director === "object"
            ? (frame.director as BoothEngineEvent extends {
                type: "booth.event.director.changed";
              }
                ? NonNullable<
                    Extract<
                      BoothEngineEvent,
                      { type: "booth.event.director.changed" }
                    >["director"]
                  >
                : null)
            : null,
      });
      return;
    }
    if (frame.type === "booth.event.engine.offline") {
      open = false;
      return;
    }
    if (frame.type === "booth.ack" && typeof frame.id === "string") {
      const pending = pendingAcks.get(frame.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingAcks.delete(frame.id);
      const error =
        typeof frame.error === "string"
          ? (frame.error as BoothErrorCode)
          : undefined;
      pending.resolve({
        ok: frame.ok === true,
        error,
        payload:
          frame.payload && typeof frame.payload === "object"
            ? (frame.payload as Record<string, unknown>)
            : undefined,
      });
    }
  }

  function waitForOpen(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("control_connect_failed"));
      };
      const onClose = () => {
        cleanup();
        reject(new Error("control_connect_closed"));
      };
      const cleanup = () => {
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("close", onClose);
      };
      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
      socket.addEventListener("close", onClose);
    });
  }

  return {
    async connect() {
      if (open && latestSnapshot) {
        return { sessionId, snapshot: latestSnapshot };
      }
      ws?.close();
      ws = new WebSocket(opts.wsUrl);
      await waitForOpen(ws);

      ws.addEventListener("message", (ev) => {
        const text = typeof ev.data === "string" ? ev.data : "";
        if (!text) return;
        try {
          handleFrame(JSON.parse(text) as unknown);
        } catch {
          /* ignore malformed */
        }
      });
      ws.onclose = () => {
        open = false;
      };

      const helloPromise = new Promise<BoothStateSnapshot>((resolve, reject) => {
        resolveHello = resolve;
        rejectHello = reject;
        helloTimer = setTimeout(() => {
          resolveHello = null;
          rejectHello = null;
          helloTimer = null;
          reject(new Error("control_hello_timeout"));
        }, HELLO_WAIT_MS);
      });

      send({
        type: "booth.hello",
        shellId: opts.shellId,
        role: opts.role,
        subscribe: opts.subscribeScopes ?? [
          "members",
          "cast",
          "inviteGate",
          "shareFiles",
          "privateFiles",
          "director",
          "engineHealth",
        ],
      });

      const snapshot = await helloPromise;
      sessionId = snapshot.sessionId;
      latestSnapshot = snapshot;
      open = true;

      return { sessionId, snapshot };
    },

    close() {
      open = false;
      if (helloTimer) clearTimeout(helloTimer);
      helloTimer = null;
      resolveHello = null;
      if (rejectHello) {
        rejectHello(new Error("control_channel_closed"));
        rejectHello = null;
      }
      for (const pending of pendingAcks.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("control_channel_closed"));
      }
      pendingAcks.clear();
      ws?.close();
      ws = null;
    },

    isOpen() {
      return open && ws != null && ws.readyState === 1;
    },

    subscribe(listener) {
      listeners.add(listener);
      if (latestSnapshot) {
        listener({
          type: "booth.state.snapshot",
          snapshot: latestSnapshot,
        });
      }
      return () => listeners.delete(listener);
    },

    dispatch(intent) {
      const requestId = crypto.randomUUID();
      return new Promise<BoothAck>((resolve, reject) => {
        if (!this.isOpen()) {
          resolve({ ok: false, error: "session_ended" });
          return;
        }
        const timer = setTimeout(() => {
          pendingAcks.delete(requestId);
          reject(new Error("control_ack_timeout"));
        }, ACK_WAIT_MS);
        pendingAcks.set(requestId, { resolve, reject, timer });
        try {
          send(boothIntentToWire(intent, requestId));
        } catch (e) {
          clearTimeout(timer);
          pendingAcks.delete(requestId);
          reject(e instanceof Error ? e : new Error("control_send_failed"));
        }
      });
    },
  };
}
