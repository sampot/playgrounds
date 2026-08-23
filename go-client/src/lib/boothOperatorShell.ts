import {
  friendlyOperatorAckError,
  friendlyOperatorError,
} from "./goFriendlyError";
import type { BoothEnvelope, BoothStateSnapshot } from "@pg/roster/boothChannel";
import type { RoomInviteDoor } from "./goRoom";
import { boothSnapshotToUi } from "./boothSnapshotUi";
import { createBoothOperatorRtc } from "./boothOperatorRtc";
import { createBoothOperatorClient } from "./boothPlatform";
import {
  attachOperatorSurface,
  detachOperatorSurface,
  mirrorOperatorShareFiles,
  syncOperatorChatTail,
} from "./boothOperatorSurface";
import type { GoLoadProgress } from "./goLoadProgress";

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
  hostPeerId: string | null;
  hostDisplayName: string | null;
  playCatalogId: string | null;
  playLoadProgress: GoLoadProgress | null;
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
    hostPeerId: null,
    hostDisplayName: null,
    playCatalogId: null,
    playLoadProgress: null,
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
  let surfaceAttached = false;
  const listeners = new Set<Listener>();

  function emit(): void {
    const snap = { ...status };
    for (const l of listeners) l(snap);
  }

  function set(partial: Partial<OperatorShellStatus>): void {
    status = { ...status, ...partial };
    emit();
  }

  function ensureSurface(): void {
    if (surfaceAttached) return;
    surfaceAttached = true;
    attachOperatorSurface({
      shellId,
      sendIntent: sendIntent,
    });
  }

  function applySnapshot(snapshot: BoothStateSnapshot): void {
    const ui = boothSnapshotToUi(snapshot);
    const canDirect = operatorCanDirect({ director, shellId });
    ensureSurface();
    syncOperatorChatTail(snapshot.chatTail);
    mirrorOperatorShareFiles(snapshot.shareFiles);
    set({
      phase: "open",
      message: canDirect ? "遠端導播中" : "遠端檢視（家裡主持使用中）",
      error: null,
      guestCount: ui.guestCount,
      inviteDoor: ui.inviteDoor,
      shortUrl: ui.shortUrl,
      inviteExpiresAt: ui.inviteExpiresAt,
      occupantPeers: ui.occupantPeers,
      occupantNames: ui.occupantNames,
      peerName: ui.occupantNames[0] ?? null,
      hostPeerId: ui.hostPeerId,
      hostDisplayName: ui.hostDisplayName,
      playCatalogId: ui.playCatalogId,
      tvOn: ui.tvOn,
      tvLabel: ui.tvLabel,
      tvStream: ui.tvOn ? status.tvStream : null,
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
      if (surfaceAttached) {
        detachOperatorSurface();
        surfaceAttached = false;
      }
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
    putFileOnTv(fileId: string, scope: "share" | "private" = "share"): void {
      sendIntent({
        type: "booth.intent.cast.offer",
        v: 1,
        payload: { kind: "file", id: fileId, scope },
      });
    },
    stopTv(): void {
      sendIntent({ type: "booth.intent.cast.unoffer", v: 1 });
    },
    haltLive(peerId: string, layer: "audio" | "video"): void {
      sendIntent({
        type: "booth.intent.live.halt",
        v: 1,
        payload: { peerId, layer },
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
    async startAutoPlay(catalogId: string): Promise<
      | { ok: true }
      | { ok: false; reason: string; missingRoles?: string[] }
    > {
      sendIntent({
        type: "booth.intent.play.start",
        v: 1,
        payload: { catalogId, mode: "auto" },
      });
      return { ok: true };
    },
    async startManualPlay(
      catalogId: string,
      picks: { role: string; peerId: string }[]
    ): Promise<
      | { ok: true }
      | { ok: false; reason: string; missingRoles?: string[] }
    > {
      sendIntent({
        type: "booth.intent.play.start",
        v: 1,
        payload: { catalogId, mode: "manual", seats: picks },
      });
      return { ok: true };
    },
    async endPlay(): Promise<{ ok: true } | { ok: false; reason: string }> {
      sendIntent({ type: "booth.intent.play.end", v: 1 });
      return { ok: true };
    },
  };
}

export type BoothOperatorShell = ReturnType<typeof createBoothOperatorShell>;
