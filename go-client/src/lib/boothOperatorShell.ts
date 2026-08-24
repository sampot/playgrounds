import {
  friendlyOperatorAckError,
  friendlyOperatorError,
} from "./goFriendlyError";
import type { BoothEnvelope, BoothStateSnapshot } from "@pg/roster/boothChannel";
import type { RoomInviteDoor, RoomOccupantPeer } from "./goRoom";
import {
  boothSnapshotToUi,
  boothAnchorStatusLabel,
  boothCastProgramClock,
} from "./boothSnapshotUi";
import { createBoothOperatorRtc } from "./boothOperatorRtc";
import { createOperatorPresence } from "./boothOperatorPresence";
import { createBoothOperatorClient } from "./boothPlatform";
import {
  operatorPeerIdForShell,
} from "./roomOperatorSlot";
import { goAuth } from "./goAuth.svelte";
import {
  createBoothOwnerFileClient,
  type OwnerFileAckPayload,
} from "./boothOwnerFileChannel";
import {
  attachOperatorSurface,
  detachOperatorSurface,
  mirrorOperatorPrivateFiles,
  mirrorOperatorShareFiles,
  syncOperatorChatTail,
} from "./boothOperatorSurface";
import { goRoomPrivateFiles } from "./goRoomPrivateFiles.svelte";
import { goRoomFiles } from "./goRoomFiles.svelte";
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
  occupantPeers: RoomOccupantPeer[];
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
  localCamera: boolean;
  localMic: boolean;
  lastAck: string | null;
  tvStream: MediaStream | null;
  anchor: BoothStateSnapshot["anchor"];
  anchorHint: string | null;
  programTransport: boolean;
  programPaused: boolean;
  programTime: number;
  programDuration: number;
};

type Listener = (s: OperatorShellStatus) => void;

const ACK_WAIT_MS = 45_000;

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
    localCamera: false,
    localMic: false,
    lastAck: null,
    tvStream: null,
    anchor: "registering",
    anchorHint: null,
    programTransport: false,
    programPaused: true,
    programTime: 0,
    programDuration: 0,
  };
}

export function operatorCanDirect(input: {
  director?: { shellId: string; role: string } | null;
  shellId: string;
}): boolean {
  const d = input.director;
  return Boolean(d && d.shellId === input.shellId && d.role === "operator");
}

export function operatorLocalDisplayName(): string {
  const profile = goAuth.profile;
  const name =
    profile?.display_name?.trim() ||
    profile?.name?.trim() ||
    profile?.user_id?.trim();
  return name || "遠端";
}

export function createBoothOperatorShell(opts: { operatorCap: string }) {
  const shellId = `op-${crypto.randomUUID().slice(0, 8)}`;
  let status = emptyStatus();
  let client: ReturnType<typeof createBoothOperatorClient> | null = null;
  let operatorRtc: ReturnType<typeof createBoothOperatorRtc> | null = null;
  let operatorPresence: ReturnType<typeof createOperatorPresence> | null = null;
  let ownerFileClient: ReturnType<typeof createBoothOwnerFileClient> | null =
    null;
  let ownerDc: RTCDataChannel | null = null;
  let director: { shellId: string; role: string } | null = null;
  let surfaceAttached = false;
  const listeners = new Set<Listener>();
  const pendingAcks = new Map<
    string,
    {
      resolve: (payload?: OwnerFileAckPayload) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  function emit(): void {
    const snap = { ...status };
    for (const l of listeners) l(snap);
  }

  function set(partial: Partial<OperatorShellStatus>): void {
    status = { ...status, ...partial };
    emit();
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

  function waitForAck(id: string): Promise<OwnerFileAckPayload | undefined> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingAcks.delete(id);
        reject(new Error("ack_timeout"));
      }, ACK_WAIT_MS);
      pendingAcks.set(id, { resolve, reject, timer });
    });
  }

  async function sendIntentForAck(
    frame: BoothEnvelope
  ): Promise<OwnerFileAckPayload | undefined> {
    const id = frame.id ?? crypto.randomUUID();
    const wait = waitForAck(id);
    sendIntent({ ...frame, id });
    return wait;
  }

  function ensureOwnerFileClient(): ReturnType<
    typeof createBoothOwnerFileClient
  > | null {
    if (!ownerDc || ownerDc.readyState !== "open") return null;
    ownerFileClient ??= createBoothOwnerFileClient({
      send: (text) => ownerDc?.send(text),
    });
    return ownerFileClient;
  }

  async function importPrivateFiles(
    files: File[]
  ): Promise<string | null> {
    const owner = ensureOwnerFileClient();
    if (!owner) return "遠端檔案通道尚未就緒";
    for (const file of files) {
      try {
        const ack = await sendIntentForAck({
          type: "booth.intent.private.import",
          v: 1,
          payload: {
            name: file.name,
            size: file.size,
            mime: file.type || undefined,
          },
        });
        if (!ack?.transferId) return "無法上傳到包廂";
        await owner.upload(ack.transferId, file);
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }
    return null;
  }

  async function removePrivate(id: string): Promise<void> {
    await sendIntentForAck({
      type: "booth.intent.private.remove",
      v: 1,
      payload: { id },
    });
  }

  async function mountPrivateToShare(id: string): Promise<string | null> {
    try {
      await sendIntentForAck({
        type: "booth.intent.private.mountToShare",
        v: 1,
        payload: { id },
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  async function downloadPrivate(id: string): Promise<string | null> {
    const owner = ensureOwnerFileClient();
    if (!owner) return "遠端檔案通道尚未就緒";
    try {
      const ack = await sendIntentForAck({
        type: "booth.intent.private.fetch",
        v: 1,
        payload: { id },
      });
      if (!ack?.transferId) return "無法從包廂下載";
      const blob = await owner.receive(ack.transferId);
      const name =
        goRoomPrivateFiles.entries.find((e) => e.id === id)?.name ?? "download";
      if (typeof document === "undefined") return null;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.rel = "noopener";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  async function importShareFiles(files: File[]): Promise<string | null> {
    const owner = ensureOwnerFileClient();
    if (!owner) return "遠端檔案通道尚未就緒";
    for (const file of files) {
      try {
        const ack = await sendIntentForAck({
          type: "booth.intent.share.import",
          v: 1,
          payload: {
            name: file.name,
            size: file.size,
            mime: file.type || undefined,
          },
        });
        if (!ack?.transferId) return "無法上傳到包廂";
        await owner.upload(ack.transferId, file);
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }
    return null;
  }

  async function unshareShare(id: string): Promise<string | null> {
    try {
      await sendIntentForAck({
        type: "booth.intent.share.unshare",
        v: 1,
        payload: { id },
      });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  async function downloadShare(id: string): Promise<string | null> {
    const owner = ensureOwnerFileClient();
    if (!owner) return "遠端檔案通道尚未就緒";
    try {
      const ack = await sendIntentForAck({
        type: "booth.intent.share.fetch",
        v: 1,
        payload: { id },
      });
      if (!ack?.transferId) return "無法從包廂下載";
      const blob = await owner.receive(ack.transferId);
      const name =
        goRoomFiles.entries.find((e) => e.id === id)?.name ?? "download";
      if (typeof document === "undefined") return null;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.rel = "noopener";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  function ensureSurface(): void {
    if (surfaceAttached) return;
    surfaceAttached = true;
    attachOperatorSurface({
      shellId,
      sendIntent,
      privateHandlers: {
        importFiles: importPrivateFiles,
        remove: removePrivate,
        mountToShare: mountPrivateToShare,
        download: downloadPrivate,
      },
      shareHandlers: {
        importFiles: importShareFiles,
        unshare: unshareShare,
        download: downloadShare,
      },
    });
  }

  function operatorPeerId(): string {
    return operatorPeerIdForShell(shellId);
  }

  function ensureOperatorPresence(): ReturnType<
    typeof createOperatorPresence
  > | null {
    if (!operatorRtc) return null;
    operatorPresence ??= createOperatorPresence({
      peerId: operatorPeerId(),
      getPc: () => operatorRtc?.getPc() ?? null,
      send: (data) => operatorRtc?.sendRoster(data),
      onChange: (state) => {
        set({
          localCamera: state.camera,
          localMic: state.mic,
        });
      },
    });
    return operatorPresence;
  }

  function applySnapshot(snapshot: BoothStateSnapshot): void {
    const ui = boothSnapshotToUi(snapshot);
    const canDirect = operatorCanDirect({ director, shellId });
    const programClock = boothCastProgramClock(snapshot.cast);
    ensureSurface();
    syncOperatorChatTail(snapshot.chatTail);
    mirrorOperatorShareFiles(snapshot.shareFiles);
    mirrorOperatorPrivateFiles(snapshot.privateFiles);
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
      anchor: snapshot.anchor,
      anchorHint: boothAnchorStatusLabel(snapshot.anchor),
      programTransport: programClock.transport,
      programPaused: programClock.paused,
      programTime: programClock.time,
      programDuration: programClock.duration,
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
        onAck: (id, ok, err, payload) => {
          if (id) {
            const pending = pendingAcks.get(id);
            if (pending) {
              clearTimeout(pending.timer);
              pendingAcks.delete(id);
              if (ok) {
                pending.resolve(payload as OwnerFileAckPayload | undefined);
              } else {
                pending.reject(
                  new Error(err ?? friendlyOperatorAckError(err))
                );
              }
            }
          }
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
        localPresence: {
          agentId: operatorPeerId(),
          name: operatorLocalDisplayName(),
        },
        onProgramStream: (stream) => {
          set({ tvStream: stream });
        },
        onOwnerChannel: (dc) => {
          ownerDc = dc;
          ownerFileClient = null;
          dc.onmessage = (ev) => {
            const text = typeof ev.data === "string" ? ev.data : "";
            if (!text) return;
            ensureOwnerFileClient()?.handleMessage(text);
          };
          dc.onclose = () => {
            if (ownerDc === dc) {
              ownerDc = null;
              ownerFileClient = null;
            }
          };
        },
      });
      operatorRtc = rtc;
      ensureOperatorPresence();
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
      for (const pending of pendingAcks.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("disconnected"));
      }
      pendingAcks.clear();
      void operatorPresence?.dispose();
      operatorPresence = null;
      client?.disconnect();
      client = null;
      operatorRtc?.stop();
      operatorRtc = null;
      ownerDc = null;
      ownerFileClient = null;
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
    revokeInvite(): void {
      sendIntent({ type: "booth.intent.invite.revoke", v: 1 });
    },
    sendCastState(payload: { paused?: boolean; t?: number }): void {
      sendIntent({
        type: "booth.intent.cast.state",
        v: 1,
        payload,
      });
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
    importPrivateFiles,
    removePrivate,
    mountPrivateToShare,
    importShareFiles,
    unshareShare,
    downloadShare,
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
    async toggleCamera(): Promise<string | null> {
      const presence = ensureOperatorPresence();
      if (!presence) return "遠端連線尚未就緒";
      if (presence.getState().camera) {
        await presence.disableCamera();
        return null;
      }
      const out = await presence.enableCamera();
      return out.ok ? null : out.error;
    },
    async toggleMic(): Promise<string | null> {
      const presence = ensureOperatorPresence();
      if (!presence) return "遠端連線尚未就緒";
      if (presence.getState().mic) {
        await presence.disableMic();
        return null;
      }
      const out = await presence.enableMic();
      return out.ok ? null : out.error;
    },
    getOperatorPeerId(): string {
      return operatorPeerId();
    },
  };
}

export type BoothOperatorShell = ReturnType<typeof createBoothOperatorShell>;
