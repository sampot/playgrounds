/**
 * Hub-side presence live recording (PG-GO-ROOM-RECORD-PLAN §7).
 * Embedded Hub: MediaRecorder + OPFS stream write.
 */

import {
  buildSessionRecordMessage,
  type SessionRecordMessage,
} from "@pg/roster/rosterSessionRecord";
import type {
  RoomPrivateLibrary,
  RoomPrivateStreamWriter,
} from "./goRoomPrivateOpfs";

export type RoomRecordResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export function resolveRecordTargetPeer(
  peerId: string,
  localAgentId: string
): string {
  const t = peerId.trim();
  if (!t || t === "local") return localAgentId;
  return t;
}

/** v1: need a presence video track (camera or display share). */
export function peerHasRecordableLive(live: {
  camera: boolean;
  mic: boolean;
}): boolean {
  return live.camera;
}

export function formatRecordFileName(opts: {
  displayName: string;
  label?: string;
  now?: Date;
  ext?: string;
}): string {
  const date = opts.now ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const safeName =
    opts.displayName.trim().replace(/[/\\]/g, "_").slice(0, 40) || "live";
  const label = opts.label?.trim().replace(/[/\\]/g, "_");
  const base = label ? `${label}-${safeName}-${stamp}` : `${safeName}-${stamp}`;
  return `${base}.${opts.ext ?? "webm"}`;
}

export function pickRecorderMime(
  MediaRecorderCtor: typeof MediaRecorder | undefined
): string | undefined {
  if (!MediaRecorderCtor) return undefined;
  const candidates = ["video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((m) => MediaRecorderCtor.isTypeSupported(m));
}

type ActiveRecord = {
  peerId: string;
  displayName: string;
  startedAt: number;
  recorder: MediaRecorder;
  writer: RoomPrivateStreamWriter;
  finalizePromise: Promise<void> | null;
};

export type PresenceRecordHub = {
  recordingPeerIds(): string[];
  start(
    peerId: string,
    displayName: string,
    label?: string
  ): Promise<RoomRecordResult>;
  stop(peerId: string): Promise<RoomRecordResult>;
  stopAll(): Promise<void>;
  onPeerGone(peerId: string): Promise<void>;
  onNotify(msg: SessionRecordMessage): void;
  dispose(): void;
};

export function createPresenceRecordHub(opts: {
  localAgentId: string;
  privateLibrary: RoomPrivateLibrary;
  getLive: (peerId: string) => { camera: boolean; mic: boolean } | null;
  getPresenceStream: (peerId: string) => MediaStream | null;
  sendJson: (msg: SessionRecordMessage) => void;
  onRecordingDone?: () => void;
  MediaRecorder?: typeof MediaRecorder;
  now?: () => number;
}): PresenceRecordHub {
  const MediaRecorderCtor = opts.MediaRecorder ?? globalThis.MediaRecorder;
  const now = opts.now ?? (() => Date.now());
  const active = new Map<string, ActiveRecord>();
  const notified = new Set<string>();

  function fanoutNotify(targetPeer: string, activeFlag: boolean): void {
    if (activeFlag) notified.add(targetPeer);
    else notified.delete(targetPeer);
    opts.sendJson(
      buildSessionRecordMessage({
        op: "notify",
        from: opts.localAgentId,
        targetPeer,
        active: activeFlag,
      })
    );
  }

  function fanoutError(
    targetPeer: string,
    code: SessionRecordMessage["code"],
    reason?: string
  ): void {
    opts.sendJson(
      buildSessionRecordMessage({
        op: "error",
        from: opts.localAgentId,
        targetPeer,
        code,
        reason,
      })
    );
  }

  async function finalizeSession(
    rec: ActiveRecord,
    opts2: { peerGone?: boolean } = {}
  ): Promise<void> {
    if (rec.finalizePromise) return rec.finalizePromise;
    rec.finalizePromise = (async () => {
      fanoutNotify(rec.peerId, false);
      active.delete(rec.peerId);
      const out = await rec.writer.finalize();
      if (!out.ok) {
        fanoutError(
          rec.peerId,
          opts2.peerGone ? "peer_gone" : "encoder_failed",
          out.error
        );
        return;
      }
      opts.sendJson(
        buildSessionRecordMessage({
          op: "done",
          from: opts.localAgentId,
          targetPeer: rec.peerId,
          privateId: out.entry.id,
          name: out.entry.name,
          mime: out.entry.mime,
          size: out.entry.size,
          duration: Math.max(0, (now() - rec.startedAt) / 1000),
        })
      );
      opts.onRecordingDone?.();
    })();
    return rec.finalizePromise;
  }

  return {
    recordingPeerIds() {
      return [...active.keys()];
    },
    async start(peerId, displayName, label) {
      const target = resolveRecordTargetPeer(peerId, opts.localAgentId);
      if (active.has(target)) {
        fanoutError(target, "already_recording");
        return { ok: false, error: "已在錄影", code: "already_recording" };
      }
      const live = opts.getLive(target);
      if (!live || !peerHasRecordableLive(live)) {
        fanoutError(target, "peer_not_live", "對方沒有開鏡頭");
        return { ok: false, error: "對方沒有開鏡頭", code: "peer_not_live" };
      }
      if (!opts.privateLibrary.supported) {
        fanoutError(target, "storage_full", "這台瀏覽器沒有私有片庫");
        return { ok: false, error: "這台瀏覽器沒有私有片庫", code: "storage_full" };
      }
      const mime = pickRecorderMime(MediaRecorderCtor);
      if (!mime || !MediaRecorderCtor) {
        fanoutError(target, "encoder_failed", "這台瀏覽器無法錄影");
        return { ok: false, error: "這台瀏覽器無法錄影", code: "encoder_failed" };
      }
      const stream = opts.getPresenceStream(target);
      if (!stream || stream.getVideoTracks().length === 0) {
        fanoutError(target, "peer_not_live", "還沒收到鏡頭畫面");
        return { ok: false, error: "還沒收到鏡頭畫面", code: "peer_not_live" };
      }
      const fileName = formatRecordFileName({
        displayName: displayName.trim() || "live",
        label,
        now: new Date(now()),
        ext: mime.includes("webm") ? "webm" : "webm",
      });
      const opened = await opts.privateLibrary.openStreamWrite({
        name: fileName,
        mime,
      });
      if (!opened.ok) {
        fanoutError(target, "storage_full", opened.error);
        return { ok: false, error: opened.error, code: "storage_full" };
      }
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorderCtor(stream, { mimeType: mime });
      } catch {
        await opened.writer.abort();
        fanoutError(target, "encoder_failed", "無法開始錄影");
        return { ok: false, error: "無法開始錄影", code: "encoder_failed" };
      }
      const session: ActiveRecord = {
        peerId: target,
        displayName,
        startedAt: now(),
        recorder,
        writer: opened.writer,
        finalizePromise: null,
      };
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          void opened.writer.writeChunk(ev.data);
        }
      };
      recorder.onerror = () => {
        void opened.writer.abort();
        active.delete(target);
        fanoutNotify(target, false);
        fanoutError(target, "encoder_failed");
      };
      recorder.onstop = () => {
        void finalizeSession(session);
      };
      active.set(target, session);
      recorder.start(1000);
      fanoutNotify(target, true);
      return { ok: true };
    },
    async stop(peerId) {
      const target = resolveRecordTargetPeer(peerId, opts.localAgentId);
      const rec = active.get(target);
      if (!rec) return { ok: true };
      if (rec.recorder.state !== "inactive") {
        try {
          rec.recorder.stop();
        } catch {
          await rec.writer.abort();
          active.delete(target);
          fanoutNotify(target, false);
          return { ok: false, error: "停止錄影失敗", code: "encoder_failed" };
        }
      } else {
        await finalizeSession(rec);
      }
      return { ok: true };
    },
    async stopAll() {
      const ids = [...active.keys()];
      await Promise.all(ids.map((id) => this.stop(id)));
    },
    async onPeerGone(peerId) {
      const target = resolveRecordTargetPeer(peerId, opts.localAgentId);
      const rec = active.get(target);
      if (!rec) return;
      if (rec.recorder.state !== "inactive") {
        try {
          rec.recorder.stop();
        } catch {
          await rec.writer.abort();
          active.delete(target);
          fanoutNotify(target, false);
          fanoutError(target, "peer_gone");
        }
      } else {
        await finalizeSession(rec, { peerGone: true });
      }
    },
    onNotify(msg) {
      if (msg.op !== "notify" || !msg.targetPeer) return;
      if (msg.active) notified.add(msg.targetPeer);
      else notified.delete(msg.targetPeer);
    },
    dispose() {
      for (const rec of active.values()) {
        try {
          if (rec.recorder.state !== "inactive") rec.recorder.stop();
        } catch {
          void rec.writer.abort();
        }
      }
      active.clear();
      notified.clear();
    },
  };
}

/** Guest-side recording badge set from session_record.notify fanout. */
export function applyRecordNotify(
  notified: Set<string>,
  msg: SessionRecordMessage
): Set<string> {
  if (msg.op !== "notify" || !msg.targetPeer) return notified;
  const next = new Set(notified);
  if (msg.active) next.add(msg.targetPeer);
  else next.delete(msg.targetPeer);
  return next;
}

export function recordingPeerIdsFromNotified(notified: ReadonlySet<string>): string[] {
  return [...notified];
}
