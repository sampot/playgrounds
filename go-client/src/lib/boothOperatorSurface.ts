/**
 * Operator Shell ↔ GoRoomSurface bridges (chat timeline, share-file mirror).
 */

import {
  GO_ROOM_QUICK_REPLIES,
  roomHostDisplayName,
} from "./goRoom";
import { goAuth } from "./goAuth.svelte";
import { goRoomFiles } from "./goRoomFiles.svelte";
import { goSessionChat } from "./goSessionChat.svelte";
import type { BoothShareFileSummary } from "@pg/roster/boothChannel";
import { isSessionChatMessage } from "@pg/roster/rosterSessionChat";
import { isSessionChatCtlMessage } from "@pg/roster/rosterSessionChatCtl";
import type { BoothEnvelope } from "@pg/roster/boothChannel";

export type OperatorChatSend = (frame: BoothEnvelope) => void;

export function attachOperatorSurface(opts: {
  shellId: string;
  sendIntent: OperatorChatSend;
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
}

export function detachOperatorSurface(): void {
  goSessionChat.detach();
  goRoomFiles.clearMirrorEntries();
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
  files: BoothShareFileSummary[] | undefined
): void {
  goRoomFiles.setMirrorEntries(
    (files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mime: f.mime,
      status: f.status,
      received: f.status === "ready" ? f.size : 0,
      ownerId: "engine",
      ownerName: "包廂",
      local: false,
    }))
  );
}
