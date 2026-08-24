import {
  friendlyOperatorAckError,
  friendlyOperatorError,
} from "./goFriendlyError";
import { captureProgramFromBlob } from "./goRoomMedia";
import { OperatorFileProgram, castFileScope } from "./operatorFileProgram";
import {
  isRtcDataChannelQueueFullError,
  isRtcMaxMessageSizeError,
  waitForOpenOwnerDataChannel,
} from "./boothOwnerFileWire";
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
import { chromeSession } from "./chromeSession.svelte";
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
import { ensureRoomFileSw } from "./goRoomPlayBridge";
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
const RTC_CHANNEL_WAIT_MS = 30_000;

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

  let rosterChannelOpen = false;
  let ownerChannelOpen = false;
  let rtcReady = false;
  let pendingSnapshot: BoothStateSnapshot | null = null;
  let rtcWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionFileAttached = false;
  let rtcProgramStream: MediaStream | null = null;

  const fileProgram = new OperatorFileProgram({
    fetchFile: async (id, scope) => fetchHubCastFile(id, scope),
    capture: captureProgramFromBlob,
    onStream(stream) {
      if (stream) {
        set({ tvStream: stream });
        return;
      }
      set({ tvStream: status.tvOn ? rtcProgramStream : null });
    },
    onError(message) {
      chromeSession.setFlash(message, 3200);
    },
  });

  async function fetchHubCastFile(
    id: string,
    scope: ReturnType<typeof castFileScope>
  ): Promise<File | null> {
    const owner = await ensureOwnerFileClient();
    if (!owner) return null;
    const intentType =
      scope === "private"
        ? "booth.intent.private.fetch"
        : "booth.intent.share.fetch";
    try {
      const ack = await sendIntentForAck({
        type: intentType,
        v: 1,
        payload: { id },
      });
      if (!ack?.transferId) return null;
      const blob = await owner.receive(ack.transferId);
      const name =
        (scope === "private"
          ? goRoomPrivateFiles.entries.find((e) => e.id === id)?.name
          : goRoomFiles.entries.find((e) => e.id === id)?.name) ?? "program";
      return new File([blob], name, {
        type: blob.type || "application/octet-stream",
      });
    } catch {
      return null;
    }
  }

  async function syncOperatorFileCast(
    cast: BoothStateSnapshot["cast"] | undefined
  ): Promise<void> {
    if (!rtcReady) return;
    await fileProgram.syncCast(cast);
  }

  function clearRtcWaitTimer(): void {
    if (rtcWaitTimer) {
      clearTimeout(rtcWaitTimer);
      rtcWaitTimer = null;
    }
  }

  function resetRtcReadiness(): void {
    clearRtcWaitTimer();
    rosterChannelOpen = false;
    ownerChannelOpen = false;
    rtcReady = false;
    pendingSnapshot = null;
  }

  function operatorOpenMessage(): string {
    return operatorCanDirect({ director, shellId })
      ? "遠端導播中"
      : "遠端檢視（家裡主持使用中）";
  }

  function handleOperatorLinkLost(): void {
    resetRtcReadiness();
    ownerDc = null;
    ownerFileClient = null;
    if (status.phase === "open" || status.phase === "connecting") {
      set({
        phase: "error",
        error: "與包廂的 WebRTC 連線已中斷",
      });
    }
  }

  function markRosterChannelOpen(): void {
    rosterChannelOpen = true;
    tryPromoteToOpen();
  }

  function markOwnerChannelOpen(): void {
    ownerChannelOpen = true;
    tryPromoteToOpen();
  }

  function tryPromoteToOpen(): void {
    if (rtcReady || !rosterChannelOpen || !ownerChannelOpen) return;
    rtcReady = true;
    clearRtcWaitTimer();
    wireOperatorSessionFile();
    const snap = pendingSnapshot;
    if (snap) {
      publishSnapshot(snap);
    } else {
      set({
        phase: "open",
        message: operatorOpenMessage(),
        error: null,
      });
    }
  }

  function startRtcWaitTimer(): void {
    clearRtcWaitTimer();
    rtcWaitTimer = setTimeout(() => {
      rtcWaitTimer = null;
      if (!rtcReady && status.phase === "connecting") {
        set({
          phase: "error",
          error: "無法建立與包廂的 WebRTC 通道",
        });
      }
    }, RTC_CHANNEL_WAIT_MS);
  }

  function wireOperatorSessionFile(): void {
    if (sessionFileAttached || !operatorRtc) return;
    sessionFileAttached = true;
    goRoomFiles.attach({
      localAgentId: operatorPeerId(),
      localName: operatorLocalDisplayName(),
      sendJson: (msg) => operatorRtc?.sendRoster(msg),
      sendBinary: (buf) => operatorRtc?.sendRosterBinary(buf),
      bufferedAmount: () => operatorRtc?.rosterBufferedAmount() ?? 0,
    });
    void ensureRoomFileSw();
  }

  function detachOperatorSessionFile(): void {
    if (!sessionFileAttached) return;
    sessionFileAttached = false;
    goRoomFiles.detach();
  }

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

  function bindOwnerFileClient(
    dc: RTCDataChannel
  ): ReturnType<typeof createBoothOwnerFileClient> {
    ownerDc = dc;
    ownerFileClient ??= createBoothOwnerFileClient({
      send: (text) => {
        if (ownerDc?.readyState !== "open") {
          throw new Error("owner_dc_not_ready");
        }
        ownerDc.send(text);
      },
      bufferedAmount: () => ownerDc?.bufferedAmount ?? 0,
    });
    return ownerFileClient;
  }

  async function ensureOwnerFileClient(): Promise<ReturnType<
    typeof createBoothOwnerFileClient
  > | null> {
    const dc = await waitForOpenOwnerDataChannel(() => ownerDc);
    if (!dc) return null;
    return bindOwnerFileClient(dc);
  }

  function operatorFileError(err: unknown): string {
    if (isRtcDataChannelQueueFullError(err)) {
      return "檔案通道忙碌中，請稍候再試（可先等傳檔完成）。";
    }
    if (isRtcMaxMessageSizeError(err)) {
      return "檔案通道封包過大，請更新用戶端後再試。";
    }
    return err instanceof Error ? err.message : String(err);
  }

  async function importPrivateFiles(
    files: File[]
  ): Promise<string | null> {
    const owner = await ensureOwnerFileClient();
    if (!owner) return "遠端檔案通道尚未就緒（請等連線完成後再試）";
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
        return operatorFileError(e);
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
      return operatorFileError(e);
    }
  }

  async function downloadPrivate(id: string): Promise<string | null> {
    const owner = await ensureOwnerFileClient();
    if (!owner) return "遠端檔案通道尚未就緒（請等連線完成後再試）";
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
      return operatorFileError(e);
    }
  }

  async function importShareFiles(files: File[]): Promise<string | null> {
    if (!sessionFileAttached) {
      return "分享通道尚未就緒（請等連線完成後再試）";
    }
    for (const file of files) {
      const result = await goRoomFiles.shareLocalFile(file);
      if (!result.ok) return result.error;
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
      return operatorFileError(e);
    }
  }

  async function downloadShare(id: string): Promise<string | null> {
    const owner = await ensureOwnerFileClient();
    if (!owner) return "遠端檔案通道尚未就緒（請等連線完成後再試）";
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
      return operatorFileError(e);
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

  function resolveOperatorTvStream(
    ui: { tvOn: boolean },
    prev: MediaStream | null
  ): MediaStream | null {
    if (!ui.tvOn) return null;
    return prev ?? rtcProgramStream;
  }

  function resolveTvLabel(
    cast: BoothStateSnapshot["cast"] | undefined,
    fallback: string | null
  ): string | null {
    if (!cast || cast.kind === "idle") return null;
    if (cast.kind === "file") {
      const id = typeof cast.id === "string" ? cast.id : "";
      const fromShare = goRoomFiles.entries.find((e) => e.id === id)?.name;
      const fromPrivate = goRoomPrivateFiles.entries.find(
        (e) => e.id === id
      )?.name;
      return fromShare ?? fromPrivate ?? fallback;
    }
    return fallback;
  }

  function resolveProgramClock(
    cast: BoothStateSnapshot["cast"] | undefined
  ): Pick<
    OperatorShellStatus,
    "programTransport" | "programPaused" | "programTime" | "programDuration"
  > {
    const hub = boothCastProgramClock(cast);
    const local = fileProgram.program?.clock?.();
    if (!local) return hub;
    return {
      programTransport: hub.transport || local.duration > 0,
      programPaused: local.paused,
      programTime: local.currentTime,
      programDuration: local.duration,
    };
  }

  function publishSnapshot(snapshot: BoothStateSnapshot): void {
    const ui = boothSnapshotToUi(snapshot);
    const canDirect = operatorCanDirect({ director, shellId });
    const programClock = resolveProgramClock(snapshot.cast);
    ensureSurface();
    syncOperatorChatTail(snapshot.chatTail);
    mirrorOperatorShareFiles(snapshot.shareFiles, snapshot.shareFileCount);
    mirrorOperatorPrivateFiles(
      snapshot.privateFiles,
      snapshot.privateFileCount
    );
    set({
      phase: "open",
      message: operatorOpenMessage(),
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
      tvLabel: resolveTvLabel(snapshot.cast, ui.tvLabel),
      tvStream: resolveOperatorTvStream(ui, status.tvStream),
      remoteLives: ui.remoteLives,
      canDirect,
      directorRole: canDirect ? "operator" : director ? "viewer" : null,
      anchor: snapshot.anchor,
      anchorHint: boothAnchorStatusLabel(snapshot.anchor),
      programTransport: programClock.programTransport,
      programPaused: programClock.programPaused,
      programTime: programClock.programTime,
      programDuration: programClock.programDuration,
    });
    void syncOperatorFileCast(snapshot.cast);
  }

  function applySnapshot(snapshot: BoothStateSnapshot): void {
    pendingSnapshot = snapshot;
    if (rtcReady) {
      publishSnapshot(snapshot);
    }
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
      resetRtcReadiness();
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
            phase: "connecting",
            canDirect,
            directorRole: canDirect ? "operator" : director ? "viewer" : null,
            message: "建立 WebRTC 通道…",
          });
        },
        onDirectorChanged: (next) => {
          director = next;
          const canDirect = operatorCanDirect({ director, shellId });
          const partial: Partial<OperatorShellStatus> = {
            canDirect,
            directorRole: canDirect ? "operator" : director ? "viewer" : null,
          };
          if (rtcReady) {
            partial.message = operatorOpenMessage();
          }
          set(partial);
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
        rosterHandlers: {
          onChannelOpen: markRosterChannelOpen,
          onChannelClose: handleOperatorLinkLost,
          onMessage: (msg) => goRoomFiles.onControl(msg),
          onBinary: (buf) => goRoomFiles.onBinary(buf),
        },
        onProgramStream: (stream) => {
          rtcProgramStream = stream ?? null;
          if (!fileProgram.program) {
            set({ tvStream: stream ?? null });
          }
        },
        onOwnerChannel: (dc) => {
          ownerDc = dc;
          ownerFileClient = null;
          dc.onmessage = (ev) => {
            const text = typeof ev.data === "string" ? ev.data : "";
            if (!text) return;
            if (dc.readyState === "open") {
              bindOwnerFileClient(dc).handleMessage(text);
            }
          };
          dc.onclose = () => {
            if (ownerDc === dc) {
              handleOperatorLinkLost();
            }
          };
          bindOwnerFileClient(dc);
          markOwnerChannelOpen();
        },
      });
      operatorRtc = rtc;
      ensureOperatorPresence();
      try {
        await client.connect();
        set({ phase: "connecting", message: "建立 WebRTC 通道…" });
        startRtcWaitTimer();
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
      resetRtcReadiness();
      detachOperatorSessionFile();
      void operatorPresence?.dispose();
      operatorPresence = null;
      client?.disconnect();
      client = null;
      operatorRtc?.stop();
      operatorRtc = null;
      ownerDc = null;
      ownerFileClient = null;
      fileProgram.stop();
      rtcProgramStream = null;
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
    startRecord(peerId: string, displayName?: string, label?: string): void {
      sendIntent({
        type: "booth.intent.record.start",
        v: 1,
        payload: { peerId, displayName, label },
      });
    },
    stopRecord(peerId: string): void {
      sendIntent({
        type: "booth.intent.record.stop",
        v: 1,
        payload: { peerId },
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
