import {
  friendlyOperatorAckError,
  friendlyOperatorError,
} from "./goFriendlyError";
import type { BoothEnvelope, BoothStateSnapshot } from "@pg/roster/boothChannel";
import type { RoomInviteDoor } from "./goRoom";
import { boothSnapshotToUi } from "./boothSnapshotUi";
import { createBoothOperatorRtc } from "./boothOperatorRtc";
import { createBoothOperatorClient } from "./boothPlatform";

export type OperatorShellPhase = "idle" | "connecting" | "open" | "error";

export type OperatorShellStatus = {
  phase: OperatorShellPhase;
  message: string;
  error: string | null;
  guestCount: number;
  inviteDoor: RoomInviteDoor;
  shortUrl: string | null;
  inviteExpiresAt: number | null;
  occupantPeers: { peerId: string; name: string }[];
  occupantNames: string[];
  peerName: string | null;
  tvOn: boolean;
  tvLabel: string | null;
  canDirect: boolean;
  directorRole: "operator" | "viewer" | null;
  remoteLives: { peerId: string; camera: boolean; mic: boolean }[];
  lastAck: string | null;
  tvStream: MediaStream | null;
};

type Listener = (s: OperatorShellStatus) => void;

function emptyStatus(): OperatorShellStatus {
  return {
    phase: "idle",
    message: "",
    error: null,
    guestCount: 0,
    inviteDoor: "none",
    shortUrl: null,
    inviteExpiresAt: null,
    occupantPeers: [],
    occupantNames: [],
    peerName: null,
    tvOn: false,
    tvLabel: null,
    canDirect: false,
    directorRole: null,
    remoteLives: [],
    lastAck: null,
    tvStream: null,
  };
}

export function operatorCanDirect(input: {
  director?: { shellId: string; role: string } | null;
  shellId: string;
}): boolean {
  const d = input.director;
  return Boolean(d && d.shellId === input.shellId && d.role === "operator");
}

export function createBoothOperatorShell(opts: { operatorCap: string }) {
  const shellId = `op-${crypto.randomUUID().slice(0, 8)}`;
  let status = emptyStatus();
  let client: ReturnType<typeof createBoothOperatorClient> | null = null;
  let operatorRtc: ReturnType<typeof createBoothOperatorRtc> | null = null;
  let director: { shellId: string; role: string } | null = null;
  const listeners = new Set<Listener>();

  function emit(): void {
    const snap = { ...status };
    for (const l of listeners) l(snap);
  }

  function set(partial: Partial<OperatorShellStatus>): void {
    status = { ...status, ...partial };
    emit();
  }

  function applySnapshot(snapshot: BoothStateSnapshot): void {
    const ui = boothSnapshotToUi(snapshot);
    const canDirect = operatorCanDirect({ director, shellId });
    set({
      phase: "open",
      message: canDirect ? "遠端導播中" : "遠端檢視（家裡主持使用中）",
      error: null,
      guestCount: ui.guestCount,
      inviteDoor: ui.inviteDoor,
      shortUrl: ui.shortUrl,
      occupantPeers: ui.occupantPeers,
      occupantNames: ui.occupantNames,
      peerName: ui.occupantNames[0] ?? null,
      tvOn: ui.tvOn,
      tvLabel: ui.tvLabel,
      remoteLives: ui.remoteLives,
      canDirect,
      directorRole: canDirect ? "operator" : director ? "viewer" : null,
    });
  }

  function sendIntent(frame: BoothEnvelope): void {
    if (!client) return;
    client.sendIntent({
      ...frame,
      v: 1,
      shellId,
      id: frame.id ?? crypto.randomUUID(),
    });
  }

  return {
    subscribe(listener: Listener) {
      listeners.add(listener);
      listener({ ...status });
      return () => listeners.delete(listener);
    },
    getStatus(): OperatorShellStatus {
      return { ...status };
    },
    getShellId(): string {
      return shellId;
    },
    async connect(): Promise<void> {
      if (!opts.operatorCap.trim()) {
        set({
          phase: "error",
          error: "請從後台「連回包廂」開啟此頁。",
        });
        return;
      }
      set({ phase: "connecting", message: "連線中…", error: null });
      let rtc: ReturnType<typeof createBoothOperatorRtc> | null = null;
      client = createBoothOperatorClient({
        operatorCap: opts.operatorCap,
        shellId,
        onSnapshot: applySnapshot,
        onAck: (_id, ok, err) => {
          set({
            lastAck: ok ? "已送出" : friendlyOperatorAckError(err),
          });
        },
        onHelloOk: (hello) => {
          director = hello.director ?? null;
          const canDirect = operatorCanDirect({ director, shellId });
          set({
            canDirect,
            directorRole: canDirect ? "operator" : director ? "viewer" : null,
            message: canDirect
              ? "遠端導播中"
              : "遠端檢視（家裡主持使用中）",
          });
        },
        onDirectorChanged: (next) => {
          director = next;
          const canDirect = operatorCanDirect({ director, shellId });
          set({
            canDirect,
            directorRole: canDirect ? "operator" : director ? "viewer" : null,
            message: canDirect
              ? "遠端導播中"
              : "遠端檢視（家裡主持使用中）",
          });
        },
        onEngineOffline: () => {
          set({
            phase: "error",
            error: "家裡包廂已離線",
          });
        },
        onRemoteDisabled: () => {
          set({
            phase: "error",
            error: friendlyOperatorError(new Error("remote_disabled")),
          });
        },
        onSignal: (frame) => {
          void rtc?.handleSignal(frame);
        },
      });
      rtc = createBoothOperatorRtc({
        sendSignal: (frame) => client?.sendSignal(frame),
        onProgramStream: (stream) => {
          set({ tvStream: stream });
        },
      });
      operatorRtc = rtc;
      try {
        await client.connect();
        set({ phase: "open" });
        void operatorRtc.start();
      } catch (e) {
        set({
          phase: "error",
          error: friendlyOperatorError(e),
        });
      }
    },
    disconnect(): void {
      client?.disconnect();
      client = null;
      operatorRtc?.stop();
      operatorRtc = null;
      director = null;
      status = emptyStatus();
      emit();
    },
    mintInvite(): void {
      sendIntent({ type: "booth.intent.invite.mint", v: 1 });
    },
    putLiveOnTv(peerId: string, label?: string): void {
      sendIntent({
        type: "booth.intent.cast.offer",
        v: 1,
        payload: { kind: "live", peerId, label },
      });
    },
    kickPeer(peerId: string): void {
      sendIntent({
        type: "booth.intent.ejectPeer",
        v: 1,
        payload: { peerId },
      });
    },
    endBooth(): void {
      sendIntent({ type: "booth.intent.end", v: 1 });
    },
  };
}

export type BoothOperatorShell = ReturnType<typeof createBoothOperatorShell>;
