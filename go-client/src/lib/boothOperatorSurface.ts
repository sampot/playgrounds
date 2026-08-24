/**
 * Operator Shell ↔ GoRoomSurface bridges (chat timeline, share/private mirrors).
 */

import {
  GO_ROOM_QUICK_REPLIES,
  roomHostDisplayName,
} from "./goRoom";
import { goAuth } from "./goAuth.svelte";
import { goRoomFiles } from "./goRoomFiles.svelte";
import { goRoomPrivateFiles } from "./goRoomPrivateFiles.svelte";
import { goSessionChat } from "./goSessionChat.svelte";
import type { BoothFileSummary } from "@pg/roster/boothChannel";
import { isSessionChatMessage } from "@pg/roster/rosterSessionChat";
import { isSessionChatCtlMessage } from "@pg/roster/rosterSessionChatCtl";
import type { BoothEnvelope } from "@pg/roster/boothChannel";

export type OperatorChatSend = (frame: BoothEnvelope) => void;

export type OperatorPrivateHandlers = {
  importFiles: (files: File[]) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  mountToShare: (id: string) => Promise<string | null>;
  download: (id: string) => Promise<string | null>;
};

export type OperatorShareHandlers = {
  unshare: (id: string) => Promise<string | null>;
  download: (id: string) => Promise<string | null>;
};

export function attachOperatorSurface(opts: {
  shellId: string;
  sendIntent: OperatorChatSend;
  privateHandlers?: OperatorPrivateHandlers;
  shareHandlers?: OperatorShareHandlers;
}): void {
  const hostName =
    roomHostDisplayName(goAuth.profile)?.trim() || "主持";
  goSessionChat.attach({
    localAgentId: opts.shellId,
    localName: hostName,
    localRole: "host",
    layout: "page",
    peers: [],
    broadcast: (msg) => {
      opts.sendIntent({
        type: "booth.intent.chat.send",
        v: 1,
        payload: { message: msg },
      });
    },
  });
  goSessionChat.setHints({
    freeText: true,
    quickReplies: [...GO_ROOM_QUICK_REPLIES],
  });
  goSessionChat.setUiPhase("active");

  if (opts.privateHandlers) {
    goRoomPrivateFiles.attachOperatorMirror({
      importFiles: opts.privateHandlers.importFiles,
      remove: opts.privateHandlers.remove,
      mountToShare: opts.privateHandlers.mountToShare,
      download: opts.privateHandlers.download,
    });
  }
  if (opts.shareHandlers) {
    goRoomFiles.attachOperatorRemote(opts.shareHandlers);
  }
}

export function detachOperatorSurface(): void {
  goSessionChat.detach();
  goRoomFiles.clearOperatorRemote();
  goRoomPrivateFiles.clearMirror();
}

export function syncOperatorChatTail(
  tail: Array<Record<string, unknown>> | undefined
): void {
  if (!tail?.length) return;
  for (const raw of tail) {
    if (isSessionChatMessage(raw)) {
      goSessionChat.onIncoming(raw);
      continue;
    }
    if (isSessionChatCtlMessage(raw)) {
      goSessionChat.onIncoming(raw);
    }
  }
}

export function mirrorOperatorShareFiles(
  files: BoothFileSummary[] | undefined,
  fileCount?: number
): void {
  const resolved =
    fileCount === 0 ? [] : (files ?? []);
  const entries = resolved.map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mime: f.mime,
    status:
      f.status === "ready"
        ? ("listed" as const)
        : f.status === "receiving"
          ? ("transferring" as const)
          : f.status === "error"
            ? ("error" as const)
            : ("listed" as const),
    received: f.status === "ready" ? f.size : 0,
    ownerId: "engine",
    ownerName: "包廂",
    mine: true,
  }));
  if (goRoomFiles.sessionFileAttached()) {
    goRoomFiles.mergeHubShareEntries(entries);
    return;
  }
  goRoomFiles.setMirrorEntries(entries);
}

export function mirrorOperatorPrivateFiles(
  files: BoothFileSummary[] | undefined,
  fileCount?: number
): void {
  const resolved =
    fileCount === 0 ? [] : (files ?? []);
  goRoomPrivateFiles.setMirrorEntries(
    resolved.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mime: f.mime ?? "application/octet-stream",
      createdAt: 0,
    }))
  );
}
