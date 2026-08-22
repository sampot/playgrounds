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

  it("routes concurrent downloads to two guests without cross-leak", () => {
    const listings = new Map<string, string>([["note-1", "host"]]);
    const hostBins: ArrayBuffer[] = [];
    const applied: unknown[] = [];
    const b = peerLog();
    const c = peerLog();
    const hub = createRoomFileStarHub({
      localAgentId: "host",
      listingOwner: (id) => listings.get(id) ?? null,
      catalogItems: () => [
        {
          id: "note-1",
          name: "note.txt",
          size: 4,
          owner: "host",
          ownerName: "主持",
        },
      ],
      applyControl: (d) => applied.push(d),
      applyBinary: (buf) => hostBins.push(buf),
      forgetOwner: () => [],
    });
    hub.addPeer(b.peer("peer-b"));
    hub.addPeer(c.peer("peer-c"));

    hub.onPeerControl("peer-b", {
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "note-1",
      transferId: "tr-b",
      from: "peer-b",
    });
    hub.onPeerControl("peer-c", {
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "note-1",
      transferId: "tr-c",
      from: "peer-c",
    });
    expect(applied.filter((m) => (m as { op?: string }).op === "request")).toHaveLength(
      2
    );

    hub.outboundBinary(
      encodeSessionFileChunk({
        transferId: "tr-b",
        seq: 0,
        payload: new Uint8Array([1, 2]),
      })
    );
    hub.outboundBinary(
      encodeSessionFileChunk({
        transferId: "tr-c",
        seq: 0,
        payload: new Uint8Array([9, 8]),
      })
    );
    expect(b.bins).toHaveLength(1);
    expect(c.bins).toHaveLength(1);
    expect(b.bins[0]).not.toBe(c.bins[0]);
    const bPay = new Uint8Array(b.bins[0]!).slice(-2);
    const cPay = new Uint8Array(c.bins[0]!).slice(-2);
    expect([...bPay]).toEqual([1, 2]);
    expect([...cPay]).toEqual([9, 8]);
  });

  it("reports bufferedAmount for the dest peer of each concurrent transfer", () => {
    const listings = new Map<string, string>([["note-1", "host"]]);
    const amounts = new Map<string, number>([
      ["peer-b", 100],
      ["peer-c", 9000],
    ]);
    const hub = createRoomFileStarHub({
      localAgentId: "host",
      listingOwner: (id) => listings.get(id) ?? null,
      catalogItems: () => [],
      applyControl: () => {},
      applyBinary: () => {},
      forgetOwner: () => [],
    });
    hub.addPeer({
      peerId: "peer-b",
      sendJson: () => {},
      sendBinary: () => {},
      bufferedAmount: () => amounts.get("peer-b") ?? 0,
    });
    hub.addPeer({
      peerId: "peer-c",
      sendJson: () => {},
      sendBinary: () => {},
      bufferedAmount: () => amounts.get("peer-c") ?? 0,
    });
    hub.onPeerControl("peer-b", {
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "note-1",
      transferId: "tr-b",
      from: "peer-b",
    });
    hub.onPeerControl("peer-c", {
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "note-1",
      transferId: "tr-c",
      from: "peer-c",
    });
    expect(hub.requesterBufferedAmount("peer-b")).toBe(100);
    expect(hub.requesterBufferedAmount("peer-c")).toBe(9000);
    expect(hub.requesterBufferedAmount()).toBe(9000);
  });
});
