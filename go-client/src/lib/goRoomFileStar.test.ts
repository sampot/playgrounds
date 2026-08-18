import { describe, expect, it } from "vitest";
import {
  SESSION_FILE_TYPE,
  encodeSessionFileChunk,
} from "@pg/roster/rosterSessionFile";
import { createRoomFileStarHub } from "./goRoomFileStar";

function peerLog() {
  const json: unknown[] = [];
  const bins: ArrayBuffer[] = [];
  return {
    json,
    bins,
    peer: (id: string) => ({
      peerId: id,
      sendJson: (m: unknown) => json.push(m),
      sendBinary: (b: ArrayBuffer) => bins.push(b),
      bufferedAmount: () => 0,
    }),
  };
}

describe("createRoomFileStarHub", () => {
  it("fans out share, routes request to owner, and does not leak chunks to a third peer", () => {
    const listings = new Map<string, string>([["file-1", "peer-a"]]);
    const applied: unknown[] = [];
    const a = peerLog();
    const b = peerLog();
    const c = peerLog();
    const hub = createRoomFileStarHub({
      localAgentId: "host",
      listingOwner: (id) => listings.get(id) ?? null,
      catalogItems: () => [
        {
          id: "file-1",
          name: "note.txt",
          size: 3,
          owner: "peer-a",
          ownerName: "甲",
        },
      ],
      applyControl: (d) => applied.push(d),
      applyBinary: () => {},
      forgetOwner: (id) => {
        const gone = [...listings].filter(([, o]) => o === id).map(([k]) => k);
        for (const k of gone) listings.delete(k);
        return gone;
      },
    });
    hub.addPeer(a.peer("peer-a"));
    hub.addPeer(b.peer("peer-b"));
    hub.addPeer(c.peer("peer-c"));
    expect(b.json.some((m) => (m as { op?: string }).op === "catalog")).toBe(
      true
    );

    hub.onPeerControl("peer-a", {
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "note.txt",
      size: 3,
      owner: "peer-a",
    });
    expect(b.json.some((m) => (m as { op?: string }).op === "share")).toBe(true);
    expect(c.json.some((m) => (m as { op?: string }).op === "share")).toBe(true);
    expect(a.json.some((m) => (m as { op?: string }).op === "share")).toBe(
      false
    );

    const beforeC = c.bins.length;
    hub.onPeerControl("peer-b", {
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-1",
      from: "peer-b",
    });
    expect(a.json.some((m) => (m as { op?: string }).op === "request")).toBe(
      true
    );
    expect(c.json.some((m) => (m as { op?: string }).op === "request")).toBe(
      false
    );

    hub.onPeerBinary(
      "peer-a",
      encodeSessionFileChunk({
        transferId: "tr-1",
        seq: 0,
        payload: new Uint8Array([1, 2, 3]),
      })
    );
    expect(b.bins).toHaveLength(1);
    expect(c.bins.length).toBe(beforeC);
    expect(a.bins).toHaveLength(0);
  });
});
